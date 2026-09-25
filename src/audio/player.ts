import { Emitter } from '../lib/emitter';
import { errorMessage } from '../lib/utils';
import * as db from '../lib/db';
import { getState, patchPlayer, setRoute } from '../state/store';
import { resolveAudio, NeedsPermissionError, type ResolvedAudio } from '../download/offline';
import { playback, playbackBus, resetPlayback, setBuffered, setDuration, setPosition } from './playback';
import { loadArtworkUrl, artworkUrlFor } from '../library/artwork';
import type { Track } from '../lib/types';

export interface PlayOptions {
  /** Reemplaza la cola actual. */
  queue?: readonly string[];
  /** Indice dentro de la cola a reproducir. */
  startIndex?: number;
  /** Fuerza posicion inicial en segundos (usado al saltar a un momento). */
  startAt?: number;
  autoplay?: boolean;
}

export interface NextOptions {
  /** El usuario eligio "siguiente": reinicia la cola al llegar al final. */
  manual?: boolean;
  /** Terminó una pista sola: respeta repeat 'off'. */
  autoEnded?: boolean;
}

interface Channel {
  el: HTMLAudioElement;
  trackId: string | null;
  source: ResolvedAudio | null;
  /** Ganancia 0..1 durante un crossfade. */
  gain: number;
  fading: boolean;
}

export const playerBus = new Emitter<{ permission: string; error: string }>();

class AudioPlayer {
  private channels: [Channel, Channel];
  private activeIndex: 0 | 1 = 0;
  private preloadedId: string | null = null;
  private lastTick = 0;
  private playToken = 0;
  private fadeRaf: number | null = null;

  constructor() {
    this.channels = [this.createChannel(), this.createChannel()];
    for (const channel of this.channels) this.wire(channel);
  }

  private createChannel(): Channel {
    const el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.volume = this.targetVolume();
    return { el, trackId: null, source: null, gain: 1, fading: false };
  }

  private wire(channel: Channel): void {
    const isActive = () => channel === this.channels[this.activeIndex];

    channel.el.addEventListener('timeupdate', () => {
      if (!isActive()) return;
      setPosition(channel.el.currentTime);
      const now = performance.now();
      if (now - this.lastTick < 200) return;
      this.lastTick = now;
      this.maybeCrossfade();
    });

    channel.el.addEventListener('durationchange', () => {
      if (isActive()) setDuration(channel.el.duration);
    });

    channel.el.addEventListener('progress', () => {
      if (!isActive()) return;
      try {
        const buffered = channel.el.buffered.end(channel.el.buffered.length - 1);
        if (Number.isFinite(buffered)) setBuffered(buffered);
      } catch {
        /* sin datos de buffer */
      }
    });

    channel.el.addEventListener('playing', () => {
      if (!isActive()) return;
      patchPlayer({ playing: true, loading: false, error: null });
      this.syncMediaSession();
    });

    channel.el.addEventListener('waiting', () => {
      if (isActive()) patchPlayer({ loading: true });
    });

    channel.el.addEventListener('ended', () => {
      if (!isActive() || channel.fading) return;
      void this.onEnded();
    });

    channel.el.addEventListener('error', () => {
      if (!isActive() || channel.fading) return;
      const track = this.currentTrack();
      this.fail(`No se pudo reproducir "${track?.title ?? 'la pista'}".`);
    });
  }

  private targetVolume(): number {
    const { volume, muted } = getState().player;
    return muted ? 0 : volume;
  }

  private current(): Channel {
    return this.channels[this.activeIndex];
  }

  private idle(): Channel {
    return this.channels[this.activeIndex === 0 ? 1 : 0];
  }

  /** Elemento de audio del canal activo (lo usa el visualizador). */
  get audioElement(): HTMLAudioElement {
    return this.current().el;
  }

  currentTrack(): Track | undefined {
    const id = this.current().trackId;
    return id ? getState().tracks.get(id) : undefined;
  }

  // ------------------------------------------------------------- controles

