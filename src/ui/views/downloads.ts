import { h } from '../dom';
import { icon } from '../icons';
import { formatBytes, pluralize } from '../../lib/utils';
import { searchAllSources } from '../../sources';
import { addToPlaylist, createPlaylist, saveCandidate } from '../../state/playlists';
import { setRoute } from '../../state/store';
import { toast } from '../toast';
import {
  authorizeSpotifyPlaylist,
  authorizeSpotifySavedTracks,
  clearImportedSpotifyPlaylist,
  getImportedSpotifyPlaylist,
  getSpotifyCallbackError,
  getSpotifyClientId,
  parseSpotifyPlaylistUrl,
  setSpotifyClientId,
  spotifyRedirectUri,
  type SpotifyPlaylistTrack,
} from '../../spotify/importer';
import type { RemoteCandidate } from '../../lib/types';

let typedUrl = '';
let activeController: AbortController | null = null;

const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024;
const AUDIO_EXTENSIONS = /\.(mp3|flac|wav|ogg|oga|opus|m4a|aac|aif|aiff|webm)$/i;

export function renderDownloads(): HTMLElement {
  const view = h('div', { class: 'view view--downloads' });
  const urlInput = h('input', {
    class: 'url-download__input',
    id: 'download-url-input',
    type: 'url',
    inputMode: 'url',
    required: true,
    autocomplete: 'url',
    placeholder: 'https://sitio.com/mi-cancion.mp3',
    value: typedUrl,
    ariaLabel: 'URL directa del archivo de audio',
  }) as HTMLInputElement;
  const submitButton = h(
    'button',
    { class: 'btn btn--primary url-download__submit', type: 'submit' },
    icon('download', 18),
    'Descargar archivo',
  );
  const status = h('p', {
    class: 'url-download__status',
    role: 'status',
    ariaLive: 'polite',
    text: 'El archivo se guardará en las descargas de tu navegador.',
  });
  const progress = h('progress', {
    class: 'url-download__progress',
    max: 100,
    value: 0,
    hidden: true,
    ariaLabel: 'Progreso de descarga',
  }) as HTMLProgressElement;
  const sourceLink = h(
    'a',
    {
      class: 'url-download__source',
      href: '#',
      target: '_blank',
      rel: 'noreferrer noopener',
      hidden: true,
    },
    icon('external', 16),
    'Abrir enlace original',
  ) as HTMLAnchorElement;

  const form = h(
    'form',
    {
      class: 'url-download__form',
      on: {
        submit: (event: Event) => {
          event.preventDefault();
          void downloadUrl();
        },
      },
    },
    h(
      'label',
      { class: 'url-download__field' },
      h('span', { class: 'url-download__label', text: 'Enlace directo al archivo de audio' }),
      urlInput,
    ),
    submitButton,
  );

  urlInput.addEventListener('input', () => {
    typedUrl = urlInput.value;
    const url = parseHttpUrl(typedUrl);
    sourceLink.hidden = !url;
    if (url) sourceLink.href = url.href;
  });

  async function downloadUrl(): Promise<void> {
    const url = parseHttpUrl(urlInput.value);
    if (!url) {
      status.textContent = 'Pega una URL válida que empiece por https:// o http://.';
      urlInput.focus();
      return;
    }
    if (activeController) return;

    const controller = new AbortController();
    activeController = controller;
    submitButton.disabled = true;
    submitButton.replaceChildren(icon('download', 18), document.createTextNode('Conectando…'));
    progress.hidden = true;
    status.textContent = 'Conectando con la fuente…';

    try {
      const response = await fetch(url.href, {
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
      });
      if (!response.ok) throw new Error(`La fuente respondió con el código ${response.status}.`);

      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const looksLikeAudio =
        contentType.startsWith('audio/') ||
        /octet-stream|application\/(ogg|flac|x-flac|mpeg)/i.test(contentType) ||
        AUDIO_EXTENSIONS.test(url.pathname);
      if (!looksLikeAudio || /text\/html|application\/json/i.test(contentType)) {
        throw new Error('Ese enlace no apunta a un archivo de audio directo. Usa un enlace MP3, FLAC, WAV, OGG, M4A o similar.');
      }

      const total = Number(response.headers.get('content-length') ?? 0);
      if (total > MAX_DOWNLOAD_BYTES) {
        throw new Error('El archivo supera el límite de 250 MB para una descarga desde Sonora.');
      }

      const chunks: Uint8Array[] = [];
      let received = 0;
      const reader = response.body?.getReader();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          received += value.byteLength;
          if (received > MAX_DOWNLOAD_BYTES) {
            await reader.cancel();
            throw new Error('El archivo supera el límite de 250 MB para una descarga desde Sonora.');
          }
          chunks.push(value);
          if (total > 0) {
            progress.hidden = false;
            progress.value = Math.min(100, (received / total) * 100);
            progress.setAttribute('aria-valuenow', String(Math.floor(progress.value)));
            status.textContent = `Descargando ${formatBytes(received)} de ${formatBytes(total)}…`;
          } else {
            status.textContent = `Descargando ${formatBytes(received)}…`;
          }
          submitButton.replaceChildren(icon('download', 18), document.createTextNode('Descargando…'));
        }
      } else {
        const blob = await response.blob();
        if (blob.size > MAX_DOWNLOAD_BYTES) {
          throw new Error('El archivo supera el límite de 250 MB para una descarga desde Sonora.');
        }
        chunks.push(new Uint8Array(await blob.arrayBuffer()));
      }

      const blob = new Blob(chunks as BlobPart[], { type: contentType || 'application/octet-stream' });
      if (blob.size === 0) throw new Error('El archivo recibido está vacío.');
      const filename = buildFilename(response.headers.get('content-disposition'), url, contentType);
      saveBlob(blob, filename);
      progress.hidden = true;
      status.textContent = `Descarga iniciada: ${filename}`;
    } catch (error) {
      progress.hidden = true;
      if (controller.signal.aborted) {
        status.textContent = 'Descarga cancelada.';
      } else if (error instanceof TypeError) {
        status.textContent = 'La fuente bloqueó la descarga desde Sonora (CORS). Abre el enlace original y descarga desde su sitio.';
      } else {
        status.textContent = error instanceof Error ? error.message : 'No se pudo descargar este archivo.';
      }
    } finally {
      if (activeController === controller) activeController = null;
      submitButton.disabled = false;
      submitButton.replaceChildren(icon('download', 18), document.createTextNode('Descargar archivo'));
    }
  }

  view.append(
    h(
      'section',
      { class: 'url-download__hero' },
      h('span', { class: 'url-download__eyebrow' }, icon('download', 16), 'Descargas por enlace'),
      h('h1', { class: 'url-download__title', text: 'Tu música, desde su URL.' }),
      h('p', {
        class: 'url-download__intro',
        text: 'Pega el enlace directo de un archivo de audio para guardarlo en tu dispositivo. Funciona con MP3, FLAC, WAV, OGG, M4A y formatos similares.',
      }),
    ),
    h(
      'section',
      { class: 'panel url-download__panel' },
      form,
      status,
      progress,
      sourceLink,
    ),
    renderSpotifyImporter(),
    h(
      'section',
      { class: 'panel url-download__note' },
      h('h2', { class: 'panel__title' }, icon('info', 19), 'Qué enlaces funcionan'),
      h('p', {
        class: 'panel__text',
        text: 'Usa la URL directa del archivo de audio y asegúrate de tener permiso para descargarlo. Sonora no extrae música desde páginas de YouTube, Spotify ni otros servicios de streaming.',
      }),
      h(
        'div',
        { class: 'url-download__limits' },
        h(
          'div',
          { class: 'url-download__limit' },
          icon('check', 17),
          h('span', { text: 'El archivo se descarga en la carpeta configurada en tu navegador; el límite por archivo es 250 MB.' }),
        ),
        h(
          'div',
          { class: 'url-download__limit' },
          icon('external', 17),
          h('span', { text: 'Si el sitio bloquea la descarga externa, abre el enlace original y descárgalo desde la fuente.' }),
        ),
      ),
    ),
  );

  return view;
}


