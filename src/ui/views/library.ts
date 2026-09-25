import { h } from '../dom';
import { icon } from '../icons';
import { mediaCard } from '../cards';
import { getState, setRoute, libraryTracks, resolveTracks } from '../../state/store';
import { importFilesFlow, rescanAllFolders, removeFolder, folderSummary, rescanFolder } from '../../state/libraryActions';
import { playTracks, addToPlaylistFlow, addAllToQueue } from '../playActions';
import { renderTrackList } from '../trackList';
import { showContextMenu, confirmDialog } from '../contextMenu';
import { clearAllOffline, downloadPlaylist } from '../../download/offline';
import { formatBytes, pluralize, groupBy } from '../../lib/utils';
import { toast } from '../toast';
import type { Track } from '../../lib/types';

type LibraryTab = 'canciones' | 'artistas' | 'albums' | 'offline' | 'carpetas';

const TABS: { id: LibraryTab; label: string }[] = [
  { id: 'canciones', label: 'Canciones' },
  { id: 'artistas', label: 'Artistas' },
  { id: 'albums', label: 'Albums' },
  { id: 'offline', label: 'Descargas' },
  { id: 'carpetas', label: 'Carpetas' },
];

export function renderLibrary(params: Record<string, string>): HTMLElement {
  const active = (TABS.find((t) => t.id === params.tab)?.id ?? 'canciones') as LibraryTab;
  const view = h('div', { class: 'view view--library' });

  view.append(h('h1', { class: 'view__title', text: 'Tu biblioteca' }));

  const tabs = h(
    'div',
    { class: 'tabs', role: 'tablist' },
    ...TABS.map((tab) =>
      h(
        'button',
        {
          class: `tab${tab.id === active ? ' is-active' : ''}`,
          type: 'button',
          role: 'tab',
          ariaSelected: tab.id === active ? 'true' : 'false',
          on: { click: () => setRoute({ name: 'library', params: { tab: tab.id } }) },
          text: tab.label,
        },
      ),
    ),
  );
  view.append(tabs);

  switch (active) {
    case 'artistas':
      view.append(renderArtists());
      break;
    case 'albums':
      view.append(renderAlbums());
      break;
    case 'offline':
      view.append(renderOffline());
      break;
    case 'carpetas':
      view.append(renderFolders());
      break;
    default:
      view.append(renderSongs());
      break;
  }

  return view;
}

function renderSongs(): HTMLElement {
  const tracks = libraryTracks();
  const wrap = h('div', {});

  if (tracks.length === 0) {
    wrap.append(
      h(
        'div',
        { class: 'empty-state' },
        icon('folder', 44),
        h('p', { class: 'empty-state__title', text: 'Todavia no importaste musica' }),
        h('p', { class: 'empty-state__hint', text: 'Elegi una carpeta de tu disco y Sonora lee los tags para ordenarlo todo.' }),
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => void importFilesFlow() }, text: 'Elegir carpeta' }),
      ),
    );
    return wrap;
  }

  const sorted = [...tracks].sort((a, b) => a.title.localeCompare(b.title));
  wrap.append(
    h(
      'div',
      { class: 'row-actions' },
      h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => void playTracks(sorted) } }, icon('play', 18), 'Reproducir'),
      h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => void addAllToQueue(sorted) }, text: 'Agregar a la cola' }),
      h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => void addToPlaylistFlow(sorted) }, text: 'Guardar en playlist' }),
      h(
        'button',
        { class: 'btn btn--ghost', type: 'button', on: { click: () => void downloadAllOffline(sorted) }, text: 'Descargar todo' },
      ),
    ),
  );
  wrap.append(renderTrackList({ tracks: sorted, showAdded: true, showPlays: true }));
  return wrap;
}

function renderArtists(): HTMLElement {
  const tracks = libraryTracks();
  const grouped = groupBy(tracks, (t) => t.artist || 'Desconocido');
  const artists = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (artists.length === 0) {
    return h('div', { class: 'empty-state' }, icon('music', 40), h('p', { class: 'empty-state__title', text: 'Sin artistas todavia' }));
  }

  return h(
    'div',
    { class: 'card-grid' },
    ...artists.map(([artist, list]) =>
      mediaCard({
        title: artist,
        subtitle: `${list.length} ${pluralize(list.length, 'pista')}`,
        accent: '#5b3a8c',
        round: true,
        onOpen: () => setRoute({ name: 'playlist', params: { id: `artist:${encodeURIComponent(artist)}` } }),
        onAction: () => void playTracks(list),
        actionLabel: `Reproducir ${artist}`,
      }),
    ),
  );
}

