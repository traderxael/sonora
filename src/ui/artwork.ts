import { h } from './dom';
import { icon } from './icons';
import { loadArtworkUrl } from '../library/artwork';
import type { Track } from '../lib/types';

/** Placeholder de caratula. La imagen real se carga despues, de forma asincrona. */
export function artworkNode(track: Track, size: number): HTMLElement {
  const box = h('div', {
    class: 'artwork',
    style: { width: `${size}px`, height: `${size}px` },
    dataset: { artTrack: track.id },
  });

  const url = track.artworkUrl;
  if (url) {
    box.append(
      h('img', {
        class: 'artwork__img',
        src: url,
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        on: {
          error: (event) => {
            const img = event.target as HTMLImageElement;
            img.remove();
            if (!box.querySelector('svg')) box.append(icon('music', Math.round(size * 0.5)));
          },
        },
      }),
    );
  } else {
    box.append(icon('music', Math.round(size * 0.5)));
  }
  return box;
}

/** Rellena las caratulas locales que todavia no se cargaron. */
export function hydrateArtwork(root: ParentNode): void {
  const nodes = root.querySelectorAll<HTMLElement>('[data-art-track]:empty');
  for (const node of nodes) {
    const id = node.dataset.artTrack;
    if (!id) continue;
    void loadArtworkUrl(id).then((url) => {
      if (!url || !node.isConnected) return;
      node.replaceChildren(
        h('img', { class: 'artwork__img', src: url, alt: '', decoding: 'async' }),
      );
    });
  }
}

/** Portada de playlist/album: color solido con inicial. */
export function tileNode(label: string, accent: string, size: number): HTMLElement {
  return h(
    'div',
    {
      class: 'artwork artwork--tile',
      style: { width: `${size}px`, height: `${size}px`, background: `linear-gradient(150deg, ${accent}, ${accent}88)` },
    },
    h('span', { class: 'artwork__initial', text: (label.trim()[0] ?? '?').toUpperCase() }),
  );
}