interface SpotifyMatchState {
  loading: boolean;
  saving: boolean;
  candidates: RemoteCandidate[];
  errors: string[];
  addedKeys: Set<string>;
  message: string;
}

let spotifyPlaylistUrlTyped = '';
let spotifyImportMode: 'playlist' | 'saved-tracks' = 'saved-tracks';
let spotifyTrackPage = 0;
let spotifyTrackQuery = '';
const SPOTIFY_TRACK_PAGE_SIZE = 32;
let spotifyLocalPlaylistName = 'Canciones que te gustan';
let spotifyMatches = new Map<string, SpotifyMatchState>();
let spotifyMatchedPlaylistId: string | null = null;
let spotifyPlaylistCreation: Promise<string> | null = null;

function renderSpotifyImporter(): HTMLElement {
  const clientIdInput = h('input', {
    class: 'url-download__input spotify-import__input',
    id: 'spotify-client-id',
    type: 'text',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: 'Client ID de tu app de Spotify',
    value: getSpotifyClientId(),
    ariaLabel: 'Client ID de Spotify',
  }) as HTMLInputElement;
  const sourceInput = h(
    'select',
    {
      class: 'url-download__input spotify-import__input',
      id: 'spotify-import-source',
      ariaLabel: 'Qué quieres importar desde Spotify',
    },
    h('option', { value: 'saved-tracks', text: 'Mis canciones que te gustan' }),
    h('option', { value: 'playlist', text: 'Una playlist por enlace' }),
  ) as HTMLSelectElement;
  sourceInput.value = spotifyImportMode;
  const playlistUrlInput = h('input', {
    class: 'url-download__input spotify-import__input',
    id: 'spotify-playlist-url',
    type: 'url',
    inputMode: 'url',
    autocomplete: 'url',
    placeholder: 'https://open.spotify.com/playlist/…',
    value: spotifyPlaylistUrlTyped,
    ariaLabel: 'Enlace de playlist de Spotify',
  }) as HTMLInputElement;
  const playlistNameInput = h('input', {
    class: 'url-download__input spotify-import__input',
    id: 'spotify-sonora-name',
    type: 'text',
    maxlength: 80,
    placeholder: 'Nombre de la playlist en Sonora',
    value: spotifyLocalPlaylistName,
    ariaLabel: 'Nombre de la playlist nueva en Sonora',
  }) as HTMLInputElement;
  const status = h('p', {
    class: 'spotify-import__status',
    role: 'status',
    ariaLive: 'polite',
    text: getSpotifyCallbackError() || 'Se mostrarán las canciones para que elijas versiones disponibles en fuentes libres.',
  });
  const redirect = spotifyRedirectUri();
  const redirectText = h('code', { class: 'spotify-import__redirect', text: redirect });
  const copyRedirect = h('button', {
    class: 'btn btn--ghost spotify-import__copy',
    type: 'button',
    on: {
      click: async () => {
        try {
          await navigator.clipboard.writeText(redirect);
          status.textContent = 'URL de retorno copiada.';
        } catch {
          status.textContent = 'Copia manualmente la URL de retorno que aparece arriba.';
        }
      },
    },
    text: 'Copiar URL',
  });

  clientIdInput.addEventListener('input', () => {
    try {
      setSpotifyClientId(clientIdInput.value);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'No se pudo guardar el Client ID.';
    }
  });
  playlistUrlInput.addEventListener('input', () => {
    spotifyPlaylistUrlTyped = playlistUrlInput.value;
  });
  sourceInput.addEventListener('change', () => {
    spotifyImportMode = sourceInput.value === 'playlist' ? 'playlist' : 'saved-tracks';
    const useSavedTracks = spotifyImportMode === 'saved-tracks';
    playlistUrlInput.disabled = useSavedTracks;
    playlistUrlInput.closest('label')?.toggleAttribute('hidden', useSavedTracks);
    if (spotifyLocalPlaylistName === 'Playlist importada' || spotifyLocalPlaylistName === 'Canciones que te gustan') {
      spotifyLocalPlaylistName = useSavedTracks ? 'Canciones que te gustan' : 'Playlist importada';
      playlistNameInput.value = spotifyLocalPlaylistName;
    }
    submitButton.replaceChildren(
      icon('music', 18),
      document.createTextNode(useSavedTracks ? 'Importar canciones guardadas' : 'Importar playlist'),
    );
  });

  playlistNameInput.addEventListener('input', () => {
    spotifyLocalPlaylistName = playlistNameInput.value;
  });

  const submitButton = h(
    'button',
    { class: 'btn btn--primary spotify-import__submit', type: 'submit' },
    icon('music', 18),
    spotifyImportMode === 'saved-tracks' ? 'Importar canciones guardadas' : 'Importar playlist',
  );
  playlistUrlInput.disabled = spotifyImportMode === 'saved-tracks';
  playlistUrlInput.closest('label')?.toggleAttribute('hidden', spotifyImportMode === 'saved-tracks');

  const form = h(
    'form',
    {
      class: 'spotify-import__form',
      on: {
        submit: (event: Event) => {
          event.preventDefault();
          const clientId = clientIdInput.value.trim();
          const isSavedTracks = sourceInput.value === 'saved-tracks';
          const playlistId = isSavedTracks ? null : parseSpotifyPlaylistUrl(playlistUrlInput.value);
          if (!clientId) {
            status.textContent = 'Pega el Client ID de tu app de Spotify.';
            clientIdInput.focus();
            return;
          }
          if (!isSavedTracks && !playlistId) {
            status.textContent = 'Pega un enlace válido de una playlist de Spotify.';
            playlistUrlInput.focus();
            return;
          }
          try {
            setSpotifyClientId(clientId);
            status.textContent = 'Conectando con Spotify…';
            const authorization = isSavedTracks
              ? authorizeSpotifySavedTracks(clientId)
              : authorizeSpotifyPlaylist(clientId, playlistId ?? '');
            void authorization.catch((error: unknown) => {
              status.textContent = error instanceof Error ? error.message : 'No se pudo abrir Spotify.';
            });
          } catch (error) {
            status.textContent = error instanceof Error ? error.message : 'No se pudo iniciar la importación.';
          }
        },
      },
    },
    h(
      'label',
      { class: 'spotify-import__field' },
      h('span', { class: 'url-download__label', text: 'Client ID de tu app de Spotify' }),
      clientIdInput,
    ),
    h(
      'label',
      { class: 'spotify-import__field' },
      h('span', { class: 'url-download__label', text: 'Qué quieres importar' }),
      sourceInput,
    ),
    h(
      'label',
      { class: 'spotify-import__field' },
      h('span', { class: 'url-download__label', text: 'Enlace de la playlist' }),
      playlistUrlInput,
    ),
    h(
      'label',
      { class: 'spotify-import__field' },
      h('span', { class: 'url-download__label', text: 'Nombre para la playlist de Sonora' }),
      playlistNameInput,
    ),
    submitButton,
  );

  playlistUrlInput.closest('label')?.toggleAttribute('hidden', spotifyImportMode === 'saved-tracks');

  const panel = h(
    'section',
    { class: 'panel spotify-import' },
    h(
      'div',
      { class: 'spotify-import__heading' },
      h('span', { class: 'url-download__eyebrow' }, icon('music', 16), 'Importar playlist'),
      h('h2', { class: 'spotify-import__title', text: 'Trae tu selección a Sonora.' }),
      h('p', {
        class: 'panel__text',
        text: 'Importa tus canciones guardadas o pega una playlist. Sonora trae solo los datos de la música y busca versiones libres; no copia ni reproduce el audio de Spotify.',
      }),
    ),
    h(
      'div',
      { class: 'spotify-import__setup' },
      h(
        'p',
        { class: 'spotify-import__setup-title', text: 'Configuración inicial' },
      ),
      h(
        'ol',
        { class: 'spotify-import__steps' },
        h(
          'li',
          {},
          'Crea una app en ',
          h('a', { href: 'https://developer.spotify.com/dashboard', target: '_blank', rel: 'noreferrer noopener', text: 'Spotify for Developers' }),
          ' y copia su Client ID.',
        ),
        h('li', {}, 'Agrega esta URL de retorno exacta en la configuración de la app:'),
      ),
      h('div', { class: 'spotify-import__redirect-row' }, redirectText, copyRedirect),
      h('p', {
        class: 'panel__hint',
        text: 'Spotify te pedirá permiso para leer tu biblioteca o playlist. Los nombres y portadas importados viven solo en esta pestaña; en Sonora se guardan únicamente las pistas libres que elijas.',
      }),
    ),
    form,
    status,
    h('div', { class: 'spotify-import__results' }),
  );

  const results = panel.querySelector<HTMLElement>('.spotify-import__results');
  if (results) renderImportedSpotifyTracks(results);
  return panel;
}

