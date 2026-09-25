export type Child = Node | string | number | null | undefined | false;

/**
 * Los handlers reciben `any` a proposito: la misma funcion se usa para eventos de
 * mouse, teclado, foco y media. Narrowing por casts explicitos cuando hace falta.
 */
export type EventHandler = (event: any) => void;

export interface Props {
  class?: string;
  id?: string;
  text?: string;
  html?: string;
  title?: string;
  type?: string;
  value?: string | number;
  placeholder?: string;
  href?: string;
  src?: string;
  alt?: string;
  name?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  rows?: number;
  disabled?: boolean;
  checked?: boolean;
  hidden?: boolean;
  tabIndex?: number;
  role?: string;
  ariaLabel?: string;
  ariaHidden?: string;
  ariaExpanded?: string;
  ariaPressed?: string;
  ariaCurrent?: string;
  ariaLive?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string | undefined>;
  attrs?: Record<string, string | undefined>;
  on?: Record<string, EventHandler>;
  [key: string]: unknown;
}

function appendChildren(el: HTMLElement, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

function applyProps(el: HTMLElement, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;

    switch (key) {
      case 'class':
        el.className = String(value);
        break;
      case 'text':
        el.textContent = String(value);
        break;
      case 'html':
        el.innerHTML = String(value);
        break;
      case 'style':
        if (typeof value === 'string') el.setAttribute('style', value);
        else Object.assign(el.style, value);
        break;
      case 'dataset':
        for (const [k, v] of Object.entries(value as Record<string, string | undefined>)) {
          if (v !== undefined) el.dataset[k] = v;
        }
        break;
      case 'attrs':
        for (const [k, v] of Object.entries(value as Record<string, string | undefined>)) {
          if (v !== undefined) el.setAttribute(k, v);
        }
        break;
      case 'on':
        for (const [event, handler] of Object.entries(value as Record<string, EventHandler>)) {
          if (typeof handler === 'function') el.addEventListener(event, handler);
        }
        break;
      case 'ariaLabel':
        el.setAttribute('aria-label', String(value));
        break;
      case 'ariaHidden':
        el.setAttribute('aria-hidden', String(value));
        break;
      case 'ariaExpanded':
        el.setAttribute('aria-expanded', String(value));
        break;
      case 'ariaPressed':
        el.setAttribute('aria-pressed', String(value));
        break;
      case 'ariaCurrent':
        el.setAttribute('aria-current', String(value));
        break;
      case 'ariaLive':
        el.setAttribute('aria-live', String(value));
        break;
      case 'disabled':
      case 'checked':
      case 'hidden':
        (el as unknown as Record<string, unknown>)[key] = Boolean(value);
        break;
      case 'tabIndex':
        el.tabIndex = Number(value);
        break;
      case 'value':
        (el as HTMLInputElement | HTMLTextAreaElement).value = String(value);
        break;
      case 'rows':
        (el as HTMLTextAreaElement).rows = Number(value);
        break;
      default:
        (el as unknown as Record<string, unknown>)[key] = value;
        break;
    }
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  appendChildren(el, children);
  return el;
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    f.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
  return f;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replace(el: Element, ...children: Child[]): void {
  clear(el);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function mustFind<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`No se encontro el elemento requerido: ${selector}`);
  return el;
}

/** Delegacion de eventos por selector dentro de un contenedor. */
export function delegate(
  root: HTMLElement,
  event: string,
  selector: string,
  handler: (target: HTMLElement, event: Event) => void,
): void {
  root.addEventListener(event, (rawEvent) => {
    const start = rawEvent.target;
    if (!(start instanceof Element)) return;
    const match = start.closest<HTMLElement>(selector);
    if (!match || !root.contains(match)) return;
    handler(match, rawEvent);
  });
}
