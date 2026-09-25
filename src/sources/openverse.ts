import type { RemoteCandidate, SearchProvider, SearchQuery } from '../lib/types';

const API = 'https://api.openverse.org/v1/audio/';

interface OpenverseResult {
  id: string;
  title?: string;
  creator?: string;
  url: string;
  thumbnail?: string;
  detail_url?: string;
  foreign_landing_url?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
  attribution?: string | null;
  duration?: number | null;
  source?: string;
  provider?: string;
}

const LICENSE_NAMES: Record<string, string> = {
  by: 'CC BY',
  'by-sa': 'CC BY-SA',
  'by-nd': 'CC BY-ND',
  'by-nc': 'CC BY-NC',
  'by-nc-sa': 'CC BY-NC-SA',
  'by-nc-nd': 'CC BY-NC-ND',
  cc0: 'CC0 (dominio publico)',
  pdm: 'Public Domain Mark',
};

export const openverse: SearchProvider = {
  id: 'openverse',
  name: 'Openverse',
  homepage: 'https://openverse.org',
  attribution: 'Openverse - audios con licencias Creative Commons',

  async search({ term, limit, signal }: SearchQuery): Promise<RemoteCandidate[]> {
    const params = new URLSearchParams({
      q: term,
      page_size: String(Math.min(limit, 20)),
      mature: 'false',
    });

    const response = await fetch(`${API}?${params}`, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Openverse respondió ${response.status}`);

    const json = (await response.json()) as { results?: OpenverseResult[] };
    const results = json.results ?? [];

    return results
      .filter((item) => typeof item.url === 'string' && /^https?:/.test(item.url))
      .map((item): RemoteCandidate => {
        const license = item.license ? LICENSE_NAMES[item.license] ?? item.license.toUpperCase() : undefined;
        return {
          key: `ov_${item.id}`,
          title: item.title?.trim() || 'Sin titulo',
          artist: item.creator?.trim() || 'Desconocido',
          album: item.provider ? `Coleccion ${item.provider}` : undefined,
          duration: typeof item.duration === 'number' && item.duration > 0 ? item.duration : undefined,
          artworkUrl: item.thumbnail || undefined,
          streamUrl: item.url,
          source: 'openverse',
          sourceRef: item.id,
          license,
          licenseUrl: item.license_url ?? undefined,
          attribution: item.attribution ?? (item.creator ? `© ${item.creator}` : undefined),
          homeUrl: item.foreign_landing_url ?? item.detail_url,
        };
      });
  },
};
