import { player } from './player';
import { getState } from '../state/store';

/**
 * Visualizador con Web Audio. Solo se engancha a fuentes same-origin
 * (archivos locales o descargas offline): para streams remotos el navegador
 * bloquearia el audio por CORS, asi que ahi se dibuja una animacion sintetica.
 */
class Visualizer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private hookedElement: HTMLAudioElement | null = null;
  private data: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(256));
  private raf = 0;
  private synthetic = 0;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.start();
  }

  detach(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas = null;
    this.ctx = null;
  }

  resize(): void {
    if (!this.canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  private ensureAnalyser(): boolean {
    const el = player.audioElement;
    if (!el || !el.src) return false;

    const url = el.currentSrc || el.src;
    const isLocal = url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('file:');

    if (!isLocal) {
      this.teardownAudio();
      return false;
    }

    if (this.sourceNode && this.hookedElement === el) return true;

    this.teardownAudio();
    try {
      const AudioCtx: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      this.audioContext = this.audioContext ?? new AudioCtx();
      if (this.audioContext.state === 'suspended') void this.audioContext.resume();
      this.sourceNode = this.audioContext.createMediaElementSource(el);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      this.hookedElement = el;
      this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      return true;
    } catch (err) {
      console.warn('[visualizer] no se pudo enganchar al audio', err);
      return false;
    }
  }

  private teardownAudio(): void {
    try {
      this.sourceNode?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* nada que desconectar */
    }
    this.sourceNode = null;
    this.analyser = null;
    this.hookedElement = null;
  }

  private start(): void {
    if (this.raf) return;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private draw(): void {
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!canvas || !ctx) return;
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const playing = getState().player.playing;
    const real = playing && this.ensureAnalyser();
    if (real && this.analyser) {
      this.analyser.getByteFrequencyData(this.data);
      const bars = Math.min(48, Math.floor(w / 14));
      const gap = 3;
      const barW = (w - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        const bin = Math.floor((i / bars) * this.data.length * 0.7);
        const value = (this.data[bin] ?? 0) / 255;
        const barH = Math.max(2 * (window.devicePixelRatio || 1), value * h);
        ctx.fillStyle = `hsl(150 80% ${45 + value * 25}%)`;
        ctx.fillRect(i * (barW + gap), h - barH, barW, barH);
      }
      return;
    }

    // Animacion sintética cuando no hay datos (streams remotos o pausa).
    this.synthetic = playing ? this.synthetic + 0.06 : 0;
    const bars = 28;
    const gap = 4;
    const barW = (w - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      const phase = this.synthetic + i * 0.42;
      const value = playing ? (Math.sin(phase) * 0.5 + 0.5) * 0.75 + 0.1 : 0.06;
      const barH = Math.max(2, value * h);
      ctx.fillStyle = playing ? `hsl(150 80% ${40 + value * 30}% / 0.9)` : 'hsl(150 20% 50% / 0.35)';
      ctx.fillRect(i * (barW + gap), h - barH, barW, barH);
    }
  }
}

export const visualizer = new Visualizer();