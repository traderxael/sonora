import { h } from './dom';
import { icon } from './icons';
import { userPlaylists } from '../state/store';
import { pluralize } from '../lib/utils';

export type PlaylistChoice = string | 'new' | null;

/** Selector de playlist. Devuelve el id, "new" para crear una, o null si se cancela. */
export function choosePlaylist(trackCount: number): Promise<PlaylistChoice> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const playlists = userPlaylists();

    const close = (choice: PlaylistChoice) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      previousFocus?.focus?.();
      resolve(choice);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(null);
      }
    };

    const options = h(
      'div',
      { class: 'picker__list' },
      ...playlists.map((playlist) =>
        h(
          'button',
          {
            class: 'picker__item',
            type: 'button',
            on: { click: () => close(playlist.id) },
          },
          h('span', { class: 'picker__swatch', style: { background: playlist.accent ?? '#555' } }),
          h('span', { class: 'picker__name', text: playlist.name }),
          h('span', { class: 'picker__count', text: String(playlist.trackIds.length) }),
        ),
      ),
    );

    const dialog = h(
      'div',
      { class: 'dialog dialog--picker', role: 'dialog', ariaModal: 'true', ariaLabel: 'Elegir playlist' },
      h(
        'header',
        { class: 'dialog__header' },
        h('h2', {
          class: 'dialog__title',
          text: `Agregar ${trackCount} ${pluralize(trackCount, 'pista')}`,
        }),
        h('button', { class: 'icon-btn', type: 'button', ariaLabel: 'Cerrar', on: { click: () => close(null) } }, icon('close', 20)),
      ),
      h(
        'div',
        { class: 'dialog__body' },
        h(
          'button',
          { class: 'picker__item picker__item--new', type: 'button', on: { click: () => close('new') } },
          h('span', { class: 'picker__swatch picker__swatch--new' }, icon('plus', 16)),
          h('span', { class: 'picker__name', text: 'Nueva playlist' }),
        ),
        playlists.length === 0
          ? h('p', { class: 'dialog__text', text: 'Todavia no tenes playlists. Crea la primera.' })
          : options,
      ),
    );

    const overlay = h(
      'div',
      {
        class: 'dialog-overlay',
        on: {
          click: (event) => {
            if (event.target === overlay) close(null);
          },
        },
      },
      dialog,
    );

    document.body.append(overlay);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      options.querySelector<HTMLElement>('.picker__item')?.focus();
    });
  });
}