function renderAlbums(): HTMLElement {
  const tracks = libraryTracks();
  const grouped = groupBy(tracks, (t) => `${t.artist}::${t.album || 'Sin album'}`);
  const albums = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (albums.length === 0) {
    return h('div', { class: 'empty-state' }, icon('disco', 40), h('p', { class: 'empty-state__title', text: 'Sin albums todavia' }));
  }

  return h(
    'div',
    { class: 'card-grid' },
    ...albums.map(([key, list]) => {
      const [artist, album] = key.split('::');
      return mediaCard({
        title: album ?? 'Sin album',
        subtitle: artist ?? '',
        accent: '#2b6f5e',
        track: list[0],
        onOpen: () => setRoute({ name: 'playlist', params: { id: `album:${encodeURIComponent(key)}` } }),
        onAction: () => void playTracks(list),
        actionLabel: `Reproducir ${album ?? 'album'}`,
      });
    }),
  );
}

function renderOffline(): HTMLElement {
  const state = getState();
  const tracks = resolveTracks([...state.offlineIds]);
  const wrap = h('div', {});

  const used = formatBytes(state.storage.usage);
  const quota = state.storage.quota > 0 ? formatBytes(state.storage.quota) : 'ilimitado';
  const pct = state.storage.quota > 0 ? Math.min(100, (state.storage.usage / state.storage.quota) * 100) : 0;

  wrap.append(
    h(
      'div',
      { class: 'storage-card' },
      h('h2', { class: 'storage-card__title', text: 'Escucha sin internet' }),
      h('p', {
        class: 'storage-card__text',
        text: 'Las descargas se guardan en este dispositivo. Despues funcionan aunque no tengas conexion.',
      }),
      h(
        'div',
        { class: 'storage-bar', attrs: { role: 'progressbar', 'aria-valuenow': String(Math.round(pct)) } },
        h('span', { class: 'storage-bar__fill', style: { width: `${Math.max(1.5, pct)}%` } }),
      ),
      h('p', { class: 'storage-card__meta', text: `${used} usados de ${quota} disponibles` }),
      h(
        'div',
        { class: 'row-actions' },
        h(
          'button',
          {
            class: 'btn btn--ghost',
            type: 'button',
            on: {
              click: async () => {
                const { confirmed } = await confirmDialog({
                  title: 'Borrar todas las descargas',
                  body: 'Se quitaran las pistas descargadas. Tu biblioteca y tus playlists no se tocan.',
                  confirmLabel: 'Borrar',
                  danger: true,
                });
                if (confirmed) {
                  await clearAllOffline();
                  toast({ message: 'Descargas borradas' });
                }
              },
            },
            text: 'Borrar descargas',
          },
        ),
      ),
    ),
  );

  if (tracks.length === 0) {
    wrap.append(
      h(
        'div',
        { class: 'empty-state' },
        icon('cloudOff', 40),
        h('p', { class: 'empty-state__title', text: 'No descargaste ninguna pista' }),
        h('p', { class: 'empty-state__hint', text: 'Urgente el boton de descarga de cualquier pista para tenerla disponible sin internet.' }),
      ),
    );
    return wrap;
  }

  wrap.append(renderTrackList({ tracks, showAlbum: true, emptyMessage: 'Sin descargas' }));
  return wrap;
}

