import * as db from '../lib/db';
import { hashString, basename, fileStem, audioExtensionOf, errorMessage } from '../lib/utils';
import type { MusicFolder, Track } from '../lib/types';
import { storeArtwork } from './artwork';
import { walkAudioFiles, type FoundFile } from './directories';

export interface ScanResult {
  folderId: string;
  added: number;
  updated: number;
  removed: number;
  errors: string[];
  tracks: Track[];
}

interface ParsedTags {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  duration?: number;
  picture?: { data: Uint8Array; format: string };
}

type MetadataModule = typeof import('music-metadata');

let metadataPromise: Promise<MetadataModule> | null = null;

/** music-metadata pesa bastante: se carga solo cuando hace falta escanear. */
function loadMetadata(): Promise<MetadataModule> {
  if (!metadataPromise) metadataPromise = import('music-metadata');
  return metadataPromise;
}

async function readTags(file: Blob): Promise<ParsedTags> {
  try {
    const mm = await loadMetadata();
    const meta = await mm.parseBlob(file, { duration: true });
    const common = meta.common;
    const picture = common.picture?.[0];
    return {
      title: common.title,
      artist: common.artist ?? common.albumartist ?? common.artists?.join(', '),
      album: common.album,
      year: typeof common.year === 'number' ? common.year : undefined,
      genre: common.genre?.[0],
      duration: typeof meta.format.duration === 'number' ? meta.format.duration : undefined,
      picture: picture ? { data: picture.data, format: picture.format } : undefined,
    };
  } catch (err) {
    console.warn('[scanner] no se pudo leer metadata', errorMessage(err));
    return {};
  }
}

/** Si el archivo no trae tags, intenta deducir artista/titulo del nombre. */
function fromFileName(path: string): { title: string; artist: string; album: string } {
  const stem = fileStem(path);
  const parts = stem.split(' - ').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { artist: parts[0], title: parts.slice(1).join(' - '), album: parts[2] };
  if (parts.length === 2) return { artist: parts[0], title: parts[1], album: '' };
  return { title: stem || basename(path), artist: 'Desconocido', album: '' };
}

function trackIdFor(folderId: string, path: string): string {
  return `loc_${hashString(`local|${folderId}|${path}`)}`;
}

async function buildTrack(
  folderId: string,
  path: string,
  file: Blob,
  size: number,
  previous?: Track,
): Promise<Track> {
  const tags = await readTags(file);
  const guessed = fromFileName(path);
  const id = trackIdFor(folderId, path);

  const track: Track = {
    id,
    title: tags.title?.trim() || guessed.title,
    artist: tags.artist?.trim() || guessed.artist,
    album: tags.album?.trim() || guessed.album,
    duration: Math.round(tags.duration ?? previous?.duration ?? 0),
    year: tags.year ?? previous?.year,
    genre: tags.genre ?? previous?.genre,
    source: 'local',
    sourceRef: `${folderId}:${path}`,
    filePath: path,
    fileName: basename(path),
    fileSize: size,
    addedAt: previous?.addedAt ?? Date.now(),
    playCount: previous?.playCount ?? 0,
    lastPlayedAt: previous?.lastPlayedAt,
  };

  if (tags.picture && !previous?.artworkUrl) {
    const mime = tags.picture.format ? `image/${tags.picture.format.toLowerCase()}` : 'image/jpeg';
    const bytes = tags.picture.data;
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime });
    await storeArtwork(id, blob, mime);
  }

  return track;
}

export interface ScanCallbacks {
  onProgress?: (done: number, total: number, current: string) => void;
  signal?: AbortSignal;
}

