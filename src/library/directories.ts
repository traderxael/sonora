import { isAudioFile } from '../lib/utils';

export interface FoundFile {
  /** Ruta relativa con separador "/". */
  path: string;
  handle: FileSystemFileHandle;
  size: number;
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFileSystemAccess()) {
    throw new Error(
      'Este navegador no permite elegir carpetas. Usa Chrome, Edge u Opera, o importa archivos individuales.',
    );
  }
  return window.showDirectoryPicker!({ id: 'sonora-music', mode: 'read' });
}

export async function ensureReadPermission(handle: FileSystemHandle): Promise<boolean> {
  if (typeof handle.queryPermission !== 'function') return true;
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
  return (await handle.requestPermission?.({ mode: 'read' })) === 'granted';
}

const IGNORED_DIRS = new Set(['$recycle.bin', 'system volume information', '.git', 'node_modules']);

/** Recorre el arbol de una carpeta y devuelve solo los archivos de audio. */
export async function walkAudioFiles(
  root: FileSystemDirectoryHandle,
  onProgress?: (count: number, path: string) => void,
): Promise<FoundFile[]> {
  const found: FoundFile[] = [];
  let count = 0;

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const entry of dir.values()) {
      if (entry.kind === 'directory') {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`);
        continue;
      }
      if (!isAudioFile(entry.name) || entry.name.startsWith('.')) continue;
      const fileHandle = entry as FileSystemFileHandle;
      let size = 0;
      try {
        size = (await fileHandle.getFile()).size;
      } catch {
        continue; // archivo inaccesible o bloqueado
      }
      found.push({ path: `${prefix}${entry.name}`, handle: fileHandle, size });
      count++;
      onProgress?.(count, `${prefix}${entry.name}`);
    }
  }

  await walk(root, '');
  found.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
  return found;
}

const pathCache = new Map<string, Map<string, File>>();

function cacheKey(folderId: string): Map<string, File> {
  let map = pathCache.get(folderId);
  if (!map) {
    map = new Map();
    pathCache.set(folderId, map);
  }
  return map;
}

/** Resuelve un archivo por ruta relativa, con cache por sesion. */
export async function resolveFile(
  folderId: string,
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<File | null> {
  const cached = cacheKey(folderId).get(relPath);
  if (cached) return cached;

  const segments = relPath.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  let dir = root;
  for (let i = 0; i < segments.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(segments[i]);
    } catch {
      return null;
    }
  }
  try {
    const handle = await dir.getFileHandle(segments[segments.length - 1]);
    const file = await handle.getFile();
    if (file.size === 0) return null;
    cacheKey(folderId).set(relPath, file);
    return file;
  } catch {
    return null;
  }
}

export function clearFileCache(): void {
  pathCache.clear();
}

/**
 * Fallback para navegadores sin File System Access API:
 * recorre un FileList con webkitRelativePath.
 */
export function filesFromInput(list: FileList | null): { path: string; file: File }[] {
  if (!list) return [];
  const out: { path: string; file: File }[] = [];
  for (const file of Array.from(list)) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (!isAudioFile(path)) continue;
    out.push({ path, file });
  }
  return out;
}
