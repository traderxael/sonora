import type { RemoteCandidate, SearchProvider, SearchQuery } from '../lib/types';

const API = 'https://commons.wikimedia.org/w/api.php';
const ORIGIN = '*';

const PLAYABLE = /\.(ogg|oga|mp3|wav|flac|opus|m4a)$/i;

interface CommonsImageInfo {
  url: string;
  descriptionurl?: string;
  size?: number;
  duration?: number;
  mime?: string;
  mediatype?: string;
}

interface CommonsPage {
  pageid: number;
  title: string;
  imageinfo?: CommonsImageInfo[];
}

const LICENSE_BADGES: { pattern: RegExp; name: string; url: string }[] = [
  { pattern: /public domain/i, name: 'Dominio publico', url: 'https://creativecommons.org/publicdomain/mark/1.0/' },
  { pattern: /cc0/i, name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { pattern: /cc[ -]?by(?:[ -]sa|[ -]?nc)?/i, name: 'CC BY', url: 'https://creativecommons.org/licenses/by/4.0/' },
];

/** Quita el subfijo de "File:" y la extension para usar como titulo. */
function humanizeTitle(title: string): string {
  return title
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function licenseFor(descriptionUrl: string | undefined): { name?: string; url?: string } {
  if (!descriptionUrl) return {};
  for (const badge of LICENSE_BADGES) {
    if (badge.pattern.test(descriptionUrl)) return { name: badge.name, url: badge.url };
  }
  return {};
}

export const wikimediaCommons: SearchProvider = {
  id: 'wikimedia-commons',
  name: 'Wikimedia Commons',
  homepage: 'https://commons.wikimedia.org',
  attribution: 'Wikimedia Commons - audios libres y de dominio publico',

  async search({ term, limit, signal }: SearchQuery): Promise<RemoteCandidate[]> {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: ORIGIN,
      generator: 'search',
      gsrsearch: `filetype:audio ${term}`,
      gsrnamespace: '6',
      gsrlimit: String(Math.min(limit, 30)),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|mediatype|metadata|extmetadata',
    });

    const response = await fetch(`${API}?${params}`, { signal });
    if (!response.ok) throw new Error(`Wikimedia respondió ${response.status}`);

    const json = (await response.json()) as {
      query?: { pages?: Record<string, CommonsPage> };
    };
    const pages = Object.values(json.query?.pages ?? {});

    return pages
      .map((page): RemoteCandidate | null => {
        const info = page.imageinfo?.[0];
        if (!info?.url) return null;

        // La API devuelve la URL con parametros de tracking (?utm_source=...).
        // Hay que sacarlos antes de mirar la extension y antes de cachear.
        const cleanUrl = info.url.split('?')[0];
        if (!PLAYABLE.test(cleanUrl)) return null;

        const license = licenseFor(info.descriptionurl);

        return {
          key: `wc_${page.pageid}`,
          title: humanizeTitle(page.title) || 'Audio sin titulo',
          artist: 'Wikimedia Commons',
          album: 'Wikimedia Commons',
          duration: typeof info.duration === 'number' ? info.duration : undefined,
          streamUrl: cleanUrl,
          source: 'wikimedia-commons',
          sourceRef: String(page.pageid),
          license: license.name ?? 'Ver pagina de la fuente',
          licenseUrl: license.url ?? info.descriptionurl,
          attribution: 'Wikimedia Commons',
          homeUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
        };
      })
      .filter((item): item is RemoteCandidate => item !== null);
  },
};
