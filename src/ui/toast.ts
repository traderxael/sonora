import { Emitter } from '../lib/emitter';
import { h } from './dom';
import { icon } from './icons';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  message: string;
  kind?: ToastKind;
  duration?: number;
  action?: ToastAction;
}

interface LiveToast extends ToastInput {
  id: number;
}

const toastBus = new Emitter<{ show: LiveToast }>();
let nextId = 1;
let container: HTMLElement | null = null;

export function toast(input: ToastInput | string): void {
  const payload: ToastInput = typeof input === 'string' ? { message: input } : { ...input };
  toastBus.emit('show', { ...payload, id: nextId++ });
}

function dismiss(id: number): void {
  const el = container?.querySelector<HTMLElement>(`[data-toast="${id}"]`);
  if (!el) return;
  el.classList.remove('is-visible');
  setTimeout(() => el.remove(), 220);
}

export function mountToasts(parent: HTMLElement): void {
  container = h('div', { class: 'toast-stack', role: 'status', ariaLive: 'polite' });
  parent.append(container);

  toastBus.on('show', (item) => {
    if (!container) return;

    const el = h(
      'div',
      { class: `toast toast--${item.kind ?? 'info'}`, dataset: { toast: String(item.id) } },
      h('span', { class: 'toast__icon' }, icon(item.kind === 'error' || item.kind === 'warning' ? 'info' : 'check', 18)),
      h('p', { class: 'toast__message', text: item.message }),
      item.action
        ? h(
            'button',
            {
              class: 'toast__action',
              type: 'button',
              on: {
                click: () => {
                  item.action?.onClick();
                  dismiss(item.id);
                },
              },
            },
            item.action.label,
          )
        : null,
      h(
        'button',
        { class: 'toast__close', type: 'button', ariaLabel: 'Cerrar aviso', on: { click: () => dismiss(item.id) } },
        icon('close', 16),
      ),
    );

    container.append(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));

    const duration = item.duration ?? (item.kind === 'error' ? 8000 : 4000);
    if (duration > 0) setTimeout(() => dismiss(item.id), duration);
  });
}