function renderImportedSpotifyTracks(container: HTMLElement): void {
  const imported = getImportedSpotifyPlaylist();
  const callbackError = getSpotifyCallbackError();
  container.replaceChildren();
  if (!imported) return;

  const header = h(
    'div',
    { class: 'spotify-import__playlist' },
    h(
      'div',
      {},
      h('p', {
        class: 'spotify-import__playlist-kicker',
        text: imported.id === 'spotify:saved-tracks' ? 'Biblioteca leída desde Spotify' : 'Playlist leída desde Spotify',
      }),
      h('h3', { class: 'spotify-import__playlist-title', text: imported.name }),
      h('p', {
        class: 'spotify-import__playlist-count',
        text: imported.tracks.length + ' ' + pluralize(imported.tracks.length, 'canción'),
      }),
    ),
    h(
      'div',
      { class: 'spotify-import__playlist-actions' },
      h(
        'a',
        { class: 'btn btn--ghost', href: imported.url, target: '_blank', rel: 'noreferrer noopener' },
        icon('external', 16),
        'Abrir en Spotify',
      ),
      h(
        'button',
        {
          class: 'btn btn--ghost',
          type: 'button',
          on: {
            click: () => {
              clearImportedSpotifyPlaylist();
              spotifyMatches.clear();
              spotifyMatchedPlaylistId = null;
              spotifyPlaylistCreation = null;
              spotifyTrackPage = 0;
              spotifyTrackQuery = '';
              container.replaceChildren();
            },
          },
          text: 'Limpiar importación',
        },
      ),
    ),
  );

  const notice = h('p', {
    class: 'spotify-import__attribution',
    text: 'Datos de la playlist proporcionados por Spotify. El audio se buscará por separado en archivos libres.',
  });
  container.append(header, notice);

  if (callbackError) {
    container.append(h('p', { class: 'spotify-import__status spotify-import__status--error', role: 'status', text: callbackError }));
    return;
  }
  if (imported.tracks.length === 0) return;

  const filterInput = h('input', {
    class: 'url-download__input spotify-import__input',
    type: 'search',
    placeholder: 'Buscar entre tus canciones…',
    value: spotifyTrackQuery,
    ariaLabel: 'Filtrar canciones importadas',
  }) as HTMLInputElement;
  const list = h('div', { class: 'spotify-track-list' });
  const pagination = h('div', { class: 'spotify-import__pagination' });

  const renderTrackPage = (): void => {
    const query = spotifyTrackQuery.trim().toLocaleLowerCase('es');
    const filtered = imported.tracks.filter((track) =>
      !query || (track.title + ' ' + track.artist + ' ' + track.album).toLocaleLowerCase('es').includes(query),
    );
    const pageCount = Math.max(1, Math.ceil(filtered.length / SPOTIFY_TRACK_PAGE_SIZE));
    spotifyTrackPage = Math.min(spotifyTrackPage, pageCount - 1);
    const start = spotifyTrackPage * SPOTIFY_TRACK_PAGE_SIZE;
    const visible = filtered.slice(start, start + SPOTIFY_TRACK_PAGE_SIZE);
    list.replaceChildren();
    if (visible.length) {
      for (const track of visible) list.append(renderSpotifyTrack(track));
    } else {
      list.append(h('p', { class: 'panel__hint', text: query ? 'No encontramos canciones con ese texto.' : 'No hay canciones para mostrar.' }));
    }

    const previous = h(
      'button',
      {
        class: 'btn btn--ghost',
        type: 'button',
        disabled: spotifyTrackPage === 0 || filtered.length === 0,
        on: { click: () => { spotifyTrackPage -= 1; renderTrackPage(); } },
        text: 'Anterior',
      },
    );
    const next = h(
      'button',
      {
        class: 'btn btn--ghost',
        type: 'button',
        disabled: spotifyTrackPage >= pageCount - 1 || filtered.length === 0,
        on: { click: () => { spotifyTrackPage += 1; renderTrackPage(); } },
        text: 'Siguiente',
      },
    );
    const firstShown = filtered.length ? start + 1 : 0;
    const lastShown = Math.min(start + visible.length, filtered.length);
    pagination.replaceChildren(
      previous,
      h('span', {
        class: 'spotify-import__page-status',
        text: filtered.length
          ? `Mostrando ${firstShown}–${lastShown} de ${filtered.length} · Página ${spotifyTrackPage + 1} de ${pageCount}`
          : '0 resultados',
      }),
      next,
    );
  };

  filterInput.addEventListener('input', () => {
    spotifyTrackQuery = filterInput.value;
    spotifyTrackPage = 0;
    renderTrackPage();
  });
  container.append(h('label', { class: 'spotify-import__filter' }, h('span', { class: 'url-download__label', text: 'Filtrar canciones' }), filterInput), list, pagination);
  renderTrackPage();
  if (spotifyMatchedPlaylistId) {
    container.append(
      h(
        'button',
        {
          class: 'btn btn--ghost spotify-import__open-playlist',
          type: 'button',
          on: { click: () => setRoute({ name: 'playlist', params: { id: spotifyMatchedPlaylistId ?? '' } }) },
        },
        icon('playlist', 17),
        'Abrir playlist de Sonora',
      ),
    );
  }
}