  async play(options: PlayOptions = {}): Promise<void> {
    const state = getState().player;
    let queue = state.queue;
    let index = state.index;

    if (options.queue) {
      queue = [...options.queue];
      index = options.startIndex ?? 0;
    } else if (options.startIndex !== undefined) {
      index = options.startIndex;
    }

    if (queue.length === 0 || index < 0 || index >= queue.length) {
      patchPlayer({ error: 'No hay nada en la cola.' });
      return;
    }

    const trackId = queue[index];
    if (state.trackId === trackId && options.startAt === undefined) {
      patchPlayer({ queue, index });
      if (!state.playing) await this.resume();
      return;
    }

    await this.loadAndPlay(trackId, queue, index, options.startAt ?? 0, options.autoplay ?? true);
  }

  private async loadAndPlay(
    trackId: string,
    queue: string[],
    index: number,
    startAt: number,
    autoplay: boolean,
  ): Promise<void> {
    const token = ++this.playToken;
    this.stopFade();
    this.preloadedId = null;

    const track = getState().tracks.get(trackId);
    if (!track) {
      patchPlayer({ error: 'La pista ya no esta en la biblioteca.' });
      return;
    }

    const channel = this.current();
    patchPlayer({ queue, index, trackId, loading: true, error: null });
    resetPlayback();

    try {
      const source = await resolveAudio(track);
      if (token !== this.playToken) {
        source.release();
        return;
      }
      this.applySource(channel, trackId, source);
      channel.el.currentTime = startAt > 0 ? startAt : 0;

      if (autoplay) {
        await channel.el.play();
        void db.updateTrackPlayStats(trackId);
      }
      patchPlayer({ playing: autoplay, loading: false });
      this.preloadNext();
      this.syncMediaSession();

      void loadArtworkUrl(trackId).then(() => this.syncMediaSession());
    } catch (err) {
      if (token !== this.playToken) return;
      if (err instanceof NeedsPermissionError) {
        playerBus.emit('permission', 'El navegador necesita permiso para leer tu carpeta.');
      }
      this.fail(errorMessage(err));
    }
  }

  private applySource(channel: Channel, trackId: string, source: ResolvedAudio): void {
    channel.source?.release();
    channel.source = source;
    channel.trackId = trackId;
    channel.gain = 1;
    channel.el.src = source.url;
    channel.el.volume = this.targetVolume() * channel.gain;
  }

  private async resume(): Promise<void> {
    const channel = this.current();
    if (!channel.trackId) return;
    try {
      await channel.el.play();
      patchPlayer({ playing: true, error: null });
      this.syncMediaSession();
    } catch (err) {
      this.fail(errorMessage(err));
    }
  }

  async pause(): Promise<void> {
    this.current().el.pause();
    patchPlayer({ playing: false });
    this.syncMediaSession();
  }

  async toggle(): Promise<void> {
    if (getState().player.playing) await this.pause();
    else await this.resume();
  }

  seek(seconds: number): void {
    const channel = this.current();
    if (!Number.isFinite(channel.el.duration) || channel.el.duration <= 0) return;
    channel.el.currentTime = Math.max(0, Math.min(seconds, channel.el.duration));
    setPosition(channel.el.currentTime);
    this.syncMediaSession();
  }

  seekPercent(pct: number): void {
    this.seek((pct / 100) * playback.duration);
  }

  /**
   * `notify: false` se usa mientras se arrastra el slider de volumen: asi el estado
   * global no cambia en cada pixel del mouse y la vista no se reconstruye 60 veces por segundo.
   */
  setVolume(volume: number, notifyStore = true): void {
    const value = Math.max(0, Math.min(1, volume));
    for (const channel of this.channels) {
      channel.el.volume = (getState().player.muted ? 0 : value) * channel.gain;
    }
    if (notifyStore) {
      patchPlayer({ volume: value });
      void db.setSetting('volume', value);
    }
  }

  setMuted(muted: boolean): void {
    patchPlayer({ muted });
    for (const channel of this.channels) {
      channel.el.volume = (muted ? 0 : getState().player.volume) * channel.gain;
    }
  }

  toggleMute(): void {
    this.setMuted(!getState().player.muted);
  }

