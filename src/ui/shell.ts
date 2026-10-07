import { h, clear } from './dom';
import { icon } from './icons';
import { getState, setRoute, onRender, userPlaylists, likesPlaylist, notify } from '../state/store';
import { createPlayerBar } from './playerBar';
import { mountToasts } from './toast';
import { closeContextMenu } from './contextMenu';
import { clearPlaybackViewListeners } from '../audio/playback';
import { renderHome } from './views/home';
import { renderSearch } from './views/search';
import { renderLibrary } from './views/library';
import { renderPlaylist } from './views/playlist';
import { renderSettings } from './views/settings';
import { renderNowPlaying } from './views/nowPlaying';
import { createPlaylist, deletePlaylistById } from '../state/playlists';
import { confirmDialog } from './contextMenu';
import { toast } from './toast';
import { pluralize } from '../lib/utils';
import type { Route } from '../lib/types';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: Route;
}

const PRIMARY_NAV: NavItem[] = [
  { id: 'home', label: 'Inicio', icon: 'home', route: { name: 'home', params: {} } },
  { id: 'search', label: 'Buscar', icon: 'search', route: { name: 'search', params: {} } },
  { id: 'library', label: 'Tu biblioteca', icon: 'library', route: { name: 'library', params: {} } },
];

export function mountShell(root: HTMLElement): void {
  clear(root);

  const sidebar = h('aside', { class: 'sidebar' });
  const topbar = h('header', { class: 'topbar' });
  const main = h('main', { class: 'main', id: 'main-content' });
  const scanBar = h('div', { class: 'scan-bar', hidden: true });
  const offlineBanner = h('div', { class: 'offline-banner', role: 'status' });

  const content = h('div', { class: 'content' }, scanBar, offlineBanner, main);
  const layout = h('div', { class: 'layout' }, sidebar, h('div', { class: 'layout__main' }, topbar, content));
  const app = h('div', { class: 'app' }, layout, createPlayerBar());

  root.append(app);
  mountToasts(root);

  const renderSidebar = () => renderSidebarInto(sidebar);
  const renderTopbar = () => renderTopbarInto(topbar);
  const renderScan = () => renderScanBar(scanBar);
  const renderBanner = () => renderOfflineBanner(offlineBanner);

  const renderMain = () => {
    const state = getState();
    const scrollTop = main.scrollTop;
    const focus = captureFocus();
    clearPlaybackViewListeners();
    closeContextMenu();
    main.replaceChildren(renderRoute(state.route));
    main.scrollTop = scrollTop;
    restoreFocus(focus);
  };

  onRender(() => {
    renderSidebar();
    renderTopbar();
    renderMain();
    renderScan();
    renderBanner();
  });

  notify();
}

interface FocusSnapshot {
  id: string;
  start: number | null;
  end: number | null;
}

/**
 * Las vistas se reconstruyen enteras en cada cambio de estado. Sin esto, escribir
 * en el buscador perderia el foco a la primera letra.
 */
function captureFocus(): FocusSnapshot | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement)) return null;
  if (!active.id) return null;
  return {
    id: active.id,
    start: active.selectionStart ?? null,
    end: active.selectionEnd ?? null,
  };
}

function restoreFocus(snapshot: FocusSnapshot | null): void {
  if (!snapshot) return;
  const el = document.getElementById(snapshot.id);
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
  el.focus();
  if (snapshot.start !== null && snapshot.end !== null) {
    try {
      el.setSelectionRange(snapshot.start, snapshot.end);
    } catch {
      /* algunos input types no soportan selection */
    }
  }
}

function renderRoute(route: Route): HTMLElement {
  switch (route.name) {
    case 'search':
      return renderSearch();
    case 'library':
      return renderLibrary(route.params);
    case 'downloads':
      return renderDownloads();
    case 'playlist':
      return renderPlaylist(route.params.id ?? '');
    case 'likes':
      return renderPlaylist('sys_likes');
    case 'settings':
      return renderSettings();
    case 'now-playing':
      return renderNowPlaying();
    default:
      return renderHome();
  }
}

function renderSidebarInto(sidebar: HTMLElement): void {
  const state = getState();
  clear(sidebar);

  const brand = h(
    'a',
    { class: 'brand', href: '#/home' },
    h('span', { class: 'brand__mark' }, icon('disco', 26)),
    h('span', { class: 'brand__name', text: 'Sonora' }),
  );

  const nav = h(
    'nav',
    { class: 'nav', ariaLabel: 'Navegacion principal' },
    ...PRIMARY_NAV.map((item) => navLink(item, state.route)),
  );

  const playlists = userPlaylists();
  const likesCount = likesPlaylist().trackIds.length;

  const playlistSection = h(
    'div',
    { class: 'sidebar__playlists' },
    h(
      'div',
      { class: 'sidebar__section-head' },
      h('span', { class: 'sidebar__section-title', text: 'Playlists' }),
      h(
        'button',
        {
          class: 'icon-btn icon-btn--tiny',
          type: 'button',
          ariaLabel: 'Crear playlist',
          on: { click: () => void createPlaylistFlow() },
        },
        icon('plus', 18),
      ),
    ),
    h(
      'button',
      {
        class: `nav__link${state.route.name === 'likes' ? ' is-active' : ''}`,
        type: 'button',
        on: { click: () => setRoute({ name: 'likes', params: {} }) },
      },
      icon('heartFilled', 20),
      h('span', { class: 'nav__label', text: 'Me gusta' }),
      likesCount > 0 ? h('span', { class: 'nav__count', text: String(likesCount) }) : null,
    ),
    ...playlists.map((playlist) =>
      h(
        'button',
        {
          class: `nav__link${state.route.name === 'playlist' && state.route.params.id === playlist.id ? ' is-active' : ''}`,
          type: 'button',
          on: {
            click: () => setRoute({ name: 'playlist', params: { id: playlist.id } }),
            contextmenu: (event) => {
              event.preventDefault();
              void deletePlaylistFlow(playlist.id, playlist.name);
            },
          },
        },
        h('span', { class: 'nav__dot', style: { background: playlist.accent ?? '#666' } }),
        h('span', { class: 'nav__label', text: playlist.name }),
      ),
    ),
  );

  sidebar.append(
    brand,
    nav,
    h(
      'div',
      { class: 'sidebar__bottom' },
      playlistSection,
      h(
        'a',
        {
          class: `nav__link${state.route.name === 'settings' ? ' is-active' : ''}`,
          href: '#/settings',
        },
        icon('settings', 20),
        h('span', { class: 'nav__label', text: 'Ajustes' }),
      ),
    ),
  );

}

