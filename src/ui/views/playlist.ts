import { h } from '../dom';
import { icon } from '../icons';
import { getState, getPlaylist, resolveTracks, setRoute, libraryTracks, likesPlaylist, LIKES_ID } from '../../state/store';
import { renderTrackList, describeTracks } from '../trackList';
import { artworkNode, tileNode, hydrateArtwork } from '../artwork';
import { playTracks, addAllToQueue } from '../playActions';
import { downloadPlaylist } from '../../download/offline';
import { renamePlaylist, deletePlaylistById, shufflePlaylistTracks, createPlaylist } from '../../state/playlists';
import { confirmDialog, showContextMenu } from '../contextMenu';
import { player } from '../../audio/player';
import { toast } from '../toast';
import { colorFromString, pluralize } from '../../lib/utils';
import type { Track } from '../../lib/types';

export interface CollectionInfo {
  title: string;
  subtitle: string;
  kindLabel: string;
  accent: string;
  tracks: Track[];
  /** Solo las playlists reales se pueden renombrar o borrar. */
  playlistId?: string;
  coverTrack?: Track;
}

export function resolveCollection(id: string): CollectionInfo | null {
  if (id === LIKES_ID) {
    const likes = likesPlaylist();
    return {
      title: 'Me gusta',
      subtitle: `${likes.trackIds.length} ${pluralize(likes.trackIds.length, 'pista')} que guardaste`,
      kindLabel: 'Playlist',
      accent: likes.accent ?? '#7c5cff',
      tracks: resolveTracks(likes.trackIds),
      playlistId: LIKES_ID,
    };
  }

  if (id.startsWith('artist:')) {
    const artist = decodeURIComponent(id.slice('artist:'.length));
    const tracks = libraryTracks().filter((t) => t.artist === artist);
    return {
      title: artist,
      subtitle: `${tracks.length} ${pluralize(tracks.length, 'pista')}`,
      kindLabel: 'Artista',
      accent: colorFromString(artist, 45, 40),
      tracks,
      coverTrack: tracks[0],
    };
  }

  if (id.startsWith('album:')) {
    const key = decodeURIComponent(id.slice('album:'.length));
    const [artist, album] = key.split('::');
    const tracks = libraryTracks().filter((t) => t.artist === artist && (t.album || 'Sin album') === album);
    return {
      title: album ?? 'Sin album',
      subtitle: artist ?? '',
      kindLabel: 'Album',
      accent: colorFromString(key, 45, 38),
      tracks,
      coverTrack: tracks[0],
    };
  }

  const playlist = getPlaylist(id);
  if (!playlist) return null;
  return {
    title: playlist.name,
    subtitle: playlist.description ?? '',
    kindLabel: 'Playlist',
    accent: playlist.accent ?? colorFromString(playlist.name, 50, 42),
    tracks: resolveTracks(playlist.trackIds),
    playlistId: playlist.id,
    coverTrack: resolveTracks(playlist.trackIds)[0],
  };
}

