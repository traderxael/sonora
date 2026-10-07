import { h } from '../dom';
import { icon } from '../icons';
import { formatBytes } from '../../lib/utils';

let typedUrl = '';
let activeController: AbortController | null = null;

const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024;
const AUDIO_EXTENSIONS = /\.(mp3|flac|wav|ogg|oga|opus|m4a|aac|aif|aiff|webm)$/i;

export function renderDownloads(): HTMLElement {
  const view = h('div', { class: 'view view--downloads' });
  const urlInput = h('input', {
    class: 'url-download__input',
    id: 'download-url-input',
    type: 'url',
    inputMode: 'url',
    required: true,
    autocomplete: 'url',
    placeholder: 'https://sitio.com/mi-cancion.mp3',
    value: typedUrl,
    ariaLabel: 'URL directa del archivo de audio',
  }) as HTMLInputElement;
  const submitButton = h(
    'button',
    { class: 'btn btn--primary url-download__submit', type: 'submit' },
    icon('download', 18),
    'Descargar archivo',
  );
  const status = h('p', {
    class: 'url-download__status',
    role: 'status',
    ariaLive: 'polite',
    text: 'El archivo se guardará en las descargas de tu navegador.',
  });
  const progress = h('progress', {
    class: 'url-download__progress',
    max: 100,
    value: 0,
    hidden: true,
    ariaLabel: 'Progreso de descarga',
  }) as HTMLProgressElement;
  const sourceLink = h(
    'a',
    {
      class: 'url-download__source',
      href: '#',
      target: '_blank',
      rel: 'noreferrer noopener',
      hidden: true,
    },
    icon('external', 16),
    'Abrir enlace original',
  ) as HTMLAnchorElement;

  const form = h(
    'form',
    {
      class: 'url-download__form',
      on: {
        submit: (event: Event) => {
          event.preventDefault();
          void downloadUrl();
        },
      },
    },
    h(
      'label',
      { class: 'url-download__field' },
      h('span', { class: 'url-download__label', text: 'Enlace directo al archivo de audio' }),
      urlInput,
    ),
    submitButton,
  );

  urlInput.addEventListener('input', () => {
    typedUrl = urlInput.value;
    const url = parseHttpUrl(typedUrl);
    sourceLink.hidden = !url;
    if (url) sourceLink.href = url.href;
  });

  async function downloadUrl(): Promise<void> {
    const url = parseHttpUrl(urlInput.value);
    if (!url) {
      status.textContent = 'Pega una URL válida que empiece por https:// o http://.';
      urlInput.focus();
      return;
    }
    if (activeController) return;

    const controller = new AbortController();
    activeController = controller;
    submitButton.disabled = true;
    submitButton.replaceChildren(icon('download', 18), document.createTextNode('Conectando…'));
    progress.hidden = true;
    status.textContent = 'Conectando con la fuente…';

    try {
      const response = await fetch(url.href, {
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
      });
      if (!response.ok) throw new Error(`La fuente respondió con el código ${response.status}.`);

      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const looksLikeAudio =
        contentType.startsWith('audio/') ||
        /octet-stream|application\/(ogg|flac|x-flac|mpeg)/i.test(contentType) ||
        AUDIO_EXTENSIONS.test(url.pathname);
      if (!looksLikeAudio || /text\/html|application\/json/i.test(contentType)) {
        throw new Error('Ese enlace no apunta a un archivo de audio directo. Usa un enlace MP3, FLAC, WAV, OGG, M4A o similar.');
      }

      const total = Number(response.headers.get('content-length') ?? 0);
      if (total > MAX_DOWNLOAD_BYTES) {
        throw new Error('El archivo supera el límite de 250 MB para una descarga desde Sonora.');
      }

      const chunks: Uint8Array[] = [];
      let received = 0;
      const reader = response.body?.getReader();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          received += value.byteLength;
          if (received > MAX_DOWNLOAD_BYTES) {
            await reader.cancel();
            throw new Error('El archivo supera el límite de 250 MB para una descarga desde Sonora.');
          }
          chunks.push(value);
          if (total > 0) {
            progress.hidden = false;
            progress.value = Math.min(100, (received / total) * 100);
            progress.setAttribute('aria-valuenow', String(Math.floor(progress.value)));
            status.textContent = `Descargando ${formatBytes(received)} de ${formatBytes(total)}…`;
          } else {
            status.textContent = `Descargando ${formatBytes(received)}…`;
          }
          submitButton.replaceChildren(icon('download', 18), document.createTextNode('Descargando…'));
        }
      } else {
        const blob = await response.blob();
        if (blob.size > MAX_DOWNLOAD_BYTES) {
          throw new Error('El archivo supera el límite de 250 MB para una descarga desde Sonora.');
        }
        chunks.push(new Uint8Array(await blob.arrayBuffer()));
      }

      const blob = new Blob(chunks, { type: contentType || 'application/octet-stream' });
      if (blob.size === 0) throw new Error('El archivo recibido está vacío.');
      const filename = buildFilename(response.headers.get('content-disposition'), url, contentType);
      saveBlob(blob, filename);
      progress.hidden = true;
      status.textContent = `Descarga iniciada: ${filename}`;
    } catch (error) {
      progress.hidden = true;
      if (controller.signal.aborted) {
        status.textContent = 'Descarga cancelada.';
      } else if (error instanceof TypeError) {
        status.textContent = 'La fuente bloqueó la descarga desde Sonora (CORS). Abre el enlace original y descarga desde su sitio.';
      } else {
        status.textContent = error instanceof Error ? error.message : 'No se pudo descargar este archivo.';
      }
    } finally {
      if (activeController === controller) activeController = null;
      submitButton.disabled = false;
      submitButton.replaceChildren(icon('download', 18), document.createTextNode('Descargar archivo'));
    }
  }

  view.append(
    h(
      'section',
      { class: 'url-download__hero' },
      h('span', { class: 'url-download__eyebrow' }, icon('download', 16), 'Descargas por enlace'),
      h('h1', { class: 'url-download__title', text: 'Tu música, desde su URL.' }),
      h('p', {
        class: 'url-download__intro',
        text: 'Pega el enlace directo de un archivo de audio para guardarlo en tu dispositivo. Funciona con MP3, FLAC, WAV, OGG, M4A y formatos similares.',
      }),
    ),
    h(
      'section',
      { class: 'panel url-download__panel' },
      form,
      status,
      progress,
      sourceLink,
    ),
    h(
      'section',
      { class: 'panel url-download__note' },
      h('h2', { class: 'panel__title' }, icon('info', 19), 'Qué enlaces funcionan'),
      h('p', {
        class: 'panel__text',
        text: 'Usa la URL directa del archivo de audio y asegúrate de tener permiso para descargarlo. Sonora no extrae música desde páginas de YouTube, Spotify ni otros servicios de streaming.',
      }),
      h(
        'div',
        { class: 'url-download__limits' },
        h(
          'div',
          { class: 'url-download__limit' },
          icon('check', 17),
          h('span', { text: 'El archivo se descarga en la carpeta configurada en tu navegador; el límite por archivo es 250 MB.' }),
        ),
        h(
          'div',
          { class: 'url-download__limit' },
          icon('external', 17),
          h('span', { text: 'Si el sitio bloquea la descarga externa, abre el enlace original y descárgalo desde la fuente.' }),
        ),
      ),
    ),
  );

  return view;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function buildFilename(disposition: string | null, url: URL, contentType: string): string {
  const encodedName = disposition?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  const regularName = disposition?.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  let name = encodedName
    ? decodeURIComponent(encodedName.trim().replace(/^"|"$/g, ''))
    : regularName?.[1] ?? regularName?.[2]?.trim() ?? '';
  if (!name) {
    const pathName = url.pathname.split('/').filter(Boolean).pop() ?? '';
    try {
      name = decodeURIComponent(pathName);
    } catch {
      name = pathName;
    }
  }
  if (!name || name.endsWith('/')) name = 'sonora-audio';
  name = name.replace(/[<>:"\/\\|?*\u0000-\u001F]/g, '-').replace(/[. ]+$/g, '').trim();
  if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
    const extension = contentType.includes('mpeg') ? 'mp3' : contentType.includes('ogg') ? 'ogg' : 'audio';
    name += `.${extension}`;
  }
  return name || 'sonora-audio.audio';
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
