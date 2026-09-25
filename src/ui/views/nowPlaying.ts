import { h } from '../dom';
import { icon } from '../icons';
import { getState, setRoute, isLiked } from '../../state/store';
import { player } from '../../audio/player';
import { playback, onPlayback, progressPercent } from '../../audio/playback';
import { visualizer } from '../../audio/visualizer';
import { artworkNode, hydrateArtwork } from '../artwork';
import { formatTime, formatDate, pluralize } from '../../lib/utils';
import { openTrackMenu, toggleOffline, toggleLikeTrack, sourceLabel } from '../playActions';
import { showContextMenu } from '../contextMenu';
import type { Track } from '../../lib/types';

export function renderNowPlaying(): HTMLElement {
  const state = getState();
  const track: Track | undefined = state.tracks.get(state.player.trackId ?? '');
  const view = h('div', { class: 'view view--now-playing' });

  if (!track) {
    view.append(
      h(
        'div',
        { class: 'empty-state' },
        icon('disco', 46),
        h('p', { class: 'empty-state__title', text: 'No hay nada sonando' }),
        h('p', { class: 'empty-state__hint', text: 'Elegi una pista de tu biblioteca para empezar.' }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => setRoute({ name: 'home', params: {} }) }, text: 'Ir al inicio' }),
      ),
    );
    return view;
  }

  const art = h('div', { class: 'now__art' }, artworkNode(track, 320));
  hydrateArtwork(art);

  const canvas = h('canvas', { class: 'now__visualizer', ariaHidden: 'true' }) as HTMLCanvasElement;

  const progressFill = h('span', { class: 'now__progress-fill' });
  const progress = h(
    'div',
    {
      class: 'now__progress',
      role: 'slider',
      tabIndex: 0,
      ariaLabel: 'Posicion de reproduccion',
      attrs: { 'aria-valuemin': '0', 'aria-valuemax': '100' },
      on: {
        click: (event) => {
          const rect = progress.getBoundingClientRect();
          const pct = ((event.clientX - rect.left) / rect.width) * 100;
          player.seekPercent(pct);
        },
        keydown: (event) => {
          if (event.key === 'ArrowRight') player.seek(playback.position + 5);
          if (event.key === 'ArrowLeft') player.seek(playback.position - 5);
        },
      },
    },
    progressFill,
  );
  const timeLabel = h('span', { class: 'now__time', text: '0:00 / 0:00' });

  const queueUpNext = h('div', { class: 'now__queue' });
  const upcoming = state.player.queue.slice(state.player.index + 1, state.player.index + 8);
  if (upcoming.length > 0) {
    queueUpNext.append(h('h2', { class: 'now__queue-title', text: 'Siguientes' }));
    for (const id of upcoming) {
      const next = state.tracks.get(id);
      if (!next) continue;
      queueUpNext.append(
        h(
          'button',
          { class: 'now__queue-item', type: 'button', on: { click: () => void player.play({ startIndex: state.player.queue.indexOf(id) }) } },
          h('span', { class: 'now__queue-title-text', text: next.title }),
          h('span', { class: 'now__queue-artist', text: next.artist }),
        ),
      );
    }
  }

  const liked = isLiked(track.id);
  const isOffline = state.offlineIds.has(track.id);

  view.append(
    h(
      'div',
      { class: 'now' },
      h(
        'header',
        { class: 'now__header' },
        h(
          'button',
          { class: 'icon-btn', type: 'button', ariaLabel: 'Volver', on: { click: () => window.history.back() } },
          icon('chevronLeft', 24),
        ),
        h('span', { class: 'now__header-title', text: 'Reproduciendo ahora' }),
        h(
          'button',
          { class: 'icon-btn', type: 'button', ariaLabel: 'Opciones', on: { click: (event) => openTrackMenu(event, track) } },
          icon('more', 22),
        ),
      ),
      h(
        'div',
        { class: 'now__body' },
        h(
          'div',
          { class: 'now__left' },
          art,
          h(
            'div',
            { class: 'now__info' },
            h('h1', { class: 'now__title', text: track.title }),
            h('p', { class: 'now__artist', text: track.artist }),
            track.album ? h('p', { class: 'now__album', text: track.album }) : null,
            h(
              'div',
              { class: 'now__chips' },
              h('span', { class: 'chip chip--static', text: sourceLabel(track) }),
              track.license ? h('span', { class: 'chip chip--static', text: track.license }) : null,
              isOffline ? h('span', { class: 'chip chip--static chip--ok', text: 'offline' }) : null,
              h('span', { class: 'chip chip--static', text: `agregada ${formatDate(track.addedAt)}` }),
            ),
            h(
              'div',
              { class: 'now__controls' },
              h(
                'button',
                {
                  class: `icon-btn${state.player.shuffle ? ' is-active' : ''}`,
                  type: 'button',
                  ariaLabel: 'Aleatorio',
                  on: { click: () => player.setShuffle(!getState().player.shuffle) },
                },
                icon('shuffle', 22),
              ),
              h(
                'button',
                { class: 'icon-btn', type: 'button', ariaLabel: 'Anterior', on: { click: () => void player.previous() } },
                icon('previous', 24),
              ),
              h(
                'button',
                { class: 'now__play', type: 'button', ariaLabel: state.player.playing ? 'Pausar' : 'Reproducir', on: { click: () => void player.toggle() } },
                icon(state.player.playing ? 'pause' : 'play', 30),
              ),
              h(
                'button',
                { class: 'icon-btn', type: 'button', ariaLabel: 'Siguiente', on: { click: () => void player.next() } },
                icon('next', 24),
              ),
              h(
                'button',
                { class: `icon-btn${state.player.repeat !== 'off' ? ' is-active' : ''}`, type: 'button', ariaLabel: 'Repetir', on: { click: () => player.cycleRepeat() } },
                icon(state.player.repeat === 'one' ? 'repeatOne' : 'repeat', 22),
              ),
            ),
            h(
              'div',
              { class: 'now__secondary' },
              h(
                'button',
                { class: `icon-btn${liked ? ' is-active' : ''}`, type: 'button', ariaLabel: 'Me gusta', on: { click: () => void toggleLikeTrack(track) } },
                icon(liked ? 'heartFilled' : 'heart', 22),
              ),
              h(
                'button',
                { class: `icon-btn${isOffline ? ' is-active' : ''}`, type: 'button', ariaLabel: 'Descargar', on: { click: () => void toggleOffline(track) } },
                icon(isOffline ? 'downloaded' : 'download', 22),
              ),
              h(
                'button',
                {
                  class: 'icon-btn',
                  type: 'button',
                  ariaLabel: 'Ver detalle',
                  on: {
                    click: (event: MouseEvent) => {
                      showContextMenu(event.clientX, event.clientY, [
                        {
                          id: 'info',
                          label: `${track.playCount} ${pluralize(track.playCount, 'reproduccion', 'reproducciones')}`,
                          icon: 'clock',
                          onSelect: () => {},
                        },
                        ...(track.homeUrl
                          ? [
                              {
                                id: 'home',
                                label: 'Ver la pagina de origen',
                                icon: 'external',
                                onSelect: () => window.open(track.homeUrl!, '_blank', 'noopener,noreferrer'),
                              },
                            ]
                          : []),
                      ]);
                    },
                  },
                },
                icon('info', 22),
              ),
            ),
            progress,
            timeLabel,
          ),
        ),
        h('div', { class: 'now__right' }, canvas, queueUpNext),
      ),
    ),
  );

  if (state.settings.visualizer) {
    requestAnimationFrame(() => visualizer.attach(canvas));
  }

  const updateProgress = () => {
    const pct = progressPercent();
    progressFill.style.width = `${pct}%`;
    timeLabel.textContent = `${formatTime(playback.position)} / ${formatTime(playback.duration)}`;
  };
  onPlayback(updateProgress);
  updateProgress();

  return view;
}