  setShuffle(shuffle: boolean): void {
    const state = getState().player;
    if (state.shuffle === shuffle || state.queue.length === 0) return;

    const currentId = state.queue[state.index];
    let queue: string[];

    if (shuffle) {
      // Baraja el resto manteniendo la pista actual al frente.
      const rest = state.queue.filter((_, i) => i !== state.index);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      queue = currentId ? [currentId, ...rest] : rest;
    } else {
      queue = [...state.queue].sort((a, b) => {
        const at = getState().tracks.get(a)?.addedAt ?? 0;
        const bt = getState().tracks.get(b)?.addedAt ?? 0;
        return at - bt;
      });
      if (currentId) {
        const idx = queue.indexOf(currentId);
        if (idx > 0) [queue[0], queue[idx]] = [queue[idx], queue[0]];
      }
    }

    patchPlayer({ shuffle, queue, index: Math.max(0, queue.indexOf(currentId ?? '')) });
  }

  cycleRepeat(): void {
    const order = ['off', 'all', 'one'] as const;
    const current = getState().player.repeat;
    patchPlayer({ repeat: order[(order.indexOf(current) + 1) % order.length] });
  }

  // ------------------------------------------------------------ navegacion

  private async onEnded(): Promise<void> {
    if (getState().player.repeat === 'one') {
      this.current().el.currentTime = 0;
      await this.resume();
      return;
    }
    await this.next({ autoEnded: true });
  }

  async next(options: NextOptions = {}): Promise<void> {
    const state = getState().player;
    if (state.queue.length === 0) return;

    let index = state.index + 1;
    if (index >= state.queue.length) {
      if (state.repeat === 'all' || options.manual) index = 0;
      else {
        this.current().el.pause();
        patchPlayer({ playing: false });
        this.syncMediaSession();
        return;
      }
    }

    await this.loadAndPlay(state.queue[index], state.queue, index, 0, true);
  }

  async previous(): Promise<void> {
    const state = getState().player;
    if (playback.position > 3) {
      this.seek(0);
      return;
    }
    if (state.queue.length === 0) return;
    const index = state.index > 0 ? state.index - 1 : state.queue.length - 1;
    await this.loadAndPlay(state.queue[index], state.queue, index, 0, true);
  }

  async playIndex(index: number): Promise<void> {
    const state = getState().player;
    if (index < 0 || index >= state.queue.length) return;
    await this.loadAndPlay(state.queue[index], state.queue, index, 0, true);
  }

  /**
   * Inserta pistas en la cola sin tocar lo que esta sonando.
   * Importante: si no, cargariamos la pista nueva y cortariamos la actual.
   */
  enqueueNext(trackIds: readonly string[]): void {
    const state = getState().player;
    if (trackIds.length === 0) return;
    const ids = trackIds.filter((id) => getState().tracks.has(id));
    if (ids.length === 0) return;

    if (state.queue.length === 0 || state.index < 0) {
      patchPlayer({ queue: ids, index: 0 });
      return;
    }
    const at = state.index + 1;
    const queue = [...state.queue];
    queue.splice(at, 0, ...ids);
    patchPlayer({ queue, index: state.index });
  }

  enqueueMany(trackIds: readonly string[]): void {
    const state = getState().player;
    const ids = trackIds.filter((id) => getState().tracks.has(id));
    if (ids.length === 0) return;

    if (state.queue.length === 0 || state.index < 0) {
      patchPlayer({ queue: ids, index: 0 });
      return;
    }
    patchPlayer({ queue: [...state.queue, ...ids] });
  }

  stop(): void {
    this.playToken++;
    this.stopFade();
    this.preloadedId = null;
    const channel = this.current();
    channel.el.pause();
    channel.el.removeAttribute('src');
    channel.el.load();
    channel.source?.release();
    channel.source = null;
    channel.trackId = null;
    resetPlayback();
    patchPlayer({ trackId: null, playing: false, index: -1, queue: [], loading: false, error: null });
    this.syncMediaSession();
  }

  private fail(message: string): void {
    patchPlayer({ playing: false, loading: false, error: message });
    this.syncMediaSession();
    playerBus.emit('error', message);
  }

  // ------------------------------------------------------------- preloading

