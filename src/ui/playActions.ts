import { player } from '../audio/player';
import { getState, setRoute, isLiked } from '../state/store';
import { createPlaylist, addToPlaylist, toggleLike } from '../state/playlists';
import { saveCandidate } from '../state/playlists';
import { downloadForOffline, removeOffline } from '../download/offline';
import { confirmDialog, showContextMenu, type MenuItem } from './contextMenu';
import { toast } from './toast';
import { colorFromString, errorMessage, pluralize } from '../lib/utils';
import type { RemoteCandidate, Track } from '../lib/types';

const SOURCE_LABELS: Record<string, string> = {
  local: 'Tu carpeta',
  'internet-archive': 'Internet Archive',
  openverse: 'Openverse',
  'wikimedia-commons': 'Wikimedia Commons',
};

export function sourceLabel(track: Track): string {
  return SOURCE_LABELS[track.source] ?? track.source;
}

export async function playTracks(tracks: readonly Track[], startIndex = 0): Promise<void> {
  const playable = tracks.filter((t) => getState().tracks.has(t.id));
  if (playable.length === 0) {
    toast({ message: 'No hay pistas para reproducir.', kind: 'warning' });
    return;
  }
  const index = Math.max(0, Math.min(startIndex, playable.length - 1));
  await player.play({ queue: playable.map((t) => t.id), startIndex: index });
}

export async function playTrackNow(track: Track): Promise<void> {
  await playTracks([track]);
}

export async function togglePlay(track: Track): Promise<void> {
  if (getState().player.trackId === track.id) {
    await player.toggle();
    return;
  }
  await playTracks([track]);
}

/** Inserta la pista justo despues de la actual. */
export async function playNext(track: Track): Promise<void> {
  const state = getState().player;
  if (state.trackId === track.id) return;
  player.enqueueNext([track.id]);
  toast({ message: `"${track.title}" se reproducia a continuacion` });
}

export async function addToQueue(track: Track): Promise<void> {
  player.enqueueMany([track.id]);
  toast({ message: `"${track.title}" agregada a la cola` });
}

export async function playTracksNext(tracks: readonly Track[]): Promise<void> {
  if (tracks.length === 0) return;
  player.enqueueNext(tracks.map((t) => t.id));
  toast({ message: `${tracks.length} ${pluralize(tracks.length, 'pista')} a continuacion` });
}

export async function addAllToQueue(tracks: readonly Track[]): Promise<void> {
  if (tracks.length === 0) return;
  player.enqueueMany(tracks.map((t) => t.id));
  toast({ message: `${tracks.length} ${pluralize(tracks.length, 'pista')} en la cola` });
}

export async function toggleLikeTrack(track: Track): Promise<void> {
  const liked = await toggleLike(track.id);
  toast({ message: liked ? `Agregada "${track.title}" a Me gusta` : `Quitada de Me gusta` });
}

export interface AddToPlaylistResult {
  playlistName?: string;
  added?: number;
}

/** Dialogo para agregar pistas a una playlist existente o crear una nueva. */
export async function addToPlaylistFlow(tracks: readonly Track[]): Promise<AddToPlaylistResult | null> {
  if (tracks.length === 0) return null;

  const { choosePlaylist } = await import('./playlistPicker');
  const choice = await choosePlaylist(tracks.length);
  if (!choice) return null;

  if (choice === 'new') {
    const name = await promptForName('Nueva playlist', 'Nombre de la playlist');
    if (!name) return null;
    const playlist = await createPlaylist(name, tracks.map((t) => t.id));
    toast({ message: `${tracks.length} ${pluralize(tracks.length, 'pista')} en "${playlist.name}"` });
    return { playlistName: playlist.name, added: tracks.length };
  }

  const added = await addToPlaylist(choice, tracks.map((t) => t.id));
  const playlist = getState().playlists.get(choice);
  toast({
    message:
      added === 0
        ? `Ya estaban en "${playlist?.name ?? 'la playlist'}"`
        : `${added} ${pluralize(added, 'pista')} agregada${added === 1 ? '' : 's'} a "${playlist?.name ?? 'la playlist'}"`,
    kind: added === 0 ? 'info' : 'success',
  });
  return { playlistName: playlist?.name, added };
}

async function promptForName(title: string, label: string): Promise<string | null> {
  const result = await confirmDialog({
    title,
    withInput: { label, value: '', placeholder: 'Mi playlist' },
    confirmLabel: 'Crear',
  });
  if (!result.confirmed) return null;
  const value = result.value?.trim();
  return value ? value : null;
}

export async function toggleOffline(track: Track): Promise<void> {
  const { offlineIds } = getState();
  if (offlineIds.has(track.id)) {
    await removeOffline(track.id);
    toast({ message: `Quitada "${track.title}" de las descargas` });
    return;
  }
  try {
    await downloadForOffline(track);
    toast({ message: `"${track.title}" disponible sin internet` });
  } catch (err) {
    toast({ message: `No se pudo descargar: ${errorMessage(err)}`, kind: 'error' });
  }
}

export async function saveCandidateToLibrary(candidate: RemoteCandidate): Promise<Track> {
  const track = await saveCandidate(candidate);
  toast({ message: `"${track.title}" guardada en tu biblioteca` });
  return track;
}

/** Menu contextual completo de una pista. */
export function trackMenuItems(track: Track, extra: MenuItem[] = []): MenuItem[] {
  const { offlineIds } = getState();
  const isOffline = offlineIds.has(track.id);
  const liked = isLiked(track.id);

  const items: MenuItem[] = [
    { id: 'play-next', label: 'Reproducir a continuacion', icon: 'queue', onSelect: () => void playNext(track) },
    { id: 'queue', label: 'Agregar a la cola', icon: 'plus', onSelect: () => void addToQueue(track) },
    {
      id: 'like',
      label: liked ? 'Quitar de Me gusta' : 'Agregar a Me gusta',
      icon: liked ? 'heartFilled' : 'heart',
      onSelect: () => void toggleLikeTrack(track),
    },
    {
      id: 'playlist',
      label: 'Agregar a una playlist',
      icon: 'playlist',
      onSelect: () => void addToPlaylistFlow([track]),
    },
    {
      id: 'offline',
      label: isOffline ? 'Quitar descarga offline' : 'Descargar para escuchar sin internet',
      icon: isOffline ? 'downloaded' : 'download',
      separatorBefore: true,
      onSelect: () => void toggleOffline(track),
    },
  ];

  if (track.licenseUrl || track.homeUrl) {
    items.push({
      id: 'source',
      label: 'Ver origen y licencia',
      icon: 'external',
      onSelect: () => {
        const url = track.licenseUrl ?? track.homeUrl;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      },
    });
  }

  if (extra.length > 0) items.push(...extra);

  return items;
}

export function openTrackMenu(event: MouseEvent, track: Track, extra: MenuItem[] = []): void {
  event.preventDefault();
  event.stopPropagation();
  showContextMenu(event.clientX, event.clientY, trackMenuItems(track, extra));
}

export function accentForTrack(track: Track): string {
  return colorFromString(track.album || track.artist || track.title, 55, 45);
}

export function goToPlaylist(id: string): void {
  setRoute({ name: 'playlist', params: { id } });
}
