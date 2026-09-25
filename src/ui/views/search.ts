import { h } from '../dom';
import { icon } from '../icons';
import { getState, setSearch, getTrack } from '../../state/store';
import { searchAllSources, providers, candidateToTrack } from '../../sources';
import { debounce, errorMessage, formatTime, isAbortError, pluralize } from '../../lib/utils';
import { toast } from '../toast';
import { addToPlaylistFlow, playTrackNow, addToQueue } from '../playActions';
import { saveCandidate } from '../../state/playlists';
import type { RemoteCandidate } from '../../lib/types';

let controller: AbortController | null = null;
let lastTerm = '';
/** Lo que el usuario esta escribiendo. El input se recrea en cada render, asi que
 *  hay que guardarlo aparte para que un re-render no le borre el texto. */
let typed = '';

/** Devuelve el foco al buscador despues de un re-render. */
export function focusSearchInput(): void {
  document.getElementById('search-input')?.focus();
}

export function renderSearch(): HTMLElement {
  const state = getState();
  const view = h('div', { class: 'view view--search' });

  const input = h('input', {
    class: 'search__input',
    id: 'search-input',
    type: 'search',
    placeholder: 'Buscar musica libre (canciones, artistas, instrumentos)',
    value: typed || state.search.term,
    ariaLabel: 'Buscar musica libre',
  }) as HTMLInputElement;
  if (!typed) typed = state.search.term;

  const submit = () => void runSearch(input.value.trim());

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });
  const debounced = debounce(() => {
    if (input.value.trim().length >= 3) submit();
  }, 700);
  input.addEventListener('input', () => {
    typed = input.value;
    debounced();
  });

  view.append(
    h(
      'div',
      { class: 'search__bar' },
      h('span', { class: 'search__icon' }, icon('search', 20)),
      input,
      h(
        'button',
        { class: 'icon-btn', type: 'button', ariaLabel: 'Buscar', on: { click: submit } },
        icon('chevronRight', 20),
      ),
    ),
  );

  const results = h('div', { class: 'search__results' });

  if (state.search.term === '' && state.search.status === 'idle') {
    view.append(renderIntro());
    view.append(results);
    return view;
  }

  const statusLine = h('div', { class: 'search__status' });
  if (state.search.status === 'loading') {
    statusLine.append(
      h('span', { class: 'spinner' }),
      h('span', { text: `Buscando en ${Object.keys(state.search.sources).length || providers.length} fuentes...` }),
    );
  } else if (state.search.status === 'ready') {
    statusLine.append(
      h('span', { text: `${state.search.results.length} ${pluralize(state.search.results.length, 'resultado')} para "${state.search.term}"` }),
    );
  } else if (state.search.status === 'error') {
    statusLine.append(h('span', { class: 'search__error', text: state.search.error ?? 'Error al buscar' }));
  }
  view.append(statusLine);

  for (const [id, message] of Object.entries(state.search.sources)) {
    if (message !== 'error') continue;
    const provider = providers.find((p) => p.id === id);
    view.append(
      h('p', {
        class: 'search__warning',
        text: `No se pudo consultar ${provider?.name ?? id}: ${message}. Las demas fuentes siguen funcionando.`,
      }),
    );
  }

  if (state.search.status === 'ready' && state.search.results.length === 0) {
    results.append(
      h(
        'div',
        { class: 'empty-state' },
        icon('search', 40),
        h('p', { class: 'empty-state__title', text: 'Sin resultados' }),
        h('p', { class: 'empty-state__hint', text: 'Proba con otros terminos, por ejemplo "guitarra", "piano" o "jazz".' }),
      ),
    );
  }

  for (const candidate of state.search.results) {
    results.append(renderCandidate(candidate));
  }

  view.append(results);
  if (state.search.status === 'ready') {
    view.append(
      h(
        'p',
        { class: 'search__legal' },
        'Todo lo que aparece viene de archivos de dominio publico o con licencia Creative Commons. ',
        h('a', { href: providers[0]?.homepage ?? '#', target: '_blank', rel: 'noreferrer noopener', text: 'Ver fuentes' }),
      ),
    );
  }
  return view;
}