function navLink(item: NavItem, route: Route): HTMLElement {
  const active = route.name === item.route.name;
  return h(
    'a',
    { class: `nav__link${active ? ' is-active' : ''}`, href: `#/${item.route.name}` },
    icon(item.icon, 20),
    h('span', { class: 'nav__label', text: item.label }),
  );
}

function renderTopbarInto(topbar: HTMLElement): void {
  const state = getState();
  clear(topbar);

  const canBack = window.history.length > 1;
  topbar.append(
    h(
      'div',
      { class: 'topbar__nav' },
      h(
        'button',
        { class: 'icon-btn', type: 'button', ariaLabel: 'Atras', disabled: !canBack, on: { click: () => window.history.back() } },
        icon('chevronLeft', 20),
      ),
      h(
        'button',
        { class: 'icon-btn', type: 'button', ariaLabel: 'Adelante', on: { click: () => window.history.forward() } },
        icon('chevronRight', 20),
      ),
    ),
    h(
      'div',
      { class: 'topbar__right' },
      !state.online
        ? h('span', { class: 'topbar__chip topbar__chip--warn' }, icon('wifiOff', 16), 'Sin conexion')
        : h('span', { class: 'topbar__chip' }, icon('check', 16), 'Sin anuncios'),
      h(
        'button',
        { class: 'icon-btn', type: 'button', ariaLabel: 'Buscar', on: { click: () => setRoute({ name: 'search', params: {} }) } },
        icon('search', 20),
      ),
      h('a', { class: 'icon-btn', href: '#/settings', ariaLabel: 'Ajustes' }, icon('settings', 20)),
    ),
  );
}

function renderScanBar(scanBar: HTMLElement): void {
  const { scan } = getState();
  clear(scanBar);
  if (!scan) {
    scanBar.hidden = true;
    return;
  }
  const pct = scan.total > 0 ? Math.min(100, (scan.done / scan.total) * 100) : 8;
  scanBar.hidden = false;
  scanBar.replaceChildren(
    h('span', { class: 'scan-bar__label' }, icon('folder', 16), `Leyendo ${scan.folderName}`),
    h(
      'span',
      { class: 'scan-bar__track' },
      h('span', { class: 'scan-bar__fill', style: { width: `${Math.max(4, pct)}%` } }),
    ),
    h('span', { class: 'scan-bar__count', text: scan.total > 0 ? `${scan.done}/${scan.total}` : '…' }),
  );
}

function renderOfflineBanner(banner: HTMLElement): void {
  const state = getState();
  if (state.online) {
    banner.hidden = true;
    clear(banner);
    return;
  }
  const offlineCount = state.offlineIds.size;
  banner.hidden = false;
  banner.replaceChildren(
    icon('wifiOff', 18),
    h('span', {
      text:
        offlineCount > 0
          ? `Estas sin internet. Suena tu musica local y ${offlineCount} ${pluralize(offlineCount, 'pista')} descargada${offlineCount === 1 ? '' : 's'}.`
          : 'Estas sin internet. Solo vas a poder escuchar lo que ya tengas en el dispositivo.',
    }),
    h(
      'a',
      { class: 'offline-banner__link', href: '#/library' },
      'Ver descargas',
      icon('chevronRight', 16),
    ),
  );
}

async function createPlaylistFlow(): Promise<void> {
  const result = await confirmDialog({
    title: 'Nueva playlist',
    withInput: { label: 'Nombre', value: '', placeholder: 'Mi playlist' },
    confirmLabel: 'Crear',
  });
  const name = result.value?.trim();
  if (!result.confirmed || !name) return;
  const playlist = await createPlaylist(name);
  toast({ message: `Playlist "${playlist.name}" creada` });
  setRoute({ name: 'playlist', params: { id: playlist.id } });
}

async function deletePlaylistFlow(id: string, name: string): Promise<void> {
  const { confirmed } = await confirmDialog({
    title: `Eliminar "${name}"`,
    body: 'La playlist se borra. Las pistas siguen en tu biblioteca.',
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (confirmed) {
    await deletePlaylistById(id);
    toast({ message: 'Playlist eliminada' });
  }
}

