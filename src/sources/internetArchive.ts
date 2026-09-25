import type { RemoteCandidate, SearchProvider, SearchQuery } from '../lib/types';

const ADVANCED_SEARCH = 'https://archive.org/advancedsearch.php';
const DETAILS = 'https://archive.org/metadata/';

const AUDIO_EXT = /\.(mp3|ogg|m4a|flac|wav|aac|opus)$/i;

/** Formatos que el navegador reproduce de forma nativa. */
const PREFERRED_EXT = ['mp3', 'ogg', 'm4a', 'aac', 'opus', 'flac', 'wav'];

interface AdvancedDoc {
  identifier: string;
  title?: string | string[];
  creator?: string | string[];
  year?: number | string;
  downloads?: number;
}

function asString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

interface ArchiveFile {
  name: string;
  format?: string;
  size?: number;
  length?: string;
  title?: string;
  artist?: string;
  track?: string;
  album?: string;
  albumartist?: string;
}

function pickAudioFile(files: readonly ArchiveFile[]): ArchiveFile | undefined {
  const usable = files.filter(
    (f) => AUDIO_EXT.test(f.name) && !f.name.startsWith('__') && !/\.spectrogram\.|\.files\.xml$/.test(f.name),
  );
  if (usable.length === 0) return undefined;
  for (const ext of PREFERRED_EXT) {
    const match = usable.find((f) => f.name.toLowerCase().endsWith(`.${ext}`));
    if (match) return match;
  }
  return usable[0];
}

function parseLength(file: ArchiveFile): number | undefined {
  if (!file.length) return undefined;
  const seconds = Number(file.length);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export const internetArchive: SearchProvider = {
  id: 'internet-archive',
  name: 'Internet Archive',
  homepage: 'https://archive.org',
  attribution: 'Internet Archive - contenidos de dominio publico y con licencia libre',

  async search({ term, limit, signal }: SearchQuery): Promise<RemoteCandidate[]> {
    const fl = ['identifier', 'title', 'creator', 'year', 'downloads'];
    const params = new URLSearchParams({
      q: `(${term.replace(/["\\]/g, ' ').trim()}) AND mediatype:(audio)`,
      rows: String(Math.min(limit, 40)),
      page: '1',
      sort: 'downloads desc',
      output: 'json',
    });
    for (const field of fl) params.append('fl[]', field);

    const response = await fetch(`${ADVANCED_SEARCH}?${params}`, { signal });
    if (!response.ok) throw new Error(`Internet Archive respondió ${response.status}`);
    const json = (await response.json()) as { response?: { docs?: AdvancedDoc[] } };
    const docs = json.response?.docs ?? [];
    if (docs.length === 0) return [];

    const results = await Promise.all(
      docs.map(async (doc): Promise<RemoteCandidate | null> => {
        try {
          const metaResponse = await fetch(`${DETAILS}${encodeURIComponent(doc.identifier)}`, { signal });
          if (!metaResponse.ok) return null;
          const meta = (await metaResponse.json()) as {
            files?: ArchiveFile[];
            metadata?: { licenseurl?: string; rights?: string; title?: string };
          };
          const file = pickAudioFile(meta.files ?? []);
          if (!file) return null;

          const title =
            file.title ??
            asString(doc.title) ??
            meta.metadata?.title ??
            file.name.replace(/\.[a-z0-9]+$/i, '');
          const artist = file.artist ?? file.albumartist ?? asString(doc.creator) ?? 'Desconocido';
          const license = meta.metadata?.licenseurl ?? meta.metadata?.rights ?? 'Dominio publico / libre';

          return {
            key: `${doc.identifier}/${file.name}`,
            title,
            artist,
            album: file.album ?? '',
            duration: parseLength(file),
            artworkUrl: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
            streamUrl: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURI(file.name)}`,
            source: 'internet-archive',
            sourceRef: doc.identifier,
            license,
            licenseUrl: typeof meta.metadata?.licenseurl === 'string' ? meta.metadata.licenseurl : undefined,
            attribution: `Internet Archive · ${doc.identifier}`,
            homeUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
          };
        } catch {
          return null;
        }
      }),
    );

    return results.filter((r): r is RemoteCandidate => r !== null);
  },
};