function renderSpotifyTrack(track: SpotifyPlaylistTrack): HTMLElement {
  let state = spotifyMatches.get(track.id);
  if (!state) {
    state = { loading: false, saving: false, candidates: [], errors: [], addedKeys: new Set(), message: '' };
    spotifyMatches.set(track.id, state);
  }

  const searchButton = h(
    'button',
    {
      class: 'btn btn--ghost spotify-track__search',
      type: 'button',
      disabled: state.loading,
      on: {
        click: () => void searchFreeMatches(track),
      },
    },
    icon(state.loading ? 'refresh' : 'search', 16),
    state.loading ? 'Buscando…' : state.candidates.length ? 'Buscar de nuevo' : 'Buscar versión libre',
  );
  const row = h(
    'article',
    { class: 'spotify-track' },
    track.artworkUrl
      ? h('img', { class: 'spotify-track__art', src: track.artworkUrl, alt: '', loading: 'lazy' })
      : h('div', { class: 'spotify-track__art spotify-track__art--empty' }, icon('music', 18)),
    h(
      'div',
      { class: 'spotify-track__body' },
      h('strong', { class: 'spotify-track__title', text: track.title }),
      h('span', { class: 'spotify-track__artist', text: track.artist + (track.album ? ' · ' + track.album : '') }),
    ),
    searchButton,
  );
  row.dataset.spotifyTrackId = track.id;

  if (state.errors.length) {
    row.append(h('p', { class: 'spotify-track__message spotify-track__message--error', text: state.errors.join(' · ') }));
  }
  if (state.candidates.length) {
    const choices = h('div', { class: 'spotify-track__matches' });
    for (const candidate of state.candidates) {
      const saved = state.addedKeys.has(candidate.key);
      choices.append(
        h(
          'div',
          { class: 'spotify-match' },
          h(
            'div',
            { class: 'spotify-match__info' },
            h('strong', { class: 'spotify-match__title', text: candidate.title }),
            h('span', { class: 'spotify-match__artist', text: candidate.artist + ' · ' + sourceLabel(candidate.source) }),
            h('span', { class: 'spotify-match__license', text: candidate.license ?? 'Revisa la licencia en la fuente' }),
          ),
          h(
            'button',
            {
              class: 'btn btn--ghost spotify-match__add',
              type: 'button',
              disabled: saved || state.saving,
              on: { click: () => void addFreeMatchToPlaylist(track, candidate, state) },
              text: saved ? 'Añadida' : state.saving ? 'Guardando…' : 'Añadir',
            },
          ),
        ),
      );
    }
    row.append(choices);
  } else if (state.message && !state.loading) {
    row.append(h('p', { class: 'spotify-track__message', text: state.message }));
  }
  return row;
}

