import { h } from './dom';
import { icon } from './icons';
import { artworkNode, hydrateArtwork } from './artwork';
import { formatTime, clamp } from '../lib/utils';
import { getState, onRender, setSettings, isLiked } from '../state/store';
import * as db from '../lib/db';
import { player, openNowPlaying } from '../audio/player';
import { playback, playbackBus, progressPercent } from '../audio/playback';
import { visualizer } from '../audio/visualizer';
import { openTrackMenu, toggleLikeTrack } from './playActions';
import { toast } from './toast';
import type { Track } from '../lib/types';

interface SliderOptions {
  className: string;
  ariaLabel: string;
  onInput: (value: number) => void;
  onCommit?: (value: number) => void;
}

function slider(options: SliderOptions): HTMLElement {
  const input = h('input', {
    class: options.className,
    type: 'range',
    min: '0',
    max: '100',
    step: '0.1',
    value: '0',
    ariaLabel: options.ariaLabel,
  }) as HTMLInputElement;

  const paint = () => {
    input.style.setProperty('--value', `${Number(input.value)}%`);
  };

  input.addEventListener('input', () => {
    paint();
    options.onInput(Number(input.value));
  });
  input.addEventListener('change', () => {
    options.onCommit?.(Number(input.value));
  });
  paint();
  return input;
}

