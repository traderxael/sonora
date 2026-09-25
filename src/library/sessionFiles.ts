/**
 * Archivos importados con <input webkitdirectory>: no sobreviven a la sesion,
 * asi que se guardan aqui para poder reproducirlos mientras la pestana siga abierta.
 */
const sessionFiles = new Map<string, File>();

export function registerSessionFiles(files: Map<string, File>): void {
  for (const [id, file] of files) sessionFiles.set(id, file);
}

export function getSessionFile(trackId: string): File | undefined {
  return sessionFiles.get(trackId);
}

export function hasSessionFiles(): boolean {
  return sessionFiles.size > 0;
}

export function clearSessionFiles(): void {
  sessionFiles.clear();
}