async function searchFreeMatches(track: SpotifyPlaylistTrack): Promise<void> {
  const state = spotifyMatches.get(track.id);
  if (!state || state.loading) return;
  state.loading = true;
  state.message = '';
  state.errors = [];
  const list = document.querySelector<HTMLElement>('.spotify-track-list');
  if (list) rerenderSpotifyTrack(list, track);
  const controller = new AbortController();
  try {
    const result = await searchAllSources(track.title + ' ' + track.artist, 4, controller.signal);
    state.candidates = result.results.slice(0, 6);
    state.errors = result.errors.map((item) => item.provider + ': ' + item.message);
    state.message = state.candidates.length
      ? 'Elige la versión que corresponda; revisa la licencia antes de usarla.'
      : 'No encontramos una coincidencia libre. Puedes probar con otro nombre en Buscar.';
  } catch (error) {
    state.message = error instanceof Error ? error.message : 'No se pudo buscar esta canción.';
  } finally {
    state.loading = false;
    const currentList = document.querySelector<HTMLElement>('.spotify-track-list');
    if (currentList) rerenderSpotifyTrack(currentList, track);
  }
}

function rerenderSpotifyTrack(list: HTMLElement, track: SpotifyPlaylistTrack): void {
  const rows = [...list.querySelectorAll<HTMLElement>('[data-spotify-track-id]')];
  const existing = rows.find((row) => row.dataset.spotifyTrackId === track.id);
  const replacement = renderSpotifyTrack(track);
  replacement.dataset.spotifyTrackId = track.id;
  if (existing) existing.replaceWith(replacement);
  else list.append(replacement);
}