function renderFolders(): HTMLElement {
  const state = getState();
  const wrap = h('div', {});

  wrap.append(
    h(
      'div',
      { class: 'row-actions' },
      h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => void importFilesFlow() } }, icon('folder', 18), 'Agregar carpeta'),
      h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => void rescanAllFolders() } }, icon('refresh', 18), 'Escanear todo'),
    ),
  );

  if (state.folders.length === 0) {
    wrap.append(
      h(
        'div',
        { class: 'empty-state' },
        icon('folder', 44),
        h('p', { class: 'empty-state__title', text: 'Sin carpetas' }),
        h('p', {
          class: 'empty-state__hint',
          text: 'Sonora no copia nada: lee los archivos donde ya estan. El permiso se lo das vos una sola vez.',
        }),
      ),
    );
    return wrap;
  }

  for (const folder of state.folders) {
    const folderTracks = [...state.tracks.values()].filter((t) => t.sourceRef?.startsWith(`${folder.id}:`));
    wrap.append(
      h(
        'article',
        {
          class: 'folder-row',
          on: {
            contextmenu: (event) => {
              event.preventDefault();
              showContextMenu(event.clientX, event.clientY, folderMenu(folder.id, folderTracks, folder.name));
            },
          },
        },
        h('span', { class: 'folder-row__icon' }, icon('folder', 26)),
        h(
          'div',
          { class: 'folder-row__text' },
          h('strong', { text: folder.name }),
          h('span', {
            class: 'folder-row__meta',
            text: `${folderSummary(folder)}${folder.kind === 'session' ? ' · importada en esta sesion' : ''}`,
          }),
        ),
        h(
          'div',
          { class: 'folder-row__actions' },
          h(
            'button',
            {
              class: 'btn btn--ghost btn--small',
              type: 'button',
              disabled: folder.kind !== 'handle',
              on: { click: () => void rescanFolder(folder.id) },
              text: 'Escanear',
            },
          ),
          h(
            'button',
            { class: 'btn btn--ghost btn--small', type: 'button', on: { click: () => void playTracks(folderTracks) }, text: 'Reproducir' },
          ),
          h(
            'button',
            { class: 'icon-btn', type: 'button', ariaLabel: 'Opciones de la carpeta', on: { click: (event) => showContextMenu(event.clientX, event.clientY, folderMenu(folder.id, folderTracks, folder.name)) } },
            icon('more', 20),
          ),
        ),
      ),
    );
  }

  return wrap;
}

function folderMenu(folderId: string, tracks: readonly Track[], name: string) {
  return [
    {
      id: 'play',
      label: `Reproducir ${tracks.length} ${pluralize(tracks.length, 'pista')}`,
      icon: 'play',
      onSelect: () => void playTracks(tracks),
    },
    {
      id: 'playlist',
      label: 'Guardar en una playlist',
      icon: 'playlist',
      onSelect: () => void addToPlaylistFlow(tracks),
    },
    {
      id: 'download',
      label: 'Descargar para uso offline',
      icon: 'download',
      onSelect: () => void downloadAllOffline(tracks),
    },
    {
      id: 'remove',
      label: 'Quitar carpeta de la app',
      icon: 'trash',
      danger: true,
      separatorBefore: true,
      onSelect: async () => {
        const { confirmed } = await confirmDialog({
          title: `Quitar "${name}"`,
          body: `Se borra de la lista y se quitan sus ${tracks.length} pistas de la biblioteca de Sonora. Los archivos de tu disco no se tocan.`,
          confirmLabel: 'Quitar',
          danger: true,
        });
        if (confirmed) await removeFolder(folderId, true);
      },
    },
  ];
}

async function downloadAllOffline(tracks: readonly Track[]): Promise<void> {
  const pending = tracks.filter((t) => !getState().offlineIds.has(t.id));
  if (pending.length === 0) {
    toast({ message: 'Todo ya esta descargado' });
    return;
  }
  const { confirmed } = await confirmDialog({
    title: `Descargar ${pending.length} ${pluralize(pending.length, 'pista')}`,
    body: 'Se guardan en el dispositivo para poder escucharlas sin internet. Occupan espacio en disco.',
    confirmLabel: 'Descargar',
  });
  if (!confirmed) return;

  let done = 0;
  await downloadPlaylist(pending.map((t) => t.id), () => {
    done++;
    if (done % 5 === 0 || done === pending.length) {
      toast({ message: `Descargando ${done} de ${pending.length}...` });
    }
  });

  const failed = [...getState().downloads.values()].filter((d) => d.state === 'error').length;
  toast({
    message: failed === 0 ? `${pending.length} pistas listas sin internet` : `${pending.length - failed} descargadas, ${failed} con errores`,
    kind: failed === 0 ? 'success' : 'warning',
  });
}
