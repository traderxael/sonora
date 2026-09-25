import { h } from './dom';
import { icon } from './icons';
import { artworkNode, hydrateArtwork } from './artwork';
import { formatTime, formatRelative, pluralize } from '../lib/utils';
import { getState, isLiked } from '../state/store';
import { player } from '../audio/player';
import { openTrackMenu, playTracks, toggleLikeTrack, toggleOffline, sourceLabel } from './playActions';
import { type MenuItem } from './contextMenu';
import { removeFromPlaylist, deleteTrackForever, moveInPlaylist } from '../state/playlists';
import { toast } from './toast';
import type { Track } from '../lib/types';

export interface TrackListOptions {
  tracks: readonly Track[];
  /** Contexto de playlist: habilita quitar y reordenar. */
  playlistId?: string;
  showAlbum?: boolean;
  showAdded?: boolean;
  showPlays?: boolean;
  /** Numero inicial para la columna de indice (por paginas, etc.). */
  startIndex?: number;
  emptyMessage?: string;
}

export function renderTrackList(options: TrackListOptions): HTMLElement {
  const { tracks, playlistId } = options;

  if (tracks.length === 0) {
    return h(
      'div',
      { class: 'empty-state' },
      icon('music', 40),
      h('p', { class: 'empty-state__title', text: options.emptyMessage ?? 'No hay pistas todavia' }),
      h('p', {
        class: 'empty-state__hint',
        text: 'Importa tu carpeta de musica o busca temas libres en la seccion Buscar.',
      }),
    );
  }

  const body = h('div', { class: 'track-table__body' });
  tracks.forEach((track, index) => {
    body.append(renderRow(track, options, index + (options.startIndex ?? 0)));
  });

  const table = h(
    'div',
    { class: 'track-table', role: 'table', ariaLabel: 'Lista de pistas' },
    renderHeader(options),
    body,
  );

  if (playlistId) enableDragReorder(body, playlistId);
  hydrateArtwork(table);
  return table;
}

function renderHeader(options: TrackListOptions): HTMLElement {
  return h(
    'div',
    { class: 'track-table__head', role: 'row' },
    h('span', { class: 'track-table__cell track-table__cell--index', role: 'columnheader', text: '#' }),
    h('span', { class: 'track-table__cell track-table__cell--title', role: 'columnheader', text: 'Titulo' }),
    options.showAlbum === false ? null : h('span', { class: 'track-table__cell', role: 'columnheader', text: 'Album' }),
    options.showAdded ? h('span', { class: 'track-table__cell track-table__cell--hide-sm', role: 'columnheader', text: 'Agregada' }) : null,
    options.showPlays ? h('span', { class: 'track-table__cell track-table__cell--hide-sm', role: 'columnheader', text: 'Reproducciones' }) : null,
    h('span', { class: 'track-table__cell track-table__cell--time', role: 'columnheader', text: '⏱' }),
    h('span', { class: 'track-table__cell track-table__cell--actions', role: 'columnheader' }),
  );
}

