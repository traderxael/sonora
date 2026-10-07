import './styles/index.css';
import { registerSW } from 'virtual:pwa-register';
import { mountShell } from './ui/shell';
import { initStore, getState, notify, onRender, getTrack } from './state/store';
import { startRouter } from './ui/router';
import { handleSpotifyOAuthCallback } from './spotify/importer';
import { playerBus } from './audio/player';
import { toast } from './ui/toast';
import * as db from './lib/db';
import { downloadForOffline } from './download/offline';
import { closeContextMenu } from './ui/contextMenu';

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Falta el contenedor #app');

  try {
    await initStore();
  } catch (err) {
    root.innerHTML = `<div class="fatal">
      <h1>No pudimos abrir tu biblioteca</h1>
      <p>${err instanceof Error ? err.message : 'Error desconocido'}</p>
      <p>Si el problema sigue, borra los datos del sitio desde los ajustes del navegador.</p>
    </div>`;
    return;
  }

  await handleSpotifyOAuthCallback();
  mountShell(root);
  startRouter();

  // Si el navegador concede almacenamiento persistente, las descargas sobreviven mejor.
  void db.requestPersistentStorage();

  playerBus.on('permission', (message) => toast({ message, kind: 'warning' }));
  playerBus.on('error', (message) => toast({ message, kind: 'error' }));

  document.addEventListener('click', () => closeContextMenu());
  document.addEventListener('scroll', () => closeContextMenu(), true);
  window.addEventListener('blur', () => closeContextMenu());

  // Atajo global: "/" lleva al buscador.
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (event.key === '/') {
      event.preventDefault();
      window.location.hash = '#/search';
      setTimeout(() => document.querySelector<HTMLInputElement>('.search__input')?.focus(), 60);
    }
  });

  registerSW({ immediate: true });

  // Si el usuario lo pidio, cada pista remota que suena queda guardada en el dispositivo.
  onRender(() => {
    const state = getState();
    const trackId = state.player.trackId;
    if (!trackId || !state.settings.autoDownloadRemote || trackId === lastAutoDownloadId) return;
    if (state.offlineIds.has(trackId)) return;
    const track = getTrack(trackId);
    if (!track || track.source === 'local') return;
    lastAutoDownloadId = trackId;
    void downloadForOffline(track).catch(() => {
      /* la descarga automatica nunca interrumpe la reproduccion */
    });
  });

  notify();
}

let lastAutoDownloadId: string | null = null;

void bootstrap();
