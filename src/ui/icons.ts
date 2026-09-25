export interface IconDef {
  /** Contenido del <svg> (paths). */
  paths: string;
  viewBox?: string;
}

const ICONS: Record<string, IconDef> = {
  home: { paths: '<path d="M12 3 3 10.2V21h6v-6h6v6h6V10.2L12 3z"/>' },
  search: {
    paths: '<path d="M10.5 3a7.5 7.5 0 1 0 4.55 13.46l4.24 4.25 1.42-1.42-4.25-4.24A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"/>',
  },
  library: {
    paths: '<path d="M4 3h3v18H4V3Zm5 0h3v18H9V3Zm5.2.6 2.96.8-3.9 17.1-2.95-.8L14.2 3.6ZM4 21h16v2H4v-2Z"/>',
  },
  playlist: {
    paths: '<path d="M3 6h12v2H3V6Zm0 5h12v2H3v-2Zm0 5h8v2H3v-2Zm14.5-9L21 8v9.2a2.8 2.8 0 1 1-2-2.7V11l-3.5.9v6.4a2.8 2.8 0 1 1-2-2.7V9.9L17.5 7Z"/>',
  },
  heart: {
    paths: '<path d="M12 20.7 4.6 13.3a5 5 0 0 1 7-7.1l.4.4.4-.4a5 5 0 1 1 7 7.1L12 20.7Z"/>',
  },
  heartFilled: {
    paths: '<path d="M12 20.7 4.6 13.3a5 5 0 0 1 7-7.1l.4.4.4-.4a5 5 0 1 1 7 7.1L12 20.7Z" fill="currentColor" stroke="currentColor"/>',
  },
  play: { paths: '<path d="M7 4.5v15l13-7.5-13-7.5Z"/>' },
  pause: { paths: '<path d="M6.5 4h4v16h-4V4Zm7 0h4v16h-4V4Z"/>' },
  previous: { paths: '<path d="M6 5h2.5v14H6V5Zm12 0v14L9.5 12 18 5Z"/>' },
  next: { paths: '<path d="M15.5 5H18v14h-2.5V5ZM6 5l8.5 7L6 19V5Z"/>' },
  shuffle: {
    paths:
      '<path d="M16 3.5 21.5 8 16 12.5V9.5h-2.3l-2.4 3.1 1.5 1.9L16 10.5V13h2.3l2.4 3.1-1.5 1.9L16 14.5v-3h-.4L10.3 20H3v-2.6h5.9l4.9-6.2-4.9-6.2H3V3h7.3l5.3 6.5H16V3.5Z"/>',
  },
  repeat: {
    paths: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7Zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4Z"/>',
  },
  repeatOne: {
    paths: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7Zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4Z"/><path d="M11 9.5h1.6v5H11z" fill="currentColor" stroke="none"/>',
  },
  volume: { paths: '<path d="M4 9h3.5L12 4.5v15L7.5 15H4V9Z"/>' },
  volumeMute: {
    paths: '<path d="M4 9h3.5L12 4.5v15L7.5 15H4V9Z"/><path d="m16 9 5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  volumeLow: {
    paths: '<path d="M4 9h3.5L12 4.5v15L7.5 15H4V9Z"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },
  download: { paths: '<path d="M11 3h2v9.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4L11 12.2V3ZM4 19h16v2H4v-2Z"/>' },
  downloaded: {
    paths: '<path d="M11 3h2v9.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4L11 12.2V3ZM4 19h16v2H4v-2Z" opacity=".35"/><path d="m9.6 15.4-1.4-1.4 4-4 1.4 1.4-4 4Z"/>',
  },
  trash: {
    paths: '<path d="M9 3h6l1 2h4v2H4V5h4l1-2ZM6 8h12l-.9 12.1A2 2 0 0 1 15.1 22H8.9a2 2 0 0 1-2-1.9L6 8Z"/>',
  },
  more: { paths: '<path d="M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>' },
  folder: {
    paths: '<path d="M3 5h6l2 2.5h10V20H3V5Z"/>',
  },
  music: {
    paths: '<path d="M20 3.5v11.2a3.3 3.3 0 1 1-2-3V8.4l-7 1.6v7.7a3.3 3.3 0 1 1-2-3V7.5l11-2.5V3.5Z"/>',
  },
  disco: {
    paths: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 4.5A1.5 1.5 0 1 0 12 13.5 1.5 1.5 0 0 0 12 10.5Z"/>',
  },
  settings: {
    paths: '<path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8.9 4.6.1-1.1-.1-1.1 1.9-1.5-1.9-3.3-2.3.8a7.6 7.6 0 0 0-1.9-1.1L16.3 3h-3.8l-.4 2.2c-.7.3-1.3.6-1.9 1.1l-2.3-.8-1.9 3.3 1.9 1.5-.1 1.1.1 1.1-1.9 1.5 1.9 3.3 2.3-.8c.6.5 1.2.8 1.9 1.1l.4 2.2h3.8l.4-2.2c.7-.3 1.3-.6 1.9-1.1l2.3.8 1.9-3.3-1.9-1.5Z"/>',
  },
  close: {
    paths: '<path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"/>',
  },
  plus: { paths: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z"/>' },
  check: { paths: '<path d="m9.6 16.2-3.8-3.8-1.4 1.4 5.2 5.2L20 8.6 18.6 7.2 9.6 16.2Z"/>' },
  chevronLeft: { paths: '<path d="M15.4 4.6 8 12l7.4 7.4 1.4-1.4L10.8 12l6-6-1.4-1.4Z"/>' },
  chevronRight: { paths: '<path d="M8.6 4.6 7.2 6l6 6-6 6 1.4 1.4L16 12 8.6 4.6Z"/>' },
  chevronDown: { paths: '<path d="M5.6 8.6 7 7.2l5 5 5-5 1.4 1.4L12 15 5.6 8.6Z"/>' },
  clock: {
    paths: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-1 3v6l5 3 1-1.7-4-2.3V7h-2Z"/>',
  },
  wifiOff: {
    paths:
      '<path d="M12 5c3.4 0 6.6 1.2 9 3.2l1.5-1.7A16 16 0 0 0 12 3 16 16 0 0 0 4.4 3.6l1.5 1.7A13.9 13.9 0 0 1 12 5Zm4.6 4.9-1.7 1.9A7.7 7.7 0 0 0 12 10.5c-1 0-2 .2-2.9.5L7.4 9.9A10.4 10.4 0 0 1 12 9.3c2.7 0 5.2 1 7.1 2.6l1.5-1.7A13.4 13.4 0 0 0 12 7c-.7 0-1.4.1-2.1.2l1.7 2 1.4-.8A10 10 0 0 1 12 8.3c1.9 0 3.7.5 5.2 1.5l-1.4.8.8 1.3 2.6 3.3 1.4-1.4-1.3-1.7ZM12 14a3.5 3.5 0 0 1 2.4 1l-1.5 1.7c-.3-.2-.6-.3-.9-.4L12 16l-1.1.3L9.6 14c.7-.4 1.5-.6 2.4-.6ZM3.3 2.3 4.7 3.7l16 16-1.4 1.4-2-2A8 8 0 0 1 6.5 14 7 7 0 0 0 12 21a7 7 0 0 0 3.6-1l2 2 1.4-1.4L4.7 3.7 3.3 2.3Z"/>',
  },
  info: { paths: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 5h2v2h-2V7Zm0 4h2v6h-2v-6Z"/>' },
  external: {
    paths: '<path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H6v11h11v-5h2v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  },
  refresh: {
    paths: '<path d="M12 4a8 8 0 0 1 7.5 5.2l-1.9.7A6 6 0 0 0 6 8.7V11H3V5h2v2.4A8 8 0 0 1 12 4Zm7 9h2v6h-2v-2.4A8 8 0 0 1 4 14.8l1.9-.7A6 6 0 0 0 18 15.3V13h1Z"/>',
  },
  queue: { paths: '<path d="M3 6h12v2H3V6Zm0 5h12v2H3v-2Zm0 5h8v2H3v-2Zm13.5-9L21 8v9.2a2.8 2.8 0 1 1-2-2.7V11l-3.5.9v6.4a2.8 2.8 0 1 1-2-2.7V9.9L16.5 7Z"/>' },
  fullscreen: { paths: '<path d="M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z"/>' },
  filter: { paths: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/>' },
  sort: { paths: '<path d="M4 6h16v2H4V6Zm0 5h11v2H4v-2Zm0 5h7v2H4v-2Z"/>' },
  sparkle: {
    paths: '<path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Zm7 12 .9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14Z"/>',
  },
  cloudOff: {
    paths: '<path d="M3.3 3.3 4.7 4.7l3 3A6 6 0 0 0 6 11a5 5 0 0 0 .8 9.8h9.4l2 2 1.4-1.4L3.3 3.3ZM7 12a4 4 0 0 1 1.2-2.8l5.6 5.6A4 4 0 0 1 7 12Zm13.9 5.2A5 5 0 0 0 18 10a6 6 0 0 0-8.2-4.2l4.1 4.1H21a4 4 0 0 1-.1 7.1Z"/>',
  },
  device: { paths: '<path d="M4 4h16v11H4V4Zm2 2v7h12V6H6Zm2.5 12h7l-1 2h-5l-1-2Z"/>' },
};

export function icon(name: keyof typeof ICONS | string, size = 20, className = ''): SVGSVGElement {
  const def = ICONS[name] ?? ICONS.music;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', def.viewBox ?? '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  svg.innerHTML = def.paths;
  return svg;
}

export function hasIcon(name: string): boolean {
  return name in ICONS;
}
