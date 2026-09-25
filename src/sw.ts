/// <reference lib="webworker" />

/**
 * Service worker de Sonora.
 *
 * Tres cosas importan aca:
 *  1. Que el shell de la app quede cacheado para que abra sin internet.
 *  2. Que el audio remoto que ya se escucho se pueda volver a reproducir offline.
 *  3. Que las consultas a las APIs de musica libre no fallen si se corta la red.
 *
 * Las descargas "oficiales" de la app (boton de descargar) no pasan por aca:
 * se guardan como Blob en IndexedDB, que es mas confiable y no expulsa por cuota.
 */

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { RangeRequestsPlugin } from 'workbox-range-requests';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const AUDIO_PATTERN = /\.(mp3|ogg|oga|m4a|aac|opus|flac|wav|weba|webm)(\?|$)/i;
const WEEK = 60 * 60 * 24 * 7;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

// Navegacion: red primero para recoger actualizaciones, cache como respaldo.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'sonora-pages-v1',
    networkTimeoutSeconds: 4,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
);

// Audio remoto ya escuchado: cache primero, con soporte de Range para poder avanzar.
registerRoute(
  ({ url, request }) =>
    request.destination !== 'document' && AUDIO_PATTERN.test(url.pathname) && url.origin !== self.location.origin,
  new CacheFirst({
    cacheName: 'sonora-audio-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200, 206] }),
      new RangeRequestsPlugin(),
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: WEEK * 13,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// APIs de musica libre: revalidar en segundo plano para responder al instante.
const apiRoute = (cacheName: string) =>
  new StaleWhileRevalidate({
    cacheName,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: WEEK, purgeOnQuotaError: true }),
    ],
  });

registerRoute(({ url }) => url.origin === 'https://archive.org', apiRoute('sonora-api-archive-v1'));
registerRoute(({ url }) => url.origin === 'https://api.openverse.org', apiRoute('sonora-api-openverse-v1'));
registerRoute(({ url }) => url.hostname === 'commons.wikimedia.org', apiRoute('sonora-api-commons-v1'));

// Caratulas remotas: cache para que las listas no queden con huecos sin conexion.
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'sonora-images-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: WEEK * 4, purgeOnQuotaError: true }),
    ],
  }),
);

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

// Si algo falla y no hay nada en cache, al menos devolvemos la app cacheada.
setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    const cached = await caches.match('index.html', { ignoreSearch: true });
    if (cached) return cached;
  }
  return Response.error();
});
