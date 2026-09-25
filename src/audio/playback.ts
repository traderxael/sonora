import { Emitter } from '../lib/emitter';
import { clamp } from '../lib/utils';

/**
 * Progreso de reproduccion. Vive fuera del store para no repintar las vistas
 * enteras 4 veces por segundo: solo lo escuchan la barra y la vista "reproduciendo".
 */
export const playback = {
  position: 0,
  duration: 0,
  buffered: 0,
};

export const playbackBus = new Emitter<{ tick: undefined; duration: number; reset: undefined }>();

/** Suscriptores con ciclo de vida de vista: se limpian al cambiar de pantalla. */
const viewSubscribers = new Set<() => void>();

export function onPlayback(fn: () => void): () => void {
  viewSubscribers.add(fn);
  return () => viewSubscribers.delete(fn);
}

export function clearPlaybackViewListeners(): void {
  for (const fn of [...viewSubscribers]) {
    viewSubscribers.delete(fn);
  }
}

function publish(event: 'tick' | 'duration' | 'reset', payload?: number): void {
  playbackBus.emit(event, payload as never);
  for (const fn of [...viewSubscribers]) {
    try {
      fn();
    } catch (err) {
      console.error('[playback] fallo en suscriptor de vista', err);
    }
  }
}

export function setPosition(position: number): void {
  playback.position = position;
  publish('tick');
}

export function setDuration(duration: number): void {
  playback.duration = Number.isFinite(duration) ? duration : 0;
  publish('duration', playback.duration);
}

export function setBuffered(buffered: number): void {
  playback.buffered = buffered;
}

export function resetPlayback(): void {
  playback.position = 0;
  playback.duration = 0;
  playback.buffered = 0;
  publish('reset');
}

export function progressPercent(): number {
  if (playback.duration <= 0) return 0;
  return clamp((playback.position / playback.duration) * 100, 0, 100);
}
