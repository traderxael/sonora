import { Emitter } from '../lib/emitter';
import * as db from '../lib/db';
import type { MusicFolder, Playlist, Route, Settings, Track } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';

export const LIKES_ID = 'sys_likes';

export interface PlayerSlice {
  trackId: string | null;
  /** Ids de pistas en orden de reproduccion. */
  queue: string[];
  index: number;
  playing: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  loading: boolean;
  error: string | null;
}

export interface SearchSlice {
  term: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  results: import('../lib/types').RemoteCandidate[];
  error: string | null;
  sources: Record<string, string | null>;
  runId: number;
}

export interface AppState {
  ready: boolean;
  route: Route;
  tracks: Map<string, Track>;
  playlists: Map<string, Playlist>;
  folders: MusicFolder[];
  offlineIds: Set<string>;
  settings: Settings;
  player: PlayerSlice;
  search: SearchSlice;
  scan: { folderName: string; done: number; total: number; current: string } | null;
  downloads: Map<string, import('../lib/types').DownloadProgress>;
  storage: { usage: number; quota: number };
  online: boolean;
}

const emptyPlayer = (): PlayerSlice => ({
  trackId: null,
  queue: [],
  index: -1,
  playing: false,
  volume: DEFAULT_SETTINGS.volume,
  muted: false,
  shuffle: false,
  repeat: 'off',
  loading: false,
  error: null,
});

const emptySearch = (): SearchSlice => ({
  term: '',
  status: 'idle',
  results: [],
  error: null,
  sources: {},
  runId: 0,
});

const state: AppState = {
  ready: false,
  route: { name: 'home', params: {} },
  tracks: new Map(),
  playlists: new Map(),
  folders: [],
  offlineIds: new Set(),
  settings: { ...DEFAULT_SETTINGS },
  player: emptyPlayer(),
  search: emptySearch(),
  scan: null,
  downloads: new Map(),
  storage: { usage: 0, quota: 0 },
  online: navigator.onLine,
};

export const bus = new Emitter<{ change: void; route: Route; toast: undefined }>();

let renderQueued = false;
const renderers = new Set<() => void>();

/** Registra una vista para redibujarse cuando cambie el estado. */
export function onRender(fn: () => void): () => void {
  renderers.add(fn);
  return () => renderers.delete(fn);
}

function flushRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    for (const fn of [...renderers]) {
      try {
        fn();
      } catch (err) {
        console.error('[store] fallo al renderizar', err);
      }
    }
  });
}

bus.on('change', flushRender);

export function getState(): AppState {
  return state;
}

export function notify(): void {
  bus.emit('change', undefined);
}

export function setRoute(route: Route): void {
  const same =
    state.route.name === route.name &&
    JSON.stringify(state.route.params) === JSON.stringify(route.params);
  if (same) return;
  state.route = route;
  bus.emit('route', route);
  notify();
}

export async function initStore(): Promise<void> {
  const [tracks, playlists, folders, offlineIds, storage] = await Promise.all([
    db.getAllTracks(),
    db.getAllPlaylists(),
    db.getAllFolders(),
    db.getOfflineIds(),
    db.offlineUsage(),
  ]);

  const settingsKeys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
  const storedSettings = await Promise.all(settingsKeys.map((k) => db.getSetting(k)));

  state.tracks = new Map(tracks.map((t) => [t.id, t]));
  state.playlists = new Map(playlists.map((p) => [p.id, p]));
  state.folders = folders.sort((a, b) => a.addedAt - b.addedAt);
  state.offlineIds = new Set(offlineIds);
  state.storage = storage;
  state.settings = { ...DEFAULT_SETTINGS };
  settingsKeys.forEach((key, i) => {
    (state.settings[key] as Settings[typeof key]) = storedSettings[i] as never;
  });
  state.player.volume = state.settings.volume;
  state.ready = true;
  notify();
}

window.addEventListener('online', () => {
  state.online = true;
  notify();
});
window.addEventListener('offline', () => {
  state.online = false;
  notify();
});

// ------------------------------------------------------------- mutadores

