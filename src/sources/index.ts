import { hashString } from '../lib/utils';
import type { RemoteCandidate, SearchProvider, Track } from '../lib/types';
import { internetArchive } from './internetArchive';
import { openverse } from './openverse';
import { wikimediaCommons } from './wikimediaCommons';

export const providers: SearchProvider[] = [internetArchive, openverse, wikimediaCommons];

export function providerById(id: string): SearchProvider | undefined {
  return providers.find((p) => p.id === id);
}

/** Convierte un resultado de fuente en una pista de la biblioteca. */
export function candidateToTrack(candidate: RemoteCandidate): Track {
  return {
    id: `rem_${hashString(`${candidate.source}|${candidate.key}`)}`,
    title: candidate.title,
    artist: candidate.artist,
    album: candidate.album ?? '',
    duration: Math.round(candidate.duration ?? 0),
    artworkUrl: candidate.artworkUrl,
    source: candidate.source,
    sourceRef: candidate.sourceRef,
    streamUrl: candidate.streamUrl,
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    attribution: candidate.attribution,
    homeUrl: candidate.homeUrl,
    addedAt: Date.now(),
    playCount: 0,
  };
}

export interface AggregatedSearch {
  results: RemoteCandidate[];
  errors: { provider: string; message: string }[];
}

export async function searchAllSources(
  term: string,
  limit: number,
  signal: AbortSignal,
  onProvider?: (id: string, status: 'loading' | 'ready' | 'error', message?: string) => void,
): Promise<AggregatedSearch> {
  const settled = await Promise.allSettled(
    providers.map(async (provider) => {
      onProvider?.(provider.id, 'loading');
      try {
        const results = await provider.search({ term, limit, signal });
        onProvider?.(provider.id, 'ready');
        return { provider: provider.id, results };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        onProvider?.(provider.id, 'error', message);
        throw Object.assign(new Error(message), { providerId: provider.id });
      }
    }),
  );

  const results: RemoteCandidate[] = [];
  const errors: { provider: string; message: string }[] = [];
  for (const item of settled) {
    if (item.status === 'fulfilled') results.push(...item.value.results);
    else errors.push({ provider: (item.reason as { providerId?: string }).providerId ?? 'desconocida', message: item.reason?.message ?? 'Error' });
  }
  return { results, errors };
}