  private preloadNext(): void {
    const state = getState().player;
    const nextId = state.queue[state.index + 1];
    if (!nextId || getState().offlineIds.has(nextId)) {
      this.preloadedId = null;
      return;
    }
    const track = getState().tracks.get(nextId);
    if (!track?.streamUrl || this.preloadedId === nextId) return;

    // Solo calentamos la URL: el service worker guarda el audio en su cache.
    const warm = new Audio();
    warm.preload = 'auto';
    warm.src = track.streamUrl;
    this.preloadedId = nextId;
  }

  // ------------------------------------------------------------- crossfade

  private maybeCrossfade(): void {
    const crossfade = getState().settings.crossfadeSeconds;
    if (crossfade <= 0) return;

    const channel = this.current();
    if (channel.fading) return;

    const remaining = channel.el.duration - channel.el.currentTime;
    if (!Number.isFinite(remaining) || remaining > crossfade || remaining <= 0) return;

    const state = getState().player;
    const nextId = state.queue[state.index + 1];
    if (!nextId) return;
    void this.startCrossfade(nextId);
  }

  private async startCrossfade(nextId: string): Promise<void> {
    const from = this.current();
    if (from.fading) return;
    from.fading = true;

    const to = this.idle();
    to.gain = 0;

    const seconds = Math.max(0.25, getState().settings.crossfadeSeconds);
    const baseVolume = this.targetVolume();

    try {
      const track = getState().tracks.get(nextId);
      if (!track) throw new Error('La pista siguiente no esta en la biblioteca.');

      this.preloadedId = null;
      const source = await resolveAudio(track);
      to.source?.release();
      to.source = source;
      to.trackId = nextId;
      to.el.src = source.url;
      to.el.currentTime = 0;
      to.el.volume = 0;
      await to.el.play();

      // A partir de acá el canal entrante pasa a ser el activo.
      this.activeIndex = this.activeIndex === 0 ? 1 : 0;
      const nextIndex = getState().player.index + 1;
      patchPlayer({ trackId: nextId, index: nextIndex, playing: true, loading: false, error: null });
      resetPlayback();
      setDuration(to.el.duration);
      void db.updateTrackPlayStats(nextId);

      await this.fade(from, to, seconds, baseVolume);

      from.el.pause();
      from.el.removeAttribute('src');
      from.el.load();
      from.source?.release();
      from.source = null;
      from.trackId = null;
      from.gain = 1;
      from.fading = false;

      this.preloadNext();
      this.syncMediaSession();
    } catch (err) {
      console.warn('[player] crossfade cancelado:', errorMessage(err));
      from.fading = false;
      to.gain = 1;
      to.el.volume = this.targetVolume();
    }
  }

  private fade(from: Channel, to: Channel, seconds: number, baseVolume: number): Promise<void> {
    return new Promise((done) => {
      const start = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - start) / (seconds * 1000));
        to.gain = p;
        from.gain = 1 - p;
        to.el.volume = baseVolume * p;
        from.el.volume = baseVolume * (1 - p);
        if (p >= 1) {
          this.fadeRaf = null;
          done();
        } else {
          this.fadeRaf = requestAnimationFrame(step);
        }
      };
      this.fadeRaf = requestAnimationFrame(step);
    });
  }

  private stopFade(): void {
    if (this.fadeRaf !== null) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = null;
    }
    for (const channel of this.channels) {
      channel.fading = false;
      channel.gain = 1;
      channel.el.volume = this.targetVolume();
    }
  }

  // -------------------------------------------------------- media session

  private syncMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    const track = this.currentTrack();
    if (track) {
      const art = artworkUrlFor(track);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || undefined,
        artwork: art ? [{ src: art, sizes: '420x420', type: 'image/jpeg' }] : undefined,
      });
    }
    const { playing } = getState().player;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    try {
      navigator.mediaSession.setPositionState?.({
        duration: Number.isFinite(playback.duration) ? playback.duration : 0,
        playbackRate: 1,
        position: Math.min(playback.position, playback.duration || playback.position),
      });
    } catch {
      /* algunos navegadores lo rechazan mientras no hay duracion valida */
    }
  }
}

export const player = new AudioPlayer();

playerBus.on('permission', (message) => {
  patchPlayer({ error: message });
});

export function openNowPlaying(): void {
  if (getState().route.name !== 'now-playing') setRoute({ name: 'now-playing', params: {} });
}

export { playbackBus };
