import { h } from '../dom';
import { icon } from '../icons';
import { getState, setSettings, setStorage } from '../../state/store';
import * as db from '../../lib/db';
import { confirmDialog } from '../contextMenu';
import { toast } from '../toast';
import { formatBytes, pluralize } from '../../lib/utils';
import { clearAllOffline } from '../../download/offline';
import { revokeArtworkUrls } from '../../library/artwork';
import { installState, promptInstall } from '../../pwa/install';
import { player } from '../../audio/player';
import type { Settings } from '../../lib/types';

interface ToggleSpec {
  key: keyof Settings;
  title: string;
  description: string;
}

const TOGGLES: ToggleSpec[] = [
  {
    key: 'visualizer',
    title: 'Visualizador en la barra',
    description: 'Muestra el espectro de la pista mientras suena. Con streams remotos dibuja una animacion, porque el navegador no deja analizar audio de otro dominio.',
  },
  {
    key: 'autoDownloadRemote',
    title: 'Descargar automaticamente lo que suena',
    description: 'Cada pista remota que reproduzcas se guarda en el dispositivo. Ocupa mas espacio, pero despues funciona sin internet.',
  },
];

export function renderSettings(): HTMLElement {
  const state = getState();
  const view = h('div', { class: 'view view--settings' });
  view.append(h('h1', { class: 'view__title', text: 'Ajustes' }));

  // ------------------------------------------------------------ instalacion
  view.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', { class: 'panel__title' }, icon('device', 20), 'Instalar la app'),
      h('p', {
        class: 'panel__text',
        text:
          installState.installed
            ? 'Sonora ya esta instalada en este dispositivo.'
            : 'Instalala como app: se abre en su propia ventana, funciona sin internet y no gasta datos si no reproduce musica de la web.',
      }),
      installState.canInstall
        ? h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => void promptInstall() }, text: 'Instalar ahora' })
        : h('p', {
            class: 'panel__hint',
            text: installState.installed
              ? ''
              : 'Si no aparece el boton, usa el menu del navegador: "Instalar app" o "Agregar a la pantalla de inicio".',
          }),
    ),
  );

  // -------------------------------------------------------------- audio
  const crossfade = h('input', {
    class: 'field__input',
    type: 'range',
    min: '0',
    max: '12',
    step: '1',
    value: String(state.settings.crossfadeSeconds),
  }) as HTMLInputElement;
  crossfade.style.setProperty('--value', `${(state.settings.crossfadeSeconds / 12) * 100}%`);
  crossfade.addEventListener('input', () => {
    const value = Number(crossfade.value);
    crossfade.style.setProperty('--value', `${(value / 12) * 100}%`);
    crossfade.nextElementSibling!.textContent = value === 0 ? 'sin crossfade' : `${value} s`;
    setSettings({ crossfadeSeconds: value });
    void db.setSetting('crossfadeSeconds', value);
  });

  view.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', { class: 'panel__title' }, icon('volume', 20), 'Audio'),
      h(
        'div',
        { class: 'field field--range' },
        h('span', { class: 'field__label', text: 'Crossfade entre pistas' }),
        crossfade,
        h('span', {
          class: 'field__value',
          text: state.settings.crossfadeSeconds === 0 ? 'sin crossfade' : `${state.settings.crossfadeSeconds} s`,
        }),
      ),
      h('p', { class: 'panel__hint', text: 'El crossfade encadena dos pistas con dos canales de audio. Con 0 s hay un corte breve entre temas.' }),
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field__label', text: 'Atajos de teclado' }),
        h('p', {
          class: 'panel__text panel__text--tight',
          text: 'Espacio: reproducir o pausar · ← →: 5 s · Shift + ← →: pista anterior o siguiente · ↑ ↓: volumen · M: silencio · S: aleatorio · R: repetir',
        }),
      ),
    ),
  );

  // -------------------------------------------------------------- toggles
  const toggles = h('div', {});
  for (const spec of TOGGLES) {
    toggles.append(renderToggle(spec, state.settings[spec.key] as boolean));
  }
  view.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', { class: 'panel__title' }, icon('settings', 20), 'Comportamiento'),
      toggles,
    ),
  );

  // -------------------------------------------------------------- storage
  const pct = state.storage.quota > 0 ? Math.min(100, (state.storage.usage / state.storage.quota) * 100) : 0;
  const offlineCount = state.offlineIds.size;
  view.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', { class: 'panel__title' }, icon('download', 20), 'Almacenamiento'),
      h(
        'div',
        { class: 'storage-bar', attrs: { role: 'progressbar', 'aria-valuenow': String(Math.round(pct)) } },
        h('span', { class: 'storage-bar__fill', style: { width: `${Math.max(1.5, pct)}%` } }),
      ),
      h('p', {
        class: 'panel__hint',
        text: `${formatBytes(state.storage.usage)} usados · ${offlineCount} ${pluralize(offlineCount, 'pista')} descargada${offlineCount === 1 ? '' : 's'}`,
      }),
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
                const granted = await db.requestPersistentStorage();
                toast({
                  message: granted ? 'Almacenamiento persistente activado' : 'El navegador decidio no guardarlo de forma permanente',
                  kind: granted ? 'success' : 'warning',
                });
                setStorage(await db.offlineUsage());
              },
            },
            text: 'Pedir almacenamiento permanente',
          },
        ),
        h(
          'button',
          {
            class: 'btn btn--ghost',
            type: 'button',
            on: {
              click: async () => {
                const { confirmed } = await confirmDialog({
                  title: 'Borrar descargas',
                  body: 'Se quitan las pistas descargadas para uso offline.',
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

  // ---------------------------------------------------------------- danger
  view.append(
    h(
      'section',
      { class: 'panel panel--danger' },
      h('h2', { class: 'panel__title' }, icon('trash', 20), 'Zona sensata'),
      h('p', { class: 'panel__text', text: 'Borra todo lo que Sonora guardo en este dispositivo: biblioteca, playlists, carpetas y descargas. No toca tus archivos.' }),
      h(
        'div',
        { class: 'row-actions' },
        h(
          'button',
          {
            class: 'btn btn--danger',
            type: 'button',
            on: {
              click: async () => {
                const { confirmed } = await confirmDialog({
                  title: 'Borrar todos los datos',
                  body: 'No se puede deshacer. Vas a perder tus playlists y tus descargas.',
                  confirmLabel: 'Borrar todo',
                  danger: true,
                });
                if (!confirmed) return;
                await db.wipeEverything();
                revokeArtworkUrls();
                player.stop();
                location.reload();
              },
            },
            text: 'Borrar todos los datos',
          },
        ),
      ),
    ),
  );

  view.append(
    h(
      'footer',
      { class: 'settings-footer' },
      h('p', { text: 'Sonora · reproductor local y de musica libre · sin publicidad, sin cuentas y sin telemetria.' }),
      h('p', { class: 'settings-footer__links' },
        h('a', { href: 'https://archive.org', target: '_blank', rel: 'noreferrer noopener', text: 'Internet Archive' }),
        h('a', { href: 'https://openverse.org', target: '_blank', rel: 'noreferrer noopener', text: 'Openverse' }),
        h('a', { href: 'https://commons.wikimedia.org', target: '_blank', rel: 'noreferrer noopener', text: 'Wikimedia Commons' }),
      ),
    ),
  );

  return view;
}

function renderToggle(spec: ToggleSpec, value: boolean): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: value, class: 'switch__input' }) as HTMLInputElement;
  input.addEventListener('change', () => {
    setSettings({ [spec.key]: input.checked } as Partial<Settings>);
    void db.setSetting(spec.key, input.checked as never);
  });

  return h(
    'label',
    { class: 'switch' },
    h(
      'span',
      { class: 'switch__text' },
      h('span', { class: 'switch__title', text: spec.title }),
      h('span', { class: 'switch__description', text: spec.description }),
    ),
    h('span', { class: 'switch__control' }, input, h('span', { class: 'switch__track' })),
  );
}