function renderIntro(): HTMLElement {
  return h(
    'div',
    { class: 'search__intro' },
    h('h1', { class: 'view__title', text: 'Buscar' }),
    h('p', {
      class: 'search__hint',
      text: 'Solo buscamos en repositorios con licencias libres: dominio publico o Creative Commons. Nada de anuncios ni musica con derechos.',
    }),
    h(
      'div',
      { class: 'search__suggestions' },
      ...['piano', 'guitarra acustica', 'jazz', 'musica electronica', 'flauta', 'rock clasico'].map((term) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            on: {
              click: () => {
                typed = term;
                lastTerm = term;
                setSearch({ term });
                void runSearch(term);
                requestAnimationFrame(() => focusSearchInput());
              },
            },
            text: term,
          },
        ),
      ),
    ),
    h(
      'div',
      { class: 'search__sources' },
      ...providers.map((provider) =>
        h(
          'a',
          { class: 'search__source', href: provider.homepage, target: '_blank', rel: 'noreferrer noopener' },
          icon('external', 16),
          h('strong', { text: provider.name }),
          h('span', { text: provider.attribution }),
        ),
      ),
    ),
  );
}

function renderCandidate(candidate: RemoteCandidate): HTMLElement {
  const saved = getTrack(candidateToTrack(candidate).id);

  const playBtn = h(
    'button',
    {
      class: `candidate__play${saved ? ' is-ready' : ''}`,
      type: 'button',
      ariaLabel: `Reproducir ${candidate.title}`,
      on: {
        click: async () => {
          if (saved) {
            await playTrackNow(saved);
            return;
          }
          const track = await saveCandidate(candidate);
          toast({ message: `"${track.title}" guardada y reproduciendo` });
          await playTrackNow(track);
        },
      },
    },
    icon(saved ? 'play' : 'download', 18),
  );

  return h(
    'article',
    { class: 'candidate' },
    candidate.artworkUrl
      ? h('img', { class: 'candidate__art', src: candidate.artworkUrl, alt: '', loading: 'lazy' })
      : h('span', { class: 'candidate__art candidate__art--empty' }, icon('music', 22)),
    h(
      'div',
      { class: 'candidate__text' },
      h('span', { class: 'candidate__title', text: candidate.title }),
      h(
        'span',
        { class: 'candidate__meta' },
        candidate.artist,
        candidate.duration ? ` · ${formatTime(candidate.duration)}` : '',
        h('span', { class: 'badge badge--source', title: candidate.attribution ?? '', text: candidate.license ?? 'libre' }),
      ),
    ),
    h(
      'div',
      { class: 'candidate__actions' },
      saved ? h('span', { class: 'badge badge--offline', text: 'en tu biblioteca' }) : null,
      playBtn,
      h(
        'button',
        {
          class: 'icon-btn icon-btn--tiny',
          type: 'button',
          ariaLabel: 'Agregar a la cola',
          on: {
            click: async () => {
              const track = saved ?? (await saveCandidate(candidate));
              await addToQueue(track);
              toast({ message: `"${track.title}" agregada a la cola` });
            },
          },
        },
        icon('queue', 18),
      ),
      h(
        'button',
        {
          class: 'icon-btn icon-btn--tiny',
          type: 'button',
          ariaLabel: 'Agregar a una playlist',
          on: {
            click: async () => {
              const track = saved ?? (await saveCandidate(candidate));
              await addToPlaylistFlow([track]);
            },
          },
        },
        icon('plus', 18),
      ),
      candidate.homeUrl
        ? h(
            'a',
            { class: 'icon-btn icon-btn--tiny', href: candidate.homeUrl, target: '_blank', rel: 'noreferrer noopener', ariaLabel: 'Ver origen' },
            icon('external', 18),
          )
        : null,
    ),
  );
}

async function runSearch(term: string): Promise<void> {
  typed = term;
  if (term.length < 2) {
    setSearch({ status: 'idle', term, results: [], error: null, sources: {} });
    return;
  }
  if (term === lastTerm && getState().search.status === 'ready') return;
  lastTerm = term;

  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  const runId = getState().search.runId + 1;

  setSearch({ term, status: 'loading', results: [], error: null, sources: {}, runId });

  try {
    const { results, errors } = await searchAllSources(term, 16, signal, (id, status, message) => {
      if (getState().search.runId !== runId) return;
      if (status === 'error') setSearch({ sources: { ...getState().search.sources, [id]: message ?? null } });
    });
    if (getState().search.runId !== runId) return;
    setSearch({
      status: 'ready',
      results,
      error: errors.length > 0 && results.length === 0 ? errors.map((e) => e.message).join(' · ') : null,
    });
  } catch (err) {
    if (isAbortError(err)) return;
    if (getState().search.runId !== runId) return;
    setSearch({ status: 'error', error: errorMessage(err) });
  }
}
