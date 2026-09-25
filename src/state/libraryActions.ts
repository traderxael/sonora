import * as db from '../lib/db';
import { uid, pluralize, errorMessage, formatRelative } from '../lib/utils';
import type { MusicFolder } from '../lib/types';
import { getState, setFolders, setScanProgress, upsertTracks, removeTracks } from './store';
import { pickDirectory, ensureReadPermission, supportsFileSystemAccess, filesFromInput } from '../library/directories';
import { scanFolder, scanInputFiles } from '../library/scanner';
import { registerSessionFiles } from '../library/sessionFiles';
import { loadArtworkUrl, revokeArtworkUrls } from '../library/artwork';
import { toast } from '../ui/toast';

async function refreshFolders(): Promise<void> {
  setFolders(await db.getAllFolders());
}

function reportScan(folderName: string): (done: number, total: number, current: string) => void {
  return (done, total, current) => {
    setScanProgress({ folderName, done, total, current });
  };
}

/** Elige una carpeta del disco y la escanea. */
export async function addFolderFlow(): Promise<void> {
  if (getState().scan) {
    toast({ message: 'Ya hay un escaneo en curso.', kind: 'warning' });
    return;
  }

  let handle: FileSystemDirectoryHandle | null = null;
  try {
    handle = await pickDirectory();
  } catch (err) {
    const message = errorMessage(err);
    if (!/abort/i.test(message)) toast({ message, kind: 'error' });
    return;
  }
  if (!handle) return;

  if (!(await ensureReadPermission(handle))) {
    toast({ message: 'No se pudo obtener permiso de lectura para esa carpeta.', kind: 'error' });
    return;
  }

  const folder: MusicFolder = {
    id: `fld_${uid('')}`,
    name: handle.name,
    kind: 'handle',
    handle,
    addedAt: Date.now(),
    trackCount: 0,
    enabled: true,
  };
  await db.putFolder(folder);
  await refreshFolders();
  await runScan(folder);
}

async function runScan(folder: MusicFolder): Promise<void> {
  const started = Date.now();
  setScanProgress({ folderName: folder.name, done: 0, total: 0, current: '' });
  try {
    const result = await scanFolder(folder, { onProgress: reportScan(folder.name) });
    const parts: string[] = [];
    if (result.added > 0) parts.push(`${result.added} ${pluralize(result.added, 'pista')} nueva${result.added === 1 ? '' : 's'}`);
    if (result.updated > 0) parts.push(`${result.updated} actualizada${result.updated === 1 ? '' : 's'}`);
    if (result.removed > 0) parts.push(`${result.removed} eliminada${result.removed === 1 ? '' : 's'}`);

    const tracks = await db.getAllTracks();
    upsertTracks(tracks);
    for (const track of tracks) {
      if (track.source === 'local' && !track.artworkUrl) void loadArtworkUrl(track.id);
    }
    await refreshFolders();

    const seconds = (Date.now() - started) / 1000;
    toast({
      message: parts.length > 0 ? `${folder.name}: ${parts.join(', ')} en ${seconds.toFixed(1)} s` : `${folder.name}: sin cambios`,
      kind: result.added > 0 ? 'success' : 'info',
    });

    if (result.errors.length > 0) {
      toast({
        message: `${result.errors.length} archivo(s) no se pudieron leer.`,
        kind: 'warning',
        action: { label: 'Ver detalle', onClick: () => console.warn(result.errors) },
      });
    }
  } catch (err) {
    toast({ message: `Fallo el escaneo: ${errorMessage(err)}`, kind: 'error' });
  } finally {
    setScanProgress(null);
  }
}

export async function rescanFolder(folderId: string): Promise<void> {
  const folder = getState().folders.find((f) => f.id === folderId);
  if (!folder) return;
  if (folder.kind !== 'handle' || !folder.handle) {
    toast({ message: 'Esta carpeta fue importada en una sesion anterior. Volvela a importar.', kind: 'warning' });
    return;
  }
  if (!(await ensureReadPermission(folder.handle))) {
    toast({ message: 'El navegador pide permiso de nuevo para leer la carpeta.', kind: 'warning' });
    return;
  }
  await runScan(folder);
}

export async function rescanAllFolders(): Promise<void> {
  const folders = getState().folders.filter((f) => f.kind === 'handle' && f.handle);
  for (const folder of folders) {
    if (folder.handle && !(await ensureReadPermission(folder.handle))) continue;
    await runScan(folder);
  }
}

export async function removeFolder(folderId: string, alsoRemoveTracks: boolean): Promise<void> {
  const folder = getState().folders.find((f) => f.id === folderId);
  if (!folder) return;

  if (alsoRemoveTracks) {
    const tracks = [...getState().tracks.values()].filter((t) => t.sourceRef?.startsWith(`${folderId}:`));
    await db.deleteTracks(tracks.map((t) => t.id));
    removeTracks(tracks.map((t) => t.id));
    revokeArtworkUrls();
  }

  await db.deleteFolder(folderId);
  await refreshFolders();
  toast({ message: `Carpeta "${folder.name}" quitada${alsoRemoveTracks ? ' con sus pistas' : ''}` });
}

export function createFolderInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'audio/*,.mp3,.ogg,.m4a,.flac,.wav,.opus,.aac,.webm';
  const withWebkit = input as HTMLInputElement & { webkitdirectory: boolean };
  withWebkit.webkitdirectory = true;
  input.style.display = 'none';
  document.body.append(input);
  return input;
}

/** Fallback para navegadores sin File System Access API. */
export async function importFilesFlow(): Promise<void> {
  if (supportsFileSystemAccess()) {
    await addFolderFlow();
    return;
  }
  const input = createFolderInput();
  const cleanup = () => input.remove();
  input.addEventListener('change', async () => {
    try {
      const entries = filesFromInput(input.files);
      if (entries.length === 0) {
        toast({ message: 'No se encontraron archivos de audio.', kind: 'warning' });
        return;
      }
      const folderName = entries[0]?.path.split('/')[0] ?? 'Importados';
      setScanProgress({ folderName, done: 0, total: entries.length, current: '' });
      const result = await scanInputFiles(entries, folderName, {
        onProgress: (done, total, current) => setScanProgress({ folderName, done, total, current }),
      });
      registerSessionFiles(result.files);
      const tracks = await db.getAllTracks();
      upsertTracks(tracks);
      await refreshFolders();
      toast({
        message: `${folderName}: ${result.added} ${pluralize(result.added, 'pista')} importada${result.added === 1 ? '' : 's'}`,
        kind: 'success',
      });
    } catch (err) {
      toast({ message: `Fallo la importacion: ${errorMessage(err)}`, kind: 'error' });
    } finally {
      setScanProgress(null);
      cleanup();
    }
  });
  input.click();
}

export function folderSummary(folder: MusicFolder): string {
  const last = folder.lastScanAt ? `· escaneada ${formatRelative(folder.lastScanAt)}` : '';
  return `${folder.trackCount} ${pluralize(folder.trackCount, 'pista')}${last}`;
}
