export interface SpotifyPlaylistTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
  duration: number;
}

export interface ImportedSpotifyPlaylist {
  id: string;
  name: string;
  url: string;
  tracks: SpotifyPlaylistTrack[];
}

interface PendingAuthorization {
  state: string;
  verifier: string;
  kind: 'playlist' | 'saved-tracks';
  playlistId?: string;
  redirectUri: string;
}

const CLIENT_ID_KEY = 'sonora.spotify.client-id';
const PENDING_KEY = 'sonora.spotify.pending-auth';
let importedPlaylist: ImportedSpotifyPlaylist | null = null;
let callbackError = '';

export function getSpotifyClientId(): string {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setSpotifyClientId(value: string): void {
  try {
    if (value.trim()) localStorage.setItem(CLIENT_ID_KEY, value.trim());
    else localStorage.removeItem(CLIENT_ID_KEY);
  } catch {
    throw new Error('El navegador no permite guardar la configuración de Spotify.');
  }
}

export function getImportedSpotifyPlaylist(): ImportedSpotifyPlaylist | null {
  return importedPlaylist;
}

export function getSpotifyCallbackError(): string {
  return callbackError;
}

export function clearImportedSpotifyPlaylist(): void {
  importedPlaylist = null;
  callbackError = '';
}

export function spotifyRedirectUri(): string {
  return window.location.origin + window.location.pathname;
}

export function parseSpotifyPlaylistUrl(value: string): string | null {
  const input = value.trim();
  const uriMatch = input.match(/^spotify:playlist:([A-Za-z0-9]{10,64})$/);
  if (uriMatch) return uriMatch[1];

  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const playlistIndex = parts.lastIndexOf('playlist');
    const id = playlistIndex >= 0 ? parts[playlistIndex + 1] : undefined;
    return id && /^[A-Za-z0-9]{10,64}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function authorizeSpotifyPlaylist(clientId: string, playlistId: string): Promise<void> {
  return authorizeSpotify(clientId, { kind: 'playlist', playlistId });
}

export async function authorizeSpotifySavedTracks(clientId: string): Promise<void> {
  return authorizeSpotify(clientId, { kind: 'saved-tracks' });
}

async function authorizeSpotify(
  clientId: string,
  target: { kind: 'playlist'; playlistId: string } | { kind: 'saved-tracks' },
): Promise<void> {
  if (!clientId.trim()) throw new Error('Pega el Client ID de tu app de Spotify.');
  const redirectUri = spotifyRedirectUri();
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await createChallenge(verifier);
  const pending: PendingAuthorization = { state, verifier, redirectUri, ...target };

  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    throw new Error('El navegador no permite iniciar la autorización segura de Spotify.');
  }

  const params = new URLSearchParams({
    client_id: clientId.trim(),
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'playlist-read-private playlist-read-collaborative user-library-read',
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location.assign('https://accounts.spotify.com/authorize?' + params.toString());
}

/**
 * Completa el retorno de OAuth antes de que el router limpie la query.
 * El token y la lista permanecen solo en memoria durante esta sesión.
 */
export async function handleSpotifyOAuthCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const returnedState = params.get('state');
  const authError = params.get('error');
  if (!code && !authError) return false;

  callbackError = '';
  importedPlaylist = null;
  try {
    if (authError) {
      throw new Error(authError === 'access_denied' ? 'Cancelaste el acceso a Spotify.' : 'Spotify no autorizó esta conexión.');
    }

    let pending: PendingAuthorization | null = null;
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (raw) pending = JSON.parse(raw) as PendingAuthorization;
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      throw new Error('No encontramos la sesión segura de Spotify. Vuelve a iniciar la importación.');
    }

    if (!pending || !returnedState || returnedState !== pending.state) {
      throw new Error('La verificación de Spotify no coincide. Vuelve a iniciar la importación.');
    }
    const clientId = getSpotifyClientId();
    if (!clientId) throw new Error('Falta el Client ID guardado de tu app de Spotify.');

    if (!code) throw new Error('Spotify no devolvió el código de autorización. Vuelve a intentarlo.');

    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: pending.redirectUri,
        client_id: clientId,
        code_verifier: pending.verifier,
      }),
    });
    const tokenBody = (await tokenResponse.json()) as { access_token?: string; error_description?: string };
    if (!tokenResponse.ok || !tokenBody.access_token) {
      throw new Error(tokenBody.error_description || 'No se pudo completar el acceso a Spotify.');
    }

    const headers = { Authorization: 'Bearer ' + tokenBody.access_token };
    importedPlaylist = pending.kind === 'saved-tracks'
      ? await readSpotifySavedTracks(headers)
      : await readSpotifyPlaylist(headers, pending.playlistId ?? '');
    if (importedPlaylist.tracks.length === 0) callbackError = 'Spotify no devolvió canciones accesibles en esta selección.';
  } catch (error) {
    callbackError = error instanceof Error ? error.message : 'No se pudo importar la playlist de Spotify.';
  } finally {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // No hay datos persistentes que necesitemos conservar.
    }
    window.history.replaceState(null, '', spotifyRedirectUri() + '#/downloads');
  }
  return true;
}