async function addFreeMatchToPlaylist(
  spotifyTrack: SpotifyPlaylistTrack,
  candidate: RemoteCandidate,
  state: SpotifyMatchState,
): Promise<void> {
  if (state.saving || state.addedKeys.has(candidate.key)) return;
  state.saving = true;
  try {
    if (!spotifyMatchedPlaylistId) {
      if (!spotifyPlaylistCreation) {
        const name = spotifyLocalPlaylistName.trim() || 'Playlist importada';
        spotifyPlaylistCreation = createPlaylist(name).then((playlist) => playlist.id).finally(() => {
          spotifyPlaylistCreation = null;
        });
      }
      spotifyMatchedPlaylistId = await spotifyPlaylistCreation;
    }
    const saved = await saveCandidate(candidate);
    const added = await addToPlaylist(spotifyMatchedPlaylistId, [saved.id]);
    state.addedKeys.add(candidate.key);
    state.message = added ? 'Añadida a tu playlist de Sonora.' : 'Esta pista ya estaba en la playlist.';
    toast({ message: state.message, kind: 'success' });
  } catch (error) {
    state.message = error instanceof Error ? error.message : 'No se pudo guardar la coincidencia.';
    toast({ message: state.message, kind: 'error' });
  } finally {
    state.saving = false;
    const list = document.querySelector<HTMLElement>('.spotify-track-list');
    if (list) rerenderSpotifyTrack(list, spotifyTrack);
  }
}

function sourceLabel(source: RemoteCandidate['source']): string {
  switch (source) {
    case 'internet-archive':
      return 'Internet Archive';
    case 'openverse':
      return 'Openverse';
    case 'wikimedia-commons':
      return 'Wikimedia Commons';
    default:
      return 'Fuente libre';
  }
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function buildFilename(disposition: string | null, url: URL, contentType: string): string {
  const encodedName = disposition?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  const regularName = disposition?.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  let name = encodedName
    ? decodeURIComponent(encodedName.trim().replace(/^"|"$/g, ''))
    : regularName?.[1] ?? regularName?.[2]?.trim() ?? '';
  if (!name) {
    const pathName = url.pathname.split('/').filter(Boolean).pop() ?? '';
    try {
      name = decodeURIComponent(pathName);
    } catch {
      name = pathName;
    }
  }
  if (!name || name.endsWith('/')) name = 'sonora-audio';
  name = name.replace(/[<>:"\/\\|?*\u0000-\u001F]/g, '-').replace(/[. ]+$/g, '').trim();
  if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
    const extension = contentType.includes('mpeg') ? 'mp3' : contentType.includes('ogg') ? 'ogg' : 'audio';
    name += `.${extension}`;
  }
  return name || 'sonora-audio.audio';
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