export function renderPlaylist(id: string): HTMLElement {
  const collection = resolveCollection(id);
  const view = h('div', { class: 'view view--playlist' });

  if (!collection) {
    view.append(
      h(
        'div',
        { class: 'empty-state' },
        icon('playlist', 44),
        h('p', { class: 'empty-state__title', text: 'No encontramos esa playlist' }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => setRoute({ name: 'home', params: {} }) }, text: 'Volver al inicio' }),
      ),
    );
    return view;
  }

  const { tracks, playlistId } = collection;
  const canEdit = Boolean(playlistId && playlistId !== LIKES_ID);
  const state = getState();

  const cover = collection.coverTrack
    ? h('div', { class: 'collection__cover' }, artworkNode(collection.coverTrack, 232))
    : h('div', { class: 'collection__cover' }, tileNode(collection.title, collection.accent, 232));

  const actions = h(
    'div',
    { class: 'collection__actions' },
    h(
      'button',
      {
        class: 'collection__play',
        type: 'button',
        ariaLabel: `Reproducir ${collection.title}`,
        disabled: tracks.length === 0,
        on: { click: () => void playTracks(tracks) },
      },
      icon('play', 26),
    ),
    h(
      'button',
      {
        class: `icon-btn${state.player.shuffle ? ' is-active' : ''}`,
        type: 'button',
        ariaLabel: 'Aleatorio',
        disabled: tracks.length === 0,
        on: {
          click: async () => {
            player.setShuffle(!getState().player.shuffle);
            if (tracks.length > 0) await playTracks(tracks, Math.floor(Math.random() * tracks.length));
          },
        },
      },
      icon('shuffle', 22),
    ),
    h(
      'button',
      { class: 'icon-btn', type: 'button', ariaLabel: 'Agregar a la cola', disabled: tracks.length === 0, on: { click: () => void addAllToQueue(tracks) } },
      icon('plus', 22),
    ),
    h(
      'button',
      { class: 'icon-btn', type: 'button', ariaLabel: 'Descargar para escuchar sin internet', disabled: tracks.length === 0, on: { click: () => void downloadCollection(tracks) } },
      icon('download', 22),
    ),
    canEdit
      ? h(
          'button',
          { class: 'icon-btn', type: 'button', ariaLabel: 'Mas opciones', on: { click: (event) => openCollectionMenu(event, playlistId!) } },
          icon('more', 22),
        )
      : null,
  );

  const meta = h(
    'div',
    { class: 'collection__meta' },
    h('span', { class: 'collection__kind', text: collection.kindLabel }),
    collection.subtitle ? h('span', { class: 'collection__subtitle', text: collection.subtitle }) : null,
    h('span', { class: 'collection__count', text: describeTracks(tracks) }),
  );

  const header = h(
    'header',
    { class: 'collection__header', style: { '--accent': collection.accent } as Partial<CSSStyleDeclaration> },
    cover,
    h('div', { class: 'collection__info' }, h('h1', { class: 'collection__title', text: collection.title }), meta),
  );

  view.append(header, actions);

  if (tracks.length === 0) {
    view.append(
      h(
        'div',
        { class: 'empty-state' },
        icon('music', 40),
        h('p', { class: 'empty-state__title', text: 'Esta lista esta vacia' }),
        h('p', { class: 'empty-state__hint', text: 'Busca musica libre y agregala con el boton de la suma.' }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => setRoute({ name: 'search', params: {} }) }, text: 'Buscar musica' }),
      ),
    );
    return view;
  }

  view.append(
    renderTrackList({
      tracks,
      playlistId,
      showAlbum: collection.kindLabel !== 'Album',
      emptyMessage: 'Sin pistas',
    }),
  );
  hydrateArtwork(view);
  return view;
}

function openCollectionMenu(event: MouseEvent, playlistId: string): void {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return;
  showContextMenu(event.clientX, event.clientY, [
    {
      id: 'rename',
      label: 'Renombrar',
      icon: 'playlist',
      onSelect: async () => {
        const result = await confirmDialog({
          title: 'Renombrar playlist',
          withInput: { label: 'Nombre', value: playlist.name },
          confirmLabel: 'Guardar',
        });
        if (result.confirmed && result.value?.trim()) await renamePlaylist(playlistId, result.value);
      },
    },
    {
      id: 'shuffle-order',
      label: 'Mezclar el orden',
      icon: 'shuffle',
      onSelect: () => void shufflePlaylistTracks(playlistId),
    },
    {
      id: 'duplicate',
      label: 'Duplicar playlist',
      icon: 'plus',
      separatorBefore: true,
      onSelect: async () => {
        const copy = await createPlaylist(`${playlist.name} (copia)`, playlist.trackIds);
        toast({ message: `Creada "${copy.name}"` });
      },
    },
    {
      id: 'delete',
      label: 'Eliminar playlist',
      icon: 'trash',
      danger: true,
      onSelect: async () => {
        const { confirmed } = await confirmDialog({
          title: `Eliminar "${playlist.name}"`,
          body: 'La playlist se borra. Las pistas siguen en tu biblioteca.',
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (confirmed) {
          await deletePlaylistById(playlistId);
          toast({ message: 'Playlist eliminada' });
          setRoute({ name: 'home', params: {} });
        }
      },
    },
  ]);
}

async function downloadCollection(tracks: readonly Track[]): Promise<void> {
  const pending = tracks.filter((t) => !getState().offlineIds.has(t.id));
  if (pending.length === 0) {
    toast({ message: 'Esta lista ya esta descargada' });
    return;
  }
  const { confirmed } = await confirmDialog({
    title: `Descargar ${pending.length} ${pluralize(pending.length, 'pista')}`,
    body: 'Quedan guardadas en el dispositivo para escucharlas sin internet.',
    confirmLabel: 'Descargar',
  });
  if (!confirmed) return;

  let done = 0;
  await downloadPlaylist(pending.map((t) => t.id), () => {
    done++;
    if (done % 5 === 0 || done === pending.length) toast({ message: `Descargando ${done} de ${pending.length}...` });
  });
  toast({ message: 'Listo. Ya podes escucharla sin internet.', kind: 'success' });
}