/** Escanea una carpeta registrada usando su handle persistente. */
export async function scanFolder(folder: MusicFolder, callbacks: ScanCallbacks = {}): Promise<ScanResult> {
  const result: ScanResult = { folderId: folder.id, added: 0, updated: 0, removed: 0, errors: [], tracks: [] };

  if (!folder.handle) {
    result.errors.push('La carpeta no tiene permiso de lectura en esta sesion.');
    return result;
  }

  let files: FoundFile[];
  try {
    files = await walkAudioFiles(folder.handle, (count, path) => {
      callbacks.onProgress?.(count, count, path);
    });
  } catch (err) {
    result.errors.push(`No se pudo leer la carpeta: ${errorMessage(err)}`);
    return result;
  }

  callbacks.onProgress?.(0, files.length, '');

  const seen = new Set<string>();
  const batch: Track[] = [];
  const existing = new Map(
    (await db.getAllTracks())
      .filter((t) => t.sourceRef?.startsWith(`${folder.id}:`))
      .map((t) => [t.sourceRef!.slice(folder.id.length + 1), t]),
  );

  for (const found of files) {
    if (callbacks.signal?.aborted) {
      result.errors.push('Escaneo cancelado');
      break;
    }
    seen.add(found.path);
    try {
      const file = await found.handle.getFile();
      const previous = existing.get(found.path);
      const track = await buildTrack(folder.id, found.path, file, found.size, previous);
      batch.push(track);
      if (previous) result.updated++;
      else result.added++;
      if (batch.length >= 50) {
        await db.putTracks(batch.splice(0, batch.length));
        callbacks.onProgress?.(seen.size, files.length, found.path);
      }
    } catch (err) {
      result.errors.push(`${found.path}: ${errorMessage(err)}`);
    }
  }

  if (batch.length > 0) await db.putTracks(batch);
  result.tracks = batch;

  const stale = [...existing.entries()].filter(([path]) => !seen.has(path)).map(([, t]) => t.id);
  if (stale.length > 0) {
    await db.deleteTracks(stale);
    result.removed = stale.length;
  }

  await db.putFolder({ ...folder, lastScanAt: Date.now(), trackCount: result.added + result.updated });
  callbacks.onProgress?.(files.length, files.length, '');
  return result;
}

export interface InputScanResult extends ScanResult {
  /** Archivos de la sesion actual, por id de pista. */
  files: Map<string, File>;
}

/** Fallback sin File System Access API: se importan archivos y se leen en la sesion. */
export async function scanInputFiles(
  entries: readonly { path: string; file: File }[],
  folderName: string,
  callbacks: ScanCallbacks = {},
): Promise<InputScanResult> {
  const folderId = `in_${hashString(`input|${folderName}`)}`;
  const files = new Map<string, File>();
  const result: InputScanResult = { folderId, added: 0, updated: 0, removed: 0, errors: [], tracks: [], files };

  const existing = new Map(
    (await db.getAllTracks())
      .filter((t) => t.sourceRef?.startsWith(`${folderId}:`))
      .map((t) => [t.sourceRef!.slice(folderId.length + 1), t]),
  );

  const seen = new Set<string>();
  const batch: Track[] = [];

  for (let i = 0; i < entries.length; i++) {
    if (callbacks.signal?.aborted) {
      result.errors.push('Importacion cancelada');
      break;
    }
    const entry = entries[i];
    const id = trackIdFor(folderId, entry.path);
    seen.add(entry.path);
    try {
      const previous = existing.get(entry.path);
      const track = await buildTrack(folderId, entry.path, entry.file, entry.file.size, previous);
      batch.push(track);
      files.set(id, entry.file);
      if (previous) result.updated++;
      else result.added++;
      if (batch.length >= 50) await db.putTracks(batch.splice(0, batch.length));
    } catch (err) {
      result.errors.push(`${entry.path}: ${errorMessage(err)}`);
    }
    callbacks.onProgress?.(i + 1, entries.length, entry.path);
  }

  if (batch.length > 0) await db.putTracks(batch);
  result.tracks = batch;

  const staleIds = [...existing.entries()].filter(([path]) => !seen.has(path)).map(([, t]) => t.id);
  if (staleIds.length > 0) {
    await db.deleteTracks(staleIds);
    result.removed = staleIds.length;
  }

  await db.putFolder({
    id: folderId,
    name: folderName,
    kind: 'session',
    addedAt: Date.now(),
    trackCount: result.added + result.updated,
    enabled: true,
  });

  return result;
}

export function guessMimeType(path: string): string {
  switch (audioExtensionOf(path)) {
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
    case 'm4b':
    case 'aac':
      return 'audio/mp4';
    case 'oga':
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    case 'wav':
      return 'audio/wav';
    case 'weba':
      return 'audio/webm';
    default:
      return 'audio/mpeg';
  }
}