export function upsertTracks(tracks: readonly Track[]): void {
  for (const track of tracks) state.tracks.set(track.id, track);
  notify();
}

export function updateTrack(track: Track): void {
  state.tracks.set(track.id, track);
  notify();
}

export function removeTracks(ids: readonly string[]): void {
  for (const id of ids) {
    state.tracks.delete(id);
    state.offlineIds.delete(id);
  }
  for (const playlist of state.playlists.values()) {
    if (!playlist.trackIds.some((id) => ids.includes(id))) continue;
    const next = { ...playlist, trackIds: playlist.trackIds.filter((id) => !ids.includes(id)), updatedAt: Date.now() };
    state.playlists.set(next.id, next);
    void db.putPlaylist(next);
  }
  const queue = state.player.queue.filter((id) => !ids.includes(id));
  patchPlayer({ queue, index: state.player.index >= queue.length ? queue.length - 1 : state.player.index });
  notify();
}

export function upsertPlaylist(playlist: Playlist): void {
  state.playlists.set(playlist.id, playlist);
  notify();
}

export function removePlaylist(id: string): void {
  state.playlists.delete(id);
  notify();
}

export function setFolders(folders: MusicFolder[]): void {
  state.folders = folders;
  notify();
}

export function setScanProgress(scan: AppState['scan']): void {
  state.scan = scan;
  notify();
}

export function setDownload(trackId: string, progress: import('../lib/types').DownloadProgress | null): void {
  if (progress === null) state.downloads.delete(trackId);
  else state.downloads.set(trackId, progress);
  notify();
}

export function setOffline(trackId: string, offline: boolean): void {
  if (offline) state.offlineIds.add(trackId);
  else state.offlineIds.delete(trackId);
  notify();
}

export function setSettings(patch: Partial<Settings>): void {
  state.settings = { ...state.settings, ...patch };
  notify();
}

export function setStorage(usage: { usage: number; quota: number }): void {
  state.storage = usage;
  notify();
}

export function setSearch(patch: Partial<SearchSlice>): void {
  state.search = { ...state.search, ...patch };
  notify();
}

export function patchPlayer(patch: Partial<PlayerSlice>): void {
  state.player = { ...state.player, ...patch };
  notify();
}

// -------------------------------------------------------------- selectores

export function getTrack(id: string | null | undefined): Track | undefined {
  return id ? state.tracks.get(id) : undefined;
}

export function getPlaylist(id: string | null | undefined): Playlist | undefined {
  return id ? state.playlists.get(id) : undefined;
}

export function isLiked(trackId: string): boolean {
  return state.playlists.get(LIKES_ID)?.trackIds.includes(trackId) ?? false;
}

export function likesPlaylist(): Playlist {
  return (
    state.playlists.get(LIKES_ID) ?? {
      id: LIKES_ID,
      name: 'Me gusta',
      trackIds: [],
      createdAt: 0,
      updatedAt: 0,
      accent: '#7c5cff',
    }
  );
}

export function resolveTracks(ids: readonly string[]): Track[] {
  const out: Track[] = [];
  for (const id of ids) {
    const track = state.tracks.get(id);
    if (track) out.push(track);
  }
  return out;
}

export function libraryTracks(): Track[] {
  return [...state.tracks.values()].filter((t) => t.source === 'local');
}

export function userPlaylists(): Playlist[] {
  return [...state.playlists.values()]
    .filter((p) => p.id !== LIKES_ID)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Artistas y albums derivados de la biblioteca local. */
export function libraryCollections(): { artists: string[]; albums: { name: string; artist: string }[] } {
  const artists = new Set<string>();
  const albums = new Map<string, { name: string; artist: string }>();
  for (const track of state.tracks.values()) {
    if (track.source !== 'local') continue;
    if (track.artist) artists.add(track.artist);
    const key = `${track.artist} ${track.album}`;
    if (track.album && !albums.has(key)) albums.set(key, { name: track.album, artist: track.artist });
  }
  return {
    artists: [...artists].sort((a, b) => a.localeCompare(b)),
    albums: [...albums.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function currentTrack(): Track | undefined {
  return getTrack(state.player.trackId);
}
