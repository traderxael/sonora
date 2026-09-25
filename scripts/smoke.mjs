// Verificacion de humo: levanta el build y comprueba que la app se sirve bien,
// y de paso valida contra las APIs reales que los adaptadores lean los campos correctos.
import { preview } from 'vite';

const PORT = 4180;
let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  const line = `${condition ? 'OK   ' : 'FALLA'} ${label}${detail ? `  [${detail}]` : ''}`;
  if (condition) passed++;
  else failures.push(line);
  console.log(`  ${line}`);
}

async function withRetry(label, fn, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) {
        check(`${label}: accesible`, false, err.message);
        return null;
      }
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
  return null;
}

async function httpChecks(base) {
  const index = await fetch(`${base}/`);
  const html = await index.text();
  check('GET / responde 200', index.status === 200, `status ${index.status}`);
  check('el HTML monta #app', html.includes('id="app"'));
  check('el HTML carga un bundle de la app', /<script[^>]+src="[^"]*assets\/index-[^"]+\.js"/.test(html));

  const assetMatch = html.match(/src="([^"]*assets\/index-[^"]+\.js)"/);
  if (assetMatch) {
    const asset = await fetch(`${base}/${assetMatch[1].replace(/^\.\//, '')}`);
    const body = await asset.text();
    check('el bundle principal se sirve', asset.status === 200, `${(body.length / 1024).toFixed(0)} kB`);
    check('el bundle no importa node_modules', !/["'`][^"'`]*node_modules\//.test(body));
  } else {
    check('el HTML referencia el script principal', false);
  }

  const sw = await fetch(`${base}/sw.js`);
  const swBody = await sw.text();
  check('GET /sw.js responde 200', sw.status === 200);
  // El service worker va minificado: se comprueba su efecto, no los nombres de las funciones.
  check('el service worker precachea el shell', /index\.html/.test(swBody) && /revision/.test(swBody));
  check('el service worker cachea audio', swBody.includes('sonora-audio-v1'));
  check('el service worker acepta respuestas parciales (Range)', /206/.test(swBody));
  check('el service worker no tiene rutas a node_modules', !swBody.includes('node_modules'));

  const manifestRes = await fetch(`${base}/manifest.webmanifest`);
  const manifest = await manifestRes.json();
  check('el manifest es JSON valido', manifestRes.status === 200 && !!manifest.name, manifest.name);
  check(
    'el manifest trae iconos 192 y 512',
    manifest.icons?.some((i) => i.sizes === '192x192') && manifest.icons?.some((i) => i.sizes === '512x512'),
  );
  check('el manifest trae icono maskable', manifest.icons?.some((i) => i.purpose === 'maskable'));
  check('el manifest es instalable (standalone)', manifest.display === 'standalone');

  const icon = await fetch(`${base}/icons/icon-512.png`);
  check('el icono 512 se sirve', icon.status === 200, `${(Number(icon.headers.get('content-length')) / 1024).toFixed(0)} kB`);

  const deep = await fetch(`${base}/manifest.webmanifest`, { headers: { Accept: 'application/json' } });
  check('el manifest se puede pedir desde otro origen (CORS)', deep.status === 200);
}

async function internetArchiveCheck() {
  const fl = ['identifier', 'title', 'creator', 'downloads'];
  const params = new URLSearchParams({ q: 'mediatype:(audio) AND piano', rows: '3', page: '1', sort: 'downloads desc', output: 'json' });
  for (const f of fl) params.append('fl[]', f);

  const json = await withRetry('Internet Archive', () => fetch(`https://archive.org/advancedsearch.php?${params}`).then((r) => r.json()));
  if (!json) return;
  const docs = json.response?.docs ?? [];
  check('Internet Archive devuelve resultados', docs.length > 0, `${docs.length} items`);
  check('Internet Archive trae identifier y title', docs.every((d) => d.identifier && d.title !== undefined));

  const identifier = docs[0]?.identifier;
  if (!identifier) return;
  const meta = await withRetry('detalle de Internet Archive', () =>
    fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`).then((r) => r.json()),
  );
  if (!meta) return;
  const audioFiles = (meta.files ?? []).filter((f) => /\.(mp3|ogg|m4a|flac|wav|aac|opus)$/i.test(f.name));
  check('el item tiene audio reproducible', audioFiles.length > 0, `${audioFiles.length} archivos`);

  const file = audioFiles[0];
  if (!file) return;
  const head = await withRetry('audio de Internet Archive', () =>
    fetch(`https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`, { method: 'HEAD' }),
  );
  if (head) {
    check('el audio responde 200', head.status === 200, `status ${head.status}`);
    check('el servidor de audio acepta Range', head.headers.get('accept-ranges') === 'bytes');
  }
}

async function openverseCheck() {
  const json = await withRetry('Openverse', () =>
    fetch('https://api.openverse.org/v1/audio/?q=piano&page_size=3', { headers: { Accept: 'application/json' } }).then((r) => r.json()),
  );
  if (!json) return;
  const results = json.results ?? [];
  check('Openverse devuelve resultados', results.length > 0, `${results.length} items`);
  check('Openverse trae url, license y creator', results.every((r) => r.url && r.license !== undefined && r.creator !== undefined));

  const audio = await withRetry('audio de Openverse', () => fetch(results[0].url, { method: 'HEAD' }));
  if (audio) check('el audio de Openverse es accesible', audio.status < 400, `status ${audio.status}`);
}

async function commonsCheck() {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: 'filetype:audio piano',
    gsrnamespace: '6',
    gsrlimit: '3',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|mediatype|metadata|extmetadata',
  });
  const json = await withRetry('Wikimedia Commons', () => fetch(`https://commons.wikimedia.org/w/api.php?${params}`).then((r) => r.json()));
  if (!json) return;
  const pages = Object.values(json.query?.pages ?? {});
  check('Wikimedia devuelve resultados', pages.length > 0, `${pages.length} archivos`);

  // Ojo: la API devuelve la URL con ?utm_source=... y la extension va antes del query.
  const usable = pages.filter((p) => p.imageinfo?.[0]?.url && /\.(ogg|oga|mp3|wav|flac|opus|m4a)$/i.test(p.imageinfo[0].url.split('?')[0]));
  check('hay audio con extension reproducible', usable.length > 0, `${usable.length} de ${pages.length}`);

  const url = usable[0]?.imageinfo?.[0]?.url.split('?')[0];
  if (url) {
    const head = await withRetry('audio de Commons', () => fetch(url, { method: 'HEAD' }));
    if (head) check('el audio de Commons se puede cargar', head.status === 200, `status ${head.status}`);
  }
}

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'error' });
const base = `http://localhost:${server.config.preview.port}`;

try {
  console.log('\n== Build servido por vite preview ==');
  await httpChecks(base);
  console.log('\n== Fuentes de musica libre ==');
  await internetArchiveCheck();
  await openverseCheck();
  await commonsCheck();
} catch (err) {
  failures.push(`FALLA error inesperado: ${err.message}`);
  console.error(err);
} finally {
  await server.close();
}

console.log('');
if (failures.length > 0) {
  console.log(failures.join('\n'));
  console.log(`\n${failures.length} fallo(s) de ${passed + failures.length} comprobaciones`);
  process.exit(1);
}
console.log(`Todo OK: ${passed} comprobaciones`);
