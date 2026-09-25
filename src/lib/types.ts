export type SourceId = 'local' | 'internet-archive' | 'openverse' | 'wikimedia-commons';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Duracion en segundos. 0 si no se pudo determinar. */
  duration: number;
  year?: number;
  genre?: string;
  artworkUrl?: string;
  source: SourceId;
  /** Identificador estable dentro de la fuente. */
  sourceRef?: string;
  /** URL de audio remota (solo fuentes en linea). */
  streamUrl?: string;
  /** Ruta relativa del archivo dentro de la carpeta local elegida. */
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  homeUrl?: string;
  addedAt: number;
  playCount: number;
  lastPlayedAt?: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
  /** Color de acento en hex para pintar el encabezado. */
  accent?: string;
}

export interface MusicFolder {
  id: string;
  name: string;
  /** "handle": carpeta con permiso persistente. "session": importada, solo vive esta sesion. */
  kind: 'handle' | 'session';
  handle?: FileSystemDirectoryHandle;
  addedAt: number;
  lastScanAt?: number;
  trackCount: number;
  enabled: boolean;
}

export interface OfflineEntry {
  trackId: string;
  blob: Blob;
  size: number;
  savedAt: number;
  contentType?: string;
}

export interface RemoteCandidate {
  /** Clave unica dentro de la fuente. */
  key: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  artworkUrl?: string;
  streamUrl: string;
  source: SourceId;
  sourceRef: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  homeUrl?: string;
}

export interface SearchQuery {
  term: string;
  limit: number;
  signal?: AbortSignal;
}

export interface SearchProvider {
  id: Exclude<SourceId, 'local'>;
  name: string;
  homepage: string;
  attribution: string;
  search(query: SearchQuery): Promise<RemoteCandidate[]>;
}

export type RepeatMode = 'off' | 'all' | 'one';

export type RouteName = 'home' | 'search' | 'library' | 'playlist' | 'likes' | 'settings' | 'now-playing';

export interface Route {
  name: RouteName;
  params: Record<string, string>;
}

export interface Settings {
  volume: number;
  crossfadeSeconds: number;
  visualizer: boolean;
  autoDownloadRemote: boolean;
  onlyFreeSources: true;
  analyticsOptIn: boolean;
}

export interface DownloadProgress {
  trackId: string;
  pct: number;
  state: 'downloading' | 'done' | 'error' | 'canceled';
  error?: string;
}

export interface ScanProgress {
  folderName: string;
  done: number;
  total: number;
  current: string;
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.85,
  crossfadeSeconds: 0,
  visualizer: true,
  autoDownloadRemote: false,
  onlyFreeSources: true,
  analyticsOptIn: false,
};
