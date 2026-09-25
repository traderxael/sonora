import { Emitter } from '../lib/emitter';
import { h, clear } from './dom';
import { icon } from './icons';

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect?: () => void;
}

const menuBus = new Emitter<{ close: undefined }>();
let openMenu: HTMLElement | null = null;

export function closeContextMenu(): void {
  openMenu?.remove();
  openMenu = null;
}

menuBus.on('close', closeContextMenu);

export function showContextMenu(x: number, y: number, items: MenuItem[]): void {
  closeContextMenu();

  const menu = h('div', { class: 'context-menu', role: 'menu' });
  for (const item of items) {
    if (item.separatorBefore) menu.append(h('div', { class: 'context-menu__sep', role: 'separator' }));
    const button = h(
      'button',
      {
        class: `context-menu__item${item.danger ? ' is-danger' : ''}`,
        type: 'button',
        role: 'menuitem',
        disabled: item.disabled,
        on: {
          click: () => {
            closeContextMenu();
            item.onSelect?.();
          },
        },
      },
      item.icon ? icon(item.icon, 18) : null,
      h('span', { text: item.label }),
    );
    menu.append(button);
  }

  document.body.append(menu);
  openMenu = menu;

  // Ajuste contra los bordes de la ventana.
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;

  requestAnimationFrame(() => menu.classList.add('is-open'));
}

export interface DialogOptions {
  title: string;
  body?: HTMLElement | string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Devuelve un valor para el input de texto, si se pasa. */
  withInput?: { label: string; value: string; placeholder?: string };
}

export function confirmDialog(options: DialogOptions): Promise<{ confirmed: boolean; value?: string }> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const valueInput = options.withInput
      ? h('input', {
          class: 'field__input',
          type: 'text',
          value: options.withInput.value,
          placeholder: options.withInput.placeholder ?? '',
          attrs: { 'aria-label': options.withInput.label },
        })
      : null;

    const close = (confirmed: boolean) => {
      document.removeEventListener('keydown', onKey, true);
      clear(overlay);
      overlay.remove();
      previousFocus?.focus?.();
      resolve({ confirmed, value: valueInput ? valueInput.value : undefined });
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(false);
      }
    };

    const body =
      typeof options.body === 'string' ? h('p', { class: 'dialog__text', text: options.body }) : options.body;

    const dialog = h(
      'div',
      { class: 'dialog', role: 'dialog', ariaModal: 'true', ariaLabel: options.title },
      h(
        'header',
        { class: 'dialog__header' },
        h('h2', { class: 'dialog__title', text: options.title }),
        h(
          'button',
          { class: 'icon-btn', type: 'button', ariaLabel: 'Cerrar', on: { click: () => close(false) } },
          icon('close', 20),
        ),
      ),
      body ? h('div', { class: 'dialog__body' }, body) : null,
      valueInput ? h('div', { class: 'dialog__body' }, h('label', { class: 'field' }, h('span', { class: 'field__label', text: options.withInput?.label }), valueInput)) : null,
      h(
        'footer',
        { class: 'dialog__footer' },
        h('button', { class: 'btn btn--ghost', type: 'button', text: options.cancelLabel ?? 'Cancelar', on: { click: () => close(false) } }),
        h('button', {
          class: `btn ${options.danger ? 'btn--danger' : 'btn--primary'}`,
          type: 'button',
          text: options.confirmLabel ?? 'Aceptar',
          on: { click: () => close(true) },
        }),
      ),
    );

    const overlay = h(
      'div',
      {
        class: 'dialog-overlay',
        on: {
          click: (event) => {
            if (event.target === overlay) close(false);
          },
        },
      },
      dialog,
    );

    document.body.append(overlay);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      (valueInput ?? dialog.querySelector<HTMLElement>('.btn--primary'))?.focus();
    });
  });
}
