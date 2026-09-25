import * as db from '../lib/db';

const MAX_EDGE = 420;
const QUALITY = 0.82;

const objectUrls = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();

/** Guarda la caratula embebida del archivo (ID3 / Vorbis / FLAC) como imagen pequena. */
export async function storeArtwork(trackId: string, picture: Blob, mimeType: string): Promise<void> {
  try {
    const resized = await resizeImage(picture);
    await db.putArtwork({ key: trackId, blob: resized, type: mimeType || resized.type });
  } catch (err) {
    console.warn('[artwork] no se pudo procesar la caratula', err);
  }
}

async function resizeImage(source: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') return source;
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  return blob.size < source.size ? blob : source;
}

/** Devuelve una object URL para la caratula local, cacheada por sesion. */
export function localArtworkUrl(trackId: string): string | undefined {
  return objectUrls.get(trackId);
}

export async function loadArtworkUrl(trackId: string): Promise<string | undefined> {
  const cached = objectUrls.get(trackId);
  if (cached) return cached;

  const existing = pending.get(trackId);
  if (existing) return existing;

  const task = (async () => {
    const entry = await db.getArtwork(trackId);
    if (!entry) return undefined;
    const url = URL.createObjectURL(entry.blob);
    objectUrls.set(trackId, url);
    return url;
  })();

  pending.set(trackId, task);
  try {
    return await task;
  } finally {
    pending.delete(trackId);
  }
}

export function revokeArtworkUrls(): void {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}

export function artworkUrlFor(track: { id: string; artworkUrl?: string }): string | undefined {
  return track.artworkUrl ?? localArtworkUrl(track.id);
}
