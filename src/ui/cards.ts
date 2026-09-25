import { h } from './dom';
import { icon } from './icons';
import { artworkNode, hydrateArtwork, tileNode } from './artwork';
import type { Track } from '../lib/types';

export interface CardOptions {
  title: string;
  subtitle?: string;
  track?: Track;
  accent?: string;
  onOpen?: () => void;
  onMenu?: (event: MouseEvent) => void;
  /** Accion del boton circular que aparece al pasar el mouse. */
  actionIcon?: string;
  actionLabel?: string;
  onAction?: () => void;
  round?: boolean;
}

export function mediaCard(options: CardOptions): HTMLElement {
  const { title, subtitle } = options;
  const art = options.track
    ? artworkNode(options.track, 64)
    : tileNode(title, options.accent ?? '#444', 64);

  const card = h(
    'article',
    {
      class: 'media-card',
      tabIndex: 0,
      role: 'button',
      ariaLabel: title,
      on: {
        click: () => options.onOpen?.(),
        keydown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            options.onOpen?.();
          }
        },
        contextmenu: (event) => options.onMenu?.(event),
      },
    },
    h(
      'div',
      { class: `media-card__art${options.round ? ' is-round' : ''}` },
      art,
      options.onAction
        ? h(
            'button',
            {
              class: 'media-card__play',
              type: 'button',
              ariaLabel: options.actionLabel ?? 'Reproducir',
              on: { click: (event) => { event.stopPropagation(); options.onAction?.(); } },
            },
            icon(options.actionIcon ?? 'play', 20),
          )
        : null,
    ),
    h('h3', { class: 'media-card__title', text: title }),
    subtitle ? h('p', { class: 'media-card__subtitle', text: subtitle }) : null,
  );

  queueMicrotask(() => hydrateArtwork(card));
  return card;
}

export interface SectionOptions {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: (HTMLElement | null)[];
}

export function section(options: SectionOptions): HTMLElement {
  return h(
    'section',
    { class: 'section' },
    h(
      'header',
      { class: 'section__header' },
      h('h2', { class: 'section__title', text: options.title }),
      options.onAction
        ? h(
            'button',
            { class: 'section__action', type: 'button', on: { click: options.onAction } },
            options.actionLabel ?? 'Ver todo',
            icon('chevronRight', 18),
          )
        : null,
    ),
    h('div', { class: 'section__grid' }, ...options.children),
  );
}