function renderRow(track: Track, options: TrackListOptions, displayIndex: number): HTMLElement {
  const state = getState();
  const position = options.tracks.indexOf(track);
  const isCurrent = state.player.trackId === track.id;
  const isPlaying = isCurrent && state.player.playing;
  const liked = isLiked(track.id);
  const isOffline = state.offlineIds.has(track.id);
  const download = state.downloads.get(track.id);

  const indexCell = h(
    'div',
    { class: 'track-table__cell track-table__cell--index' },
    h('span', { class: 'track-row__index', text: String(displayIndex + 1) }),
    h(
      'button',
      {
        class: 'track-row__play',
        type: 'button',
        ariaLabel: isPlaying ? 'Pausar' : `Reproducir ${track.title}`,
        on: { click: (event) => { event.stopPropagation(); void playTracks([track]); } },
      },
      icon(isPlaying ? 'pause' : 'play', 16),
    ),
    isPlaying ? h('span', { class: 'track-row__bars', ariaHidden: 'true' }, h('i'), h('i'), h('i')) : null,
  );

  const titleCell = h(
    'div',
    { class: 'track-table__cell track-table__cell--title' },
    artworkNode(track, 40),
    h(
      'div',
      { class: 'track-row__text' },
      h(
        'div',
        { class: 'track-row__titleline' },
        h('span', { class: `track-row__title${isCurrent ? ' is-current' : ''}`, text: track.title }),
        h('span', { class: 'track-row__badges' }, ...badges(track, isOffline)),
      ),
      h('span', { class: 'track-row__artist', text: track.artist }),
    ),
  );

  const actions = h(
    'div',
    { class: 'track-table__cell track-table__cell--actions' },
    download && download.state === 'downloading'
      ? h('span', { class: 'track-row__download-pct', title: 'Descargando', text: `${download.pct}%` })
      : null,
    h(
      'button',
      {
        class: `icon-btn icon-btn--tiny${liked ? ' is-active' : ''}`,
        type: 'button',
        ariaLabel: liked ? 'Quitar de Me gusta' : 'Agregar a Me gusta',
        ariaPressed: liked ? 'true' : 'false',
        on: { click: (event) => { event.stopPropagation(); void toggleLikeTrack(track); } },
      },
      icon(liked ? 'heartFilled' : 'heart', 18),
    ),
    h(
      'button',
      {
        class: `icon-btn icon-btn--tiny${isOffline ? ' is-active' : ''}`,
        type: 'button',
        ariaLabel: isOffline ? 'Quitar descarga offline' : 'Descargar para escuchar sin internet',
        on: { click: (event) => { event.stopPropagation(); void toggleOffline(track); } },
      },
      icon(isOffline ? 'downloaded' : 'download', 18),
    ),
    h(
      'button',
      {
        class: 'icon-btn icon-btn--tiny',
        type: 'button',
        ariaLabel: 'Mas opciones',
        on: { click: (event) => openTrackMenu(event, track, playlistExtras(track, options.playlistId)) },
      },
      icon('more', 18),
    ),
  );

  const row = h(
    'div',
    {
      class: `track-row${isCurrent ? ' is-current' : ''}`,
      role: 'row',
      tabIndex: 0,
      dataset: { trackId: track.id },
      on: {
        dblclick: () => void playTracks(options.tracks, position),
        keydown: (event) => {
          if (event.key === 'Enter') void playTracks(options.tracks, position);
        },
        contextmenu: (event) =>
          openTrackMenu(event, track, [
            ...playlistExtras(track, options.playlistId),
            { id: 'queue-track', label: 'Reproducir la lista desde aqui', icon: 'play', separatorBefore: true, onSelect: () => void playTracks(options.tracks, position) },
            {
              id: 'add-queue',
              label: 'Agregar la lista a la cola',
              icon: 'plus',
              onSelect: () => {
                player.enqueueMany(options.tracks.map((t) => t.id));
                toast({ message: `${options.tracks.length} pistas en la cola` });
              },
            },
          ]),
      },
    },
    indexCell,
    titleCell,
    options.showAlbum === false ? null : h('div', { class: 'track-table__cell track-table__cell--hide-sm', text: track.album || '—' }),
    options.showAdded
      ? h('div', { class: 'track-table__cell track-table__cell--hide-sm', text: formatRelative(track.addedAt) })
      : null,
    options.showPlays
      ? h('div', { class: 'track-table__cell track-table__cell--hide-sm', text: String(track.playCount) })
      : null,
    h('div', { class: 'track-table__cell track-table__cell--time', text: track.duration > 0 ? formatTime(track.duration) : '—' }),
    actions,
  );

  return row;
}

function badges(track: Track, isOffline: boolean): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (track.source !== 'local') {
    out.push(h('span', { class: 'badge badge--source', title: sourceLabel(track), text: track.source === 'openverse' ? 'CC' : 'libre' }));
  }
  if (isOffline) {
    out.push(h('span', { class: 'badge badge--offline', title: 'Disponible sin internet', text: 'offline' }));
  }
  return out;
}

function playlistExtras(track: Track, playlistId?: string): MenuItem[] {
  const items: MenuItem[] = [];
  if (playlistId) {
    items.push({
      id: 'remove-playlist',
      label: 'Quitar de esta playlist',
      icon: 'close',
      separatorBefore: true,
      onSelect: () => {
        void removeFromPlaylist(playlistId, track.id);
        toast({ message: `Quitada de la playlist` });
      },
    });
  }
  items.push({
    id: 'delete',
    label: 'Quitar de la biblioteca',
    icon: 'trash',
    danger: true,
    onSelect: () => {
      void deleteTrackForever(track.id);
      toast({ message: `Quitada "${track.title}" de la biblioteca` });
    },
  });
  return items;
}

/** Arrastrar y soltar para reordenar dentro de una playlist. */
function enableDragReorder(body: HTMLElement, playlistId: string): void {
  let dragFrom: number | null = null;

  for (const [index, row] of [...body.querySelectorAll<HTMLElement>('.track-row')].entries()) {
    row.dataset.index = String(index);
    row.draggable = true;
  }

  body.addEventListener('dragstart', (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.track-row');
    if (!row) return;
    dragFrom = Number(row.dataset.index ?? '-1');
    row.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain', row.dataset.trackId ?? '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });

  body.addEventListener('dragend', () => {
    dragFrom = null;
    for (const el of body.querySelectorAll('.track-row')) el.classList.remove('is-dragging', 'is-drop-target');
  });

  body.addEventListener('dragover', (event) => {
    if (dragFrom === null) return;
    event.preventDefault();
    const row = (event.target as HTMLElement).closest<HTMLElement>('.track-row');
    for (const el of body.querySelectorAll('.is-drop-target')) el.classList.remove('is-drop-target');
    row?.classList.add('is-drop-target');
  });

  body.addEventListener('drop', (event) => {
    if (dragFrom === null) return;
    event.preventDefault();
    const row = (event.target as HTMLElement).closest<HTMLElement>('.track-row');
    const to = Number(row?.dataset.index ?? '-1');
    if (to >= 0 && to !== dragFrom) {
      void moveInPlaylist(playlistId, dragFrom, to);
    }
    dragFrom = null;
  });
}

/** Resumen corto para encabezados: "12 pistas · 45 min". */
export function describeTracks(tracks: readonly Track[]): string {
  const total = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const minutes = Math.round(total / 60);
  return `${tracks.length} ${pluralize(tracks.length, 'pista')} · ${minutes} min`;
}