export function createPlayerBar(): HTMLElement {
  const leftArt = h('div', { class: 'player-bar__art' });
  const titleEl = h('a', { class: 'player-bar__title', href: '#/now-playing', text: '' });
  const artistEl = h('span', { class: 'player-bar__artist', text: '' });
  const likeBtn = h(
    'button',
    { class: 'icon-btn icon-btn--tiny', type: 'button', ariaLabel: 'Me gusta', on: { click: () => toggleLike() } },
    icon('heart', 18),
  );
  const menuBtn = h(
    'button',
    { class: 'icon-btn icon-btn--tiny', type: 'button', ariaLabel: 'Mas opciones', on: { click: (e) => onMenuClick(e) } },
    icon('more', 18),
  );

  const left = h(
    'div',
    { class: 'player-bar__left' },
    h(
      'button',
      {
        class: 'player-bar__nowplaying',
        type: 'button',
        ariaLabel: 'Ver lo que suena ahora',
        on: { click: () => openNowPlaying() },
      },
      leftArt,
      h('div', { class: 'player-bar__text' }, titleEl, artistEl),
    ),
    likeBtn,
    menuBtn,
  );

  const playBtn = h(
    'button',
    { class: 'player-bar__main-btn', type: 'button', ariaLabel: 'Reproducir', on: { click: () => void player.toggle() } },
    icon('play', 20),
  );
  const prevBtn = h(
    'button',
    { class: 'player-bar__side-btn', type: 'button', ariaLabel: 'Anterior', on: { click: () => void player.previous() } },
    icon('previous', 18),
  );
  const nextBtn = h(
    'button',
    { class: 'player-bar__side-btn', type: 'button', ariaLabel: 'Siguiente', on: { click: () => void player.next() } },
    icon('next', 18),
  );

  const currentTime = h('span', { class: 'player-bar__time', text: '0:00' });
  const totalTime = h('span', { class: 'player-bar__time', text: '0:00' });
  const previewTime = h('span', { class: 'player-bar__time', text: '0:00' });
  let seekPreview: number | null = null;

  const seekSlider = slider({
    className: 'player-bar__seek',
    ariaLabel: 'Posicion de reproduccion',
    onInput: (pct) => {
      seekPreview = pct;
      previewTime.textContent = formatTime((pct / 100) * playback.duration);
    },
    onCommit: () => {
      if (seekPreview !== null) player.seekPercent(seekPreview);
      seekPreview = null;
    },
  }) as HTMLInputElement;

  const center = h(
    'div',
    { class: 'player-bar__center' },
    h('div', { class: 'player-bar__controls' }, prevBtn, playBtn, nextBtn),
    h(
      'div',
      { class: 'player-bar__progress' },
      currentTime,
      h(
        'div',
        { class: 'player-bar__seek-wrap', on: { click: (e) => e.stopPropagation() } },
        seekSlider,
        previewTime,
      ),
      totalTime,
    ),
  );

  const canvas = h('canvas', { class: 'player-bar__visualizer', ariaHidden: 'true' }) as HTMLCanvasElement;
  const visualizerBtn = h(
    'button',
    {
      class: 'icon-btn icon-btn--tiny player-bar__viz-btn',
      type: 'button',
      ariaLabel: 'Visualizador',
      on: { click: () => void toggleVisualizer() },
    },
    icon('sparkle', 18),
  );

  const volumeInput = slider({
    className: 'player-bar__volume',
    ariaLabel: 'Volumen',
    onInput: (pct) => player.setVolume(pct / 100, false),
    onCommit: (pct) => player.setVolume(pct / 100),
  }) as HTMLInputElement;
  volumeInput.value = String(getState().player.volume * 100);

  const muteBtn = h(
    'button',
    { class: 'icon-btn icon-btn--tiny', type: 'button', ariaLabel: 'Silenciar', on: { click: () => player.toggleMute() } },
    icon('volume', 18),
  );

  const shuffleBtn = h(
    'button',
    { class: 'icon-btn icon-btn--tiny', type: 'button', ariaLabel: 'Aleatorio', on: { click: () => player.setShuffle(!getState().player.shuffle) } },
    icon('shuffle', 18),
  );
  const repeatBtn = h(
    'button',
    { class: 'icon-btn icon-btn--tiny', type: 'button', ariaLabel: 'Repetir', on: { click: () => player.cycleRepeat() } },
    icon('repeat', 18),
  );
  const queueInfo = h('span', { class: 'player-bar__queue-count', text: '' });
  const queueBtn = h(
    'button',
    {
      class: 'icon-btn icon-btn--tiny',
      type: 'button',
      ariaLabel: 'Ver la cola de reproduccion',
      on: { click: () => showQueue() },
    },
    icon('queue', 18),
  );

  const right = h(
    'div',
    { class: 'player-bar__right' },
    canvas,
    visualizerBtn,
    queueInfo,
    queueBtn,
    shuffleBtn,
    repeatBtn,
    muteBtn,
    h('div', { class: 'player-bar__volume-wrap' }, volumeInput),
  );

  const errorBar = h('div', { class: 'player-bar__error', role: 'alert' });

  const bar = h('footer', { class: 'player-bar' }, errorBar, left, center, right);

  function toggleLike(): void {
    const track = getState().tracks.get(getState().player.trackId ?? '');
    if (track) void toggleLikeTrack(track);
  }

  function onMenuClick(event: MouseEvent): void {
    const track = getState().tracks.get(getState().player.trackId ?? '');
    if (track) openTrackMenu(event, track);
  }

  async function toggleVisualizer(): Promise<void> {
    const enabled = !getState().settings.visualizer;
    setSettings({ visualizer: enabled });
    await db.setSetting('visualizer', enabled);
    if (enabled) {
      visualizer.attach(canvas);
      toast({ message: 'Visualizador activado' });
    } else {
      visualizer.detach();
    }
  }

  function render(): void {
    const state = getState();
    const track: Track | undefined = state.tracks.get(state.player.trackId ?? '');

    if (!track) {
      bar.classList.add('is-empty');
      titleEl.textContent = 'Nada sonando';
      artistEl.textContent = 'Elegi una pista para empezar';
      leftArt.replaceChildren(icon('music', 22));
      likeBtn.setAttribute('disabled', '');
      menuBtn.setAttribute('disabled', '');
    } else {
      bar.classList.remove('is-empty');
      titleEl.textContent = track.title;
      artistEl.textContent = track.artist;
      leftArt.replaceChildren(artworkNode(track, 56));
      hydrateArtwork(leftArt);
      likeBtn.removeAttribute('disabled');
      menuBtn.removeAttribute('disabled');
    }

    playBtn.replaceChildren(icon(state.player.playing ? 'pause' : 'play', 20));
    playBtn.setAttribute('aria-label', state.player.playing ? 'Pausar' : 'Reproducir');
    playBtn.classList.toggle('is-loading', state.player.loading);

    shuffleBtn.classList.toggle('is-active', state.player.shuffle);
    repeatBtn.classList.toggle('is-active', state.player.repeat !== 'off');
    repeatBtn.replaceChildren(icon(state.player.repeat === 'one' ? 'repeatOne' : 'repeat', 18));
    repeatBtn.setAttribute('aria-label', `Repetir: ${state.player.repeat}`);

    muteBtn.replaceChildren(icon(state.player.muted ? 'volumeMute' : state.player.volume < 0.5 ? 'volumeLow' : 'volume', 18));
    volumeInput.value = String(state.player.volume * 100);
    volumeInput.style.setProperty('--value', `${state.player.volume * 100}%`);

    queueInfo.textContent = state.player.queue.length > 0 ? `${state.player.index + 1}/${state.player.queue.length}` : '';
    queueBtn.toggleAttribute('disabled', state.player.queue.length === 0);

    const liked = track ? isLiked(track.id) : false;
    likeBtn.classList.toggle('is-active', liked);
    likeBtn.replaceChildren(icon(liked ? 'heartFilled' : 'heart', 18));

    errorBar.textContent = state.player.error ?? '';
    errorBar.classList.toggle('is-visible', Boolean(state.player.error));

    visualizerBtn.classList.toggle('is-active', state.settings.visualizer);
    if (state.settings.visualizer) visualizer.attach(canvas);
    else visualizer.detach();

    updateProgressUI();
  }

  function updateProgressUI(): void {
    const { position, duration } = playback;
    if (seekPreview === null) {
      currentTime.textContent = formatTime(position);
      const pct = progressPercent();
      seekSlider.value = String(pct);
      seekSlider.style.setProperty('--value', `${pct}%`);
    }
    totalTime.textContent = duration > 0 ? formatTime(duration) : '0:00';
    const buffered = playback.buffered > 0 && duration > 0 ? (playback.buffered / duration) * 100 : 0;
    seekSlider.style.setProperty('--buffered', `${clamp(buffered, 0, 100)}%`);
    previewTime.classList.toggle('is-visible', seekPreview !== null);
  }

  playbackBus.on('tick', updateProgressUI);
  playbackBus.on('duration', updateProgressUI);
  playbackBus.on('reset', updateProgressUI);
  onRender(render);
  requestAnimationFrame(render);
  window.addEventListener('resize', () => visualizer.resize());

  // Atajos de teclado globales del reproductor.
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (target?.isContentEditable) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    switch (event.key) {
      case ' ':
        event.preventDefault();
        void player.toggle();
        break;
      case 'ArrowRight':
        if (event.shiftKey) player.next();
        else player.seek(playback.position + 5);
        break;
      case 'ArrowLeft':
        if (event.shiftKey) void player.previous();
        else player.seek(playback.position - 5);
        break;
      case 'ArrowUp':
        event.preventDefault();
        player.setVolume(getState().player.volume + 0.05);
        break;
      case 'ArrowDown':
        event.preventDefault();
        player.setVolume(getState().player.volume - 0.05);
        break;
      case 'm':
        player.toggleMute();
        break;
      case 's':
        player.setShuffle(!getState().player.shuffle);
        break;
      case 'r':
        player.cycleRepeat();
        break;
      default:
        break;
    }
  });

  return bar;
}

