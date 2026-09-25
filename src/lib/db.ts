import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MusicFolder, OfflineEntry, Playlist, Settings, Track } from './types';
import { DEFAULT_SETTINGS } from './types';

const DB_NAME = 'sonora';
const DB_VERSION = 1;

interface SonoraDB extends DBSchema {
  tracks: {
    key: string;
    value: Track;
    indexes: { 'by-source': string; 'by-artist': string; 'by-album': string; 'by-added': number };
  };
  playlists: {
    key: string;
    value: Playlist;
    indexes: { 'by-updated': number };
  };
  folders: { key: string; value: MusicFolder };
  offline: {
    key: string;
    value: OfflineEntry;
    indexes: { 'by-saved': number };
  };
  artwork: { key: string; value: { key: string; blob: Blob; type: string } };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<SonoraDB>> | undefined;

export function getDB(): Promise<IDBPDatabase<SonoraDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SonoraDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('tracks')) {
          const store = db.createObjectStore('tracks', { keyPath: 'id' });
          store.createIndex('by-source', 'source');
          store.createIndex('by-artist', 'artist');
          store.createIndex('by-album', 'album');
          store.createIndex('by-added', 'addedAt');
        }
        if (!db.objectStoreNames.contains('playlists')) {
          const store = db.createObjectStore('playlists', { keyPath: 'id' });
          store.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offline')) {
          const store = db.createObjectStore('offline', { keyPath: 'trackId' });
          store.createIndex('by-saved', 'savedAt');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
        if (!db.objectStoreNames.contains('artwork')) {
          db.createObjectStore('artwork', { keyPath: 'key' });
        }
      },
      blocked() {
        console.warn('[db] otra pestana tiene abierta una version anterior de la base.');
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------- tracks

export async function getAllTracks(): Promise<Track[]> {
  return (await getDB()).getAll('tracks');
}

export async function putTrack(track: Track): Promise<void> {
  await (await getDB()).put('tracks', track);
}

export async function putTracks(tracks: readonly Track[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('tracks', 'readwrite');
  await Promise.all([...tracks.map((t) => tx.store.put(t)), tx.done]);
}

export async function getTrack(id: string): Promise<Track | undefined> {
  return (await getDB()).get('tracks', id);
}

export async function deleteTracks(ids: readonly string[]): Promise<void> {
  const database = await getDB();
  const tx = database.transaction(['tracks', 'offline', 'artwork'], 'readwrite');
  await Promise.all([
    ...ids.map((id) => tx.objectStore('tracks').delete(id)),
    ...ids.map((id) => tx.objectStore('offline').delete(id)),
    ...ids.map((id) => tx.objectStore('artwork').delete(id)),
    tx.done,
  ]);
}

export async function deleteTrack(id: string): Promise<void> {
  await deleteTracks([id]);
}

export async function updateTrackPlayStats(id: string, deltaCount = 1): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('tracks', 'readwrite');
  const track = await tx.store.get(id);
  if (track) {
    track.playCount += deltaCount;
    track.lastPlayedAt = Date.now();
    await tx.store.put(track);
  }
  await tx.done;
}

// ------------------------------------------------------------ playlists

export async function getAllPlaylists(): Promise<Playlist[]> {
  return (await getDB()).getAll('playlists');
}

export async function putPlaylist(playlist: Playlist): Promise<void> {
  await (await getDB()).put('playlists', playlist);
}

export async function deletePlaylist(id: string): Promise<void> {
  await (await getDB()).delete('playlists', id);
}

// --------------------------------------------------------------- folders

export async function getAllFolders(): Promise<MusicFolder[]> {
  return (await getDB()).getAll('folders');
}

export async function putFolder(folder: MusicFolder): Promise<void> {
  await (await getDB()).put('folders', folder);
}

export async function deleteFolder(id: string): Promise<void> {
  await (await getDB()).delete('folders', id);
}

// --------------------------------------------------------------- offline

export async function getOfflineIds(): Promise<string[]> {
  const keys = await (await getDB()).getAllKeys('offline');
  return keys.map(String);
}

export async function getOfflineEntry(trackId: string): Promise<OfflineEntry | undefined> {
  return (await getDB()).get('offline', trackId);
}

export async function putOfflineEntry(entry: OfflineEntry): Promise<void> {
  await (await getDB()).put('offline', entry);
}

export async function deleteOfflineEntry(trackId: string): Promise<void> {
  await (await getDB()).delete('offline', trackId);
}

export async function clearOffline(): Promise<void> {
  await (await getDB()).clear('offline');
}

export async function offlineUsage(): Promise<{ usage: number; quota: number }> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  const est = await navigator.storage.estimate();
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
}

/** Pide almacenamiento persistente para que el navegador no tire lo guardado offline. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

// --------------------------------------------------------------- artwork

export async function getArtwork(key: string): Promise<{ key: string; blob: Blob; type: string } | undefined> {
  return (await getDB()).get('artwork', key);
}

export async function putArtwork(entry: { key: string; blob: Blob; type: string }): Promise<void> {
  await (await getDB()).put('artwork', entry);
}

export async function deleteArtwork(key: string): Promise<void> {
  await (await getDB()).delete('artwork', key);
}

// ------------------------------------------------------------------ meta

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const stored = (await (await getDB()).get('meta', `setting:${key}`)) as Settings[K] | undefined;
  return stored === undefined ? DEFAULT_SETTINGS[key] : stored;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await (await getDB()).put('meta', value, `setting:${key}`);
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const stored = (await (await getDB()).get('meta', key)) as T | undefined;
  return stored === undefined ? fallback : stored;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await getDB()).put('meta', value, key);
}

/** Borrado total: biblioteca, playlists, carpetas y cache offline. */
export async function wipeEverything(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['tracks', 'playlists', 'folders', 'offline', 'meta', 'artwork'], 'readwrite');
  await Promise.all([
    tx.objectStore('tracks').clear(),
    tx.objectStore('playlists').clear(),
    tx.objectStore('folders').clear(),
    tx.objectStore('offline').clear(),
    tx.objectStore('meta').clear(),
    tx.objectStore('artwork').clear(),
    tx.done,
  ]);
}
