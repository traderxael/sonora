import type { Route, RouteName } from '../lib/types';
import { setRoute } from '../state/store';

const VALID: RouteName[] = ['home', 'search', 'library', 'downloads', 'playlist', 'likes', 'settings', 'now-playing'];

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [rawName, ...rest] = clean.split('/').filter(Boolean);
  const name = (VALID as string[]).includes(rawName) ? (rawName as RouteName) : 'home';

  if (name === 'playlist') {
    return { name, params: { id: rest[0] ?? '' } };
  }
  return { name, params: {} };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'playlist':
      return `#/playlist/${route.params.id ?? ''}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route, replace = false): void {
  const target = routeToHash(route);
  if (window.location.hash === target) {
    setRoute(route);
    return;
  }
  if (replace) window.history.replaceState(null, '', target);
  else window.location.hash = target;
  if (replace) setRoute(route);
}

export function startRouter(): void {
  const apply = () => setRoute(parseHash(window.location.hash));
  window.addEventListener('hashchange', apply);
  if (!window.location.hash) {
    window.history.replaceState(null, '', '#/home');
  }
  apply();
}