/** Dialogo con la cola de reproduccion actual. */
function showQueue(): void {
  const state = getState();
  if (state.player.queue.length === 0) return;

  const list = h('div', { class: 'queue-list' });
  state.player.queue.forEach((id, index) => {
    const track = state.tracks.get(id);
    if (!track) return;
    const isCurrent = index === state.player.index;
    list.append(
      h(
        'button',
        {
          class: `queue-list__item${isCurrent ? ' is-current' : ''}`,
          type: 'button',
          on: { click: () => { overlay.remove(); void player.playIndex(index); } },
        },
        h('span', { class: 'queue-list__index', text: String(index + 1) }),
        h(
          'span',
          { class: 'queue-list__text' },
          h('span', { class: 'queue-list__title', text: track.title }),
          h('span', { class: 'queue-list__artist', text: track.artist }),
        ),
        h('span', { class: 'queue-list__time', text: track.duration > 0 ? formatTime(track.duration) : '—' }),
      ),
    );
  });

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };

  const dialog = h(
    'div',
    { class: 'dialog dialog--queue', role: 'dialog', ariaModal: 'true', ariaLabel: 'Cola de reproduccion' },
    h(
      'header',
      { class: 'dialog__header' },
      h('h2', { class: 'dialog__title', text: 'Cola de reproduccion' }),
      h(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          ariaLabel: 'Cerrar',
          on: {
            click: () => {
              void player.stop();
              close();
            },
          },
        },
        icon('close', 20),
      ),
    ),
    h('div', { class: 'dialog__body dialog__body--scroll' }, list),
  );

  const overlay = h(
    'div',
    {
      class: 'dialog-overlay',
      on: {
        click: (event) => {
          if (event.target === overlay) close();
        },
      },
    },
    dialog,
  );

  document.body.append(overlay);
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => overlay.classList.add('is-open'));
}
