import * as db from '../lib/db';
import { errorMessage, formatBytes } from '../lib/utils';
import type { Track } from '../lib/types';
import { getSessionFile } from '../library/sessionFiles';
import { resolveFile, ensureReadPermission } from '../library/directories';
import { getState, setOffline, setStorage, setDownload, getTrack, upsertTracks } from '../state/store';

export class NeedsPermissionError extends Error {
  constructor() {
    super('El navegador necesita permiso para leer esa carpeta de nuevo.');
    this.name = 'NeedsPermissionError';
  }
}

export interface ResolvedAudio {
  url: string;
  kind: 'offline' | 'session' | 'local' | 'remote';
  /** Hay que llamarlo cuando se termine de usar la URL. */
  release: () => void;
}

function objectUrlOf(blob: Blob): ResolvedAudio {
  const url = URL.createObjectURL(blob);
  return { url, kind: 'offline', release: () => URL.revokeObjectURL(url) };
}

/** Traduce la pista a algo que el elemento <audio> pueda reproducir. */
export async function resolveAudio(track: Track): Promise<ResolvedAudio> {
  const offline = await db.getOfflineEntry(track.id);
  if (offline) return objectUrlOf(offline.blob);

  const sessionFile = getSessionFile(track.id);
  if (sessionFile) {
    const url = URL.createObjectURL(sessionFile);
    return { url, kind: 'session', release: () => URL.revokeObjectURL(url) };
  }

  if (track.source === 'local' && track.filePath && track.sourceRef) {
    const folderId = track.sourceRef.split(':')[0];
    const folder = getState().folders.find((f) => f.id === folderId);
    if (folder?.handle) {
      if (!(await ensureReadPermission(folder.handle))) throw new NeedsPermissionError();
      const file = await resolveFile(folderId, folder.handle, track.filePath);
      if (file) {
        const url = URL.createObjectURL(file);
        return { url, kind: 'local', release: () => URL.revokeObjectURL(url) };
      }
      throw new Error(`No se encuentra el archivo "${track.filePath}". Puede que lo hayas movido o borrado.`);
    }
  }

  if (track.streamUrl) {
    return { url: track.streamUrl, kind: 'remote', release: () => {} };
  }

  throw new Error('Esta pista no tiene una fuente de audio disponible.');
}

export function canDownload(track: Track): boolean {
  return Boolean(track.streamUrl) || track.source === 'local';
}

function folderIdOf(track: Track): string | undefined {
  return track.sourceRef?.split(':')[0];
}

/** Guarda la pista en el dispositivo para escucharla sin internet. */
export async function downloadForOffline(track: Track, signal?: AbortSignal): Promise<void> {
  if (getState().offlineIds.has(track.id)) return;

  setDownload(track.id, { trackId: track.id, pct: 0, state: 'downloading' });
  let lastPct = -1;
  const report = (pct: number) => {
    const rounded = Math.floor(pct);
    if (rounded === lastPct) return;
    lastPct = rounded;
    setDownload(track.id, { trackId: track.id, pct: rounded, state: 'downloading' });
  };

  try {
    const blob = await fetchAsBlob(track, report, signal);
    if (signal?.aborted) throw new DOMException('cancelado', 'AbortError');
    await db.putOfflineEntry({
      trackId: track.id,
      blob,
      size: blob.size,
      savedAt: Date.now(),
      contentType: blob.type || undefined,
    });
    setOffline(track.id, true);
    setDownload(track.id, { trackId: track.id, pct: 100, state: 'done' });
    setStorage(await db.offlineUsage());
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      setDownload(track.id, null);
      return;
    }
    const message = errorMessage(err);
    setDownload(track.id, { trackId: track.id, pct: 0, state: 'error', error: message });
    throw err;
  }
}

/** Registra un archivo obtenido por URL como pista de la biblioteca y copia offline. */
export async function saveBlobForOffline(track: Track, blob: Blob): Promise<void> {
  if (!blob.size) throw new Error('El archivo recibido está vacío.');
  if (getState().tracks.has(track.id)) throw new Error('Esta pista ya existe en tu biblioteca.');

  const entry = {
    trackId: track.id,
    blob,
    size: blob.size,
    savedAt: Date.now(),
    contentType: blob.type || undefined,
  };

  await db.putOfflineEntry(entry);
  try {
    await db.putTrack(track);
  } catch (error) {
    await db.deleteOfflineEntry(track.id).catch(() => undefined);
    throw error;
  }

  upsertTracks([track]);
  setOffline(track.id, true);
  setDownload(track.id, { trackId: track.id, pct: 100, state: 'done' });
  setStorage(await db.offlineUsage());
}

async function fetchAsBlob(track: Track, report: (pct: number) => void, signal?: AbortSignal): Promise<Blob> {
  if (track.source === 'local' && track.filePath) {
    const folderId = folderIdOf(track);
    const folder = getState().folders.find((f) => f.id === folderId);
    if (folder?.handle) {
      if (!(await ensureReadPermission(folder.handle))) throw new NeedsPermissionError();
      const file = await resolveFile(folder.id, folder.handle, track.filePath);
      if (!file) throw new Error('No se encuentra el archivo en disco.');
      return file.type ? file.slice(0, file.size, file.type) : file;
    }
    const sessionFile = getSessionFile(track.id);
    if (sessionFile) return sessionFile;
  }

  if (!track.streamUrl) throw new Error('La pista no se puede descargar.');

  const response = await fetch(track.streamUrl, { signal, mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`El servidor respondio ${response.status}.`);

  const total = Number(response.headers.get('content-length') ?? 0);
  if (!response.body || !total) return response.blob();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      report((received / total) * 100);
    }
  }
  return new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') ?? 'audio/mpeg' });
}

export async function removeOffline(trackId: string): Promise<void> {
  await db.deleteOfflineEntry(trackId);
  setOffline(trackId, false);
  setStorage(await db.offlineUsage());
}

export async function downloadPlaylist(trackIds: readonly string[], onEach?: (id: string) => void): Promise<void> {
  const queue = trackIds.filter((id) => !getState().offlineIds.has(id));
  for (const id of queue) {
    const track = getTrack(id);
    if (!track) continue;
    onEach?.(id);
    try {
      await downloadForOffline(track);
    } catch (err) {
      console.error('[offline] fallo al descargar', track.title, errorMessage(err));
    }
  }
}

export async function clearAllOffline(): Promise<void> {
  await db.clearOffline();
  for (const id of [...getState().offlineIds]) setOffline(id, false);
  setStorage(await db.offlineUsage());
}

export function describeOfflineSize(track: Track): string {
  return track.fileSize ? formatBytes(track.fileSize) : 'audio';
}
