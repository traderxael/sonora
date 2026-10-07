import { h } from '../dom';
import { icon } from '../icons';
import { mediaCard, section } from '../cards';
import { getState, setRoute, libraryTracks, libraryCollections, userPlaylists, likesPlaylist, resolveTracks } from '../../state/store';
import { importFilesFlow, rescanAllFolders } from '../../state/libraryActions';
import { playTracks, openTrackMenu } from '../playActions';
import { pluralize } from '../../lib/utils';
import type { Track } from '../../lib/types';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Buenas noches';
  if (hour < 12) return 'Buen dia';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export function renderHome(): HTMLElement {
  const state = getState();
  const tracks = libraryTracks();

  const view = h('div', { class: 'view view--home' });

  if (tracks.length === 0 && state.playlists.size === 0) {
    view.append(renderWelcome());
    return view;
  }

  view.append(h('h1', { class: 'view__title', text: `${greeting()}` }));

  if (tracks.length > 0) view.append(renderQuickPicks(tracks));

  const recent = [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
  if (recent.length > 0) {
    view.append(
      section({
        title: 'Agregadas recientemente',
        children: recent.map((track) =>
          mediaCard({
            title: track.title,
            subtitle: track.artist,
            track,
            onOpen: () => void playTracks([track]),
            onMenu: (event) => openTrackMenu(event, track),
            onAction: () => void playTracks([track]),
            actionLabel: `Reproducir ${track.title}`,
          }),
        ),
      }),
    );
  }

  const collections = libraryCollections();
  if (collections.albums.length > 0) {
    view.append(
      section({
        title: 'Albums',
        children: collections.albums.slice(0, 12).map((album) =>
          mediaCard({
            title: album.name,
            subtitle: album.artist,
            accent: '#2b6f5e',
            onOpen: () => setRoute({ name: 'library', params: { tab: 'albums' } }),
            onAction: () => {
              const albumTracks = tracks.filter((t) => t.album === album.name && t.artist === album.artist);
              void playTracks(albumTracks);
            },
            actionLabel: `Reproducir ${album.name}`,
          }),
        ),
      }),
    );
  }

  if (collections.artists.length > 0) {
    view.append(
      section({
        title: 'Artistas',
        children: collections.artists.slice(0, 12).map((artist) =>
          mediaCard({
            title: artist,
            subtitle: `${tracks.filter((t) => t.artist === artist).length} ${pluralize(tracks.filter((t) => t.artist === artist).length, 'pista')}`,
            accent: '#5b3a8c',
            round: true,
            onOpen: () => setRoute({ name: 'library', params: { tab: 'artists' } }),
            onAction: () => {
              void playTracks(tracks.filter((t) => t.artist === artist));
            },
            actionLabel: `Reproducir ${artist}`,
          }),
        ),
      }),
    );
  }

  const playlists = userPlaylists();
  const likes = likesPlaylist().trackIds.length;
  if (playlists.length > 0 || likes > 0) {
    view.append(
      section({
        title: 'Tus playlists',
        children: [
          ...(likes > 0
            ? [
                mediaCard({
                  title: 'Me gusta',
                  subtitle: `${likes} ${pluralize(likes, 'pista')}`,
                  accent: '#7c5cff',
                  onOpen: () => setRoute({ name: 'likes', params: {} }),
                  onAction: () => void playTracks(resolveTracks(likesPlaylist().trackIds)),
                }),
              ]
            : []),
          ...playlists.map((playlist) =>
            mediaCard({
              title: playlist.name,
              subtitle: `${playlist.trackIds.length} ${pluralize(playlist.trackIds.length, 'pista')}`,
              accent: playlist.accent ?? '#444',
              onOpen: () => setRoute({ name: 'playlist', params: { id: playlist.id } }),
            }),
          ),
        ],
      }),
    );
  }

  view.append(
    section({
      title: 'Musica libre para escuchar',
      children: [
        mediaCard({
          title: 'Buscar temas libres',
          subtitle: 'Internet Archive, Openverse y Wikimedia',
          accent: '#1a7f5a',
          actionIcon: 'search',
          actionLabel: 'Buscar',
          onOpen: () => setRoute({ name: 'search', params: {} }),
        }),
        mediaCard({
          title: 'Mi biblioteca',
          subtitle: `${tracks.length} ${pluralize(tracks.length, 'pista')} en tu carpeta`,
          accent: '#3a5a8c',
          actionIcon: 'folder',
          actionLabel: 'Ver biblioteca',
          onOpen: () => setRoute({ name: 'library', params: {} }),
        }),
        mediaCard({
          title: 'Escanear de nuevo',
          subtitle: 'Buscar temas nuevas en tus carpetas',
          accent: '#8c6a3a',
          actionIcon: 'refresh',
          actionLabel: 'Escanear',
          onOpen: () => void rescanAllFolders(),
        }),
      ],
    }),
  );

  return view;
}

function renderQuickPicks(tracks: readonly Track[]): HTMLElement {
  const picks = [...tracks]
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) || b.addedAt - a.addedAt)
    .slice(0, 8);

  return h(
    'div',
    { class: 'quick-picks' },
    ...picks.map((track) =>
      h(
        'button',
        {
          class: 'quick-pick',
          type: 'button',
          on: { click: () => void playTracks([track]) },
        },
        h('span', { class: 'quick-pick__art' }, h('span', { class: 'quick-pick__icon' }, icon('play', 16))),
        h(
          'span',
          { class: 'quick-pick__text' },
          h('span', { class: 'quick-pick__title', text: track.title }),
          h('span', { class: 'quick-pick__artist', text: track.artist }),
        ),
        h('span', { class: 'quick-pick__more', on: { click: (event) => { event.stopPropagation(); openTrackMenu(event, track); } } }, icon('more', 18)),
      ),
    ),
  );
}

function renderWelcome(): HTMLElement {
  return h(
    'div',
    { class: 'welcome' },
    h('div', { class: 'welcome__logo' }, icon('disco', 56)),
    h('h1', { class: 'welcome__title', text: 'Tu música, a tu manera.' }),
    h('p', {
      class: 'welcome__text',
      text: 'Tu colección, tus playlists y un reproductor que sigue sonando sin conexión. Sin anuncios; todo queda en tu dispositivo.',
    }),
    h(
      'div',
      { class: 'welcome__actions' },
      h(
        'button',
        { class: 'btn btn--primary btn--big', type: 'button', on: { click: () => void importFilesFlow() } },
        icon('folder', 20),
        'Elegir carpeta de música',
      ),
      h(
        'button',
        { class: 'btn btn--ghost btn--big', type: 'button', on: { click: () => setRoute({ name: 'search', params: {} }) } },
        icon('search', 20),
        'Explorar música libre',
      ),
    ),
    h(
      'ul',
      { class: 'welcome__list' },
      h('li', {}, icon('check', 16), 'Lee MP3, FLAC, OGG, M4A, WAV y más desde tu disco'),
      h('li', {}, icon('check', 16), 'Descarga música para escuchar sin conexión'),
      h('li', {}, icon('check', 16), 'Sin anuncios ni rastreo. Tu biblioteca es privada'),
      h('li', {}, icon('check', 16), 'Descubre música libre en Internet Archive, Openverse y Wikimedia Commons'),
    ),
  );
}