async function readSpotifyPlaylist(
  headers: { Authorization: string },
  playlistId: string,
): Promise<ImportedSpotifyPlaylist> {
  if (!playlistId) throw new Error('Falta el identificador de la playlist.');

  const playlistResponse = await fetch(
    'https://api.spotify.com/v1/playlists/' + encodeURIComponent(playlistId) + '?fields=id,name,external_urls',
    { headers },
  );
  if (!playlistResponse.ok) throw spotifyApiError(playlistResponse.status);
  const playlistBody = (await playlistResponse.json()) as {
    id?: string;
    name?: string;
    external_urls?: { spotify?: string };
  };

  const tracks: SpotifyPlaylistTrack[] = [];
  let offset = 0;
  let total = 0;
  do {
    const fields = 'items(item(id,name,type,artists(name),album(name,images(url)),duration_ms)),next,total';
    const query = new URLSearchParams({ limit: '50', offset: String(offset), fields });
    const response = await fetch(
      'https://api.spotify.com/v1/playlists/' + encodeURIComponent(playlistId) + '/items?' + query.toString(),
      { headers },
    );
    if (!response.ok) throw spotifyApiError(response.status);
    const page = (await response.json()) as {
      items?: {
        item?: SpotifyApiTrack | null;
      }[];
      total?: number;
      next?: string | null;
    };
    total = page.total ?? 0;
    for (const entry of page.items ?? []) {
      const track = mapSpotifyTrack(entry.item);
      if (track) tracks.push(track);
    }
    offset += page.items?.length ?? 0;
    if (!page.items?.length || !page.next) break;
  } while (offset < total);

  return {
    id: playlistBody.id ?? playlistId,
    name: playlistBody.name ?? 'Playlist de Spotify',
    url: playlistBody.external_urls?.spotify ?? 'https://open.spotify.com/playlist/' + playlistId,
    tracks,
  };
}

async function readSpotifySavedTracks(
  headers: { Authorization: string },
): Promise<ImportedSpotifyPlaylist> {
  const tracks: SpotifyPlaylistTrack[] = [];
  let offset = 0;
  let total = 0;
  do {
    const fields = 'items(track(id,name,type,artists(name),album(name,images(url)),duration_ms)),next,total';
    const query = new URLSearchParams({ limit: '50', offset: String(offset), fields });
    const response = await fetch('https://api.spotify.com/v1/me/tracks?' + query.toString(), { headers });
    if (!response.ok) throw spotifyApiError(response.status);
    const page = (await response.json()) as {
      items?: { track?: SpotifyApiTrack | null }[];
      total?: number;
      next?: string | null;
    };
    total = page.total ?? 0;
    for (const entry of page.items ?? []) {
      const track = mapSpotifyTrack(entry.track);
      if (track) tracks.push(track);
    }
    offset += page.items?.length ?? 0;
    if (!page.items?.length || !page.next) break;
  } while (offset < total);

  return {
    id: 'spotify:saved-tracks',
    name: 'Canciones que te gustan',
    url: 'https://open.spotify.com/collection/tracks',
    tracks,
  };
}

interface SpotifyApiTrack {
  id?: string;
  name?: string;
  type?: string;
  artists?: { name?: string }[];
  album?: { name?: string; images?: { url?: string }[] };
  duration_ms?: number;
}

function mapSpotifyTrack(item: SpotifyApiTrack | null | undefined): SpotifyPlaylistTrack | null {
  if (!item?.id || !item.name || (item.type && item.type !== 'track')) return null;
  return {
    id: item.id,
    title: item.name,
    artist: item.artists?.map((artist) => artist.name).filter(Boolean).join(', ') || 'Artista desconocido',
    album: item.album?.name ?? '',
    artworkUrl: item.album?.images?.[0]?.url,
    duration: Math.round((item.duration_ms ?? 0) / 1000),
  };
}

function spotifyApiError(status: number): Error {
  if (status === 401) return new Error('La autorización de Spotify venció. Vuelve a intentarlo.');
  if (status === 403) return new Error('Spotify no permitió leer esta playlist. Debes ser su propietario o colaborador y tener acceso habilitado en la app.');
  if (status === 404) return new Error('Spotify no encontró la playlist o tu cuenta no puede acceder a ella.');
  if (status === 429) return new Error('Spotify limitó temporalmente las consultas. Espera un momento y vuelve a intentarlo.');
  return new Error('Spotify respondió con el código ' + status + '.');
}

function randomToken(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64Url(bytes);
}

async function createChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
