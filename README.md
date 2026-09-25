# Sonora

**Un reproductor de musica con la misma vibra que los grandes: tu biblioteca, tus playlists, sin un solo anuncio y con modo sin internet.**

Sonora es una PWA instalable. Lee la musica que ya tenes en tu disco, la organiza
con los tags que ya trae, te deja armar playlists, y ademas busca temas en
repositorios de musica libre. Todo queda en tu dispositivo: no hay cuentas, no
hay telemetria y no hay publicidad.

---

## Que hace

- **Tu carpeta de musica.** Escanea MP3, FLAC, OGG, M4A, WAV, AAC y mas. Lee
  artista, album, ano, genero, duracion y caratula embebida de cada archivo.
- **Playlists.** Crea, renombra, reordena arrastrando, duplica y borra. Mas la
  lista de "Me gusta" y vistas por artista y por album.
- **Sin internet.** Descarga las pistas que quieras y quedan disponibles sin
  conexion. Los archivos locales siempre funcionan offline.
- **Sin anuncios.** No hay ningun anunciante, ni propio ni de terceros.
- **Buscador de musica libre.** Internet Archive, Openverse y Wikimedia
  Commons, con la licencia y el enlace al original de cada tema.
- **Instalamable.** Se agrega a la pantalla de inicio y corre como app de
  escritorio o celular, con icono propio y pantalla de bloqueo integrada.
- ** reproductor serio:** aleatorio, repetir (off / todo / una), crossfade real
  entre pistas, visualizador de espectro, cola, atajos de teclado y controles del
  sistema operativo.

## Que NO hace

No descarga musica de Spotify, Apple Music ni ningun servicio comercial. Eso
implicaria saltar DRM y es ilegal. Lo que si hace es darte un reproductor
completo para el material que ya tenes y para musica de dominio publico o con
licencia libre.

## Requisitos

- **Navegador:** Chrome, Edge u Opera (desktop o Android). Son la familia con
  File System Access API, que es la que permite leer tu carpeta directamente.
- **Safari y Firefox** funcionan, pero no pueden leer una carpeta completa: ahi
  usas la opcion de importar archivos, que se resuelve solo para la sesion
  actual. Para uso sin internet en esos navegadores, descarga las pistas desde
  la lista de descargas.
- **Node 20.19+** solo si querés desarrollar.

## Instalar y usar

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm run build      # build de produccion en dist/
npm run preview    # servir el build
npm run verify     # typecheck + build + prueba de humo
```

Despues de `npm run build`, la carpeta `dist/` es un sitio estatico: se puede
subir a GitHub Pages, Netlify, Cloudflare Pages o servirlo con cualquier
servidor. Para HTTPS hace falta un servidor propio: el navegador no permite
leer carpetas locales desde `file://` ni desde HTTP sin cifrar.

## Como se usa

1. **Tu biblioteca** -> *Agregar carpeta*. Elegis la carpeta de musica y el
   navegador te pide permiso de lectura **una vez**. Despues podes rescanearla
   para detectar temas nuevos.
2. Buscar en tu disco, o ir a **Buscar** y traer musica libre de las tres fuentes.
3. El boton de **descargar** guarda la pista en el dispositivo para que suene sin
   internet. La seccion **Descargas** muestra cuanto ocupas.
4. En **Ajustes** se instala la app, se ajusta el crossfade y se ve el espacio usado.

### Atajos de teclado

| Tecla | Accion |
| --- | --- |
| `Espacio` | Reproducir o pausar |
| `←` / `→` | Atrassar o avanzar 5 segundos |
| `Shift` + `←` / `→` | Pista anterior o siguiente |
| `↑` / `↓` | Volumen |
| `M` | Silenciar |
| `S` | Aleatorio |
| `R` | Cambiar repetir |
| `/` | Ir al buscador |

## Como funciona por dentro

```
src/
  lib/          base de datos IndexedDB, tipos, utilidades
  state/        store reactivo + acciones (playlists, biblioteca)
  audio/        motor de reproduccion, crossfade, visualizador
  library/      permisos de carpeta, escaneo, metadatos y caratulas
  sources/      adaptadores de Internet Archive, Openverse y Commons
  download/     descargas offline en IndexedDB
  ui/           shell, vistas y componentes
  sw.ts         service worker (shell offline + cache de audio)
  types/        declaraciones de la File System Access API
```

Decisiones que vale la pena conocer:

- **El service worker se escribe a mano** (`src/sw.ts`) en vez de generarse con
  la configuracion por defecto de Workbox. Asi el cache de audio y el
  soporte de `Range` para poder avanzar en pistas remotas quedan bajo control.
- **Los handle de carpeta se guardan en IndexedDB**, no el audio. Por eso
  escanear 5.000 temas no duplica 5.000 archivos: la app sigue leyendo del disco.
- **Las descargas offline si son Blobs en IndexedDB**, con barra de progreso y
  gestion de cuota. Es lo unico que garantiza que suene sin conexion.
- **El progreso de reproduccion vive fuera del store** (`src/audio/playback.ts`)
  para no repintar las vistas enteras cuatro veces por segundo.

### Privacidad

- No hay backend. No hay cuentas ni sincronizacion.
- No se envia ninguna telemetria. Cero requests de analitica.
- Las unicas peticiones de red son a las APIs de musica libre, cuando usas el
  buscador, y al descargar una pista remota.
- Borrar todo desde **Ajustes** deja la app como recien instalada.

## Scripts

| Comando | Que hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck + build de produccion |
| `npm run preview` | Sirve el build en local |
| `npm run typecheck` | Solo TypeScript |
| `npm run icons` | Regenera los iconos PNG de la PWA |
| `npm run smoke` | Build + pruebas de humo (ver abajo) |
| `npm run verify` | Todo junto, es lo que corre la CI |

`npm run smoke` levanta el build con `vite preview` y verifica que el sitio
responda, que el service worker se genere sin rutas rotas, que el manifest sea
instalable y que las tres APIs de musica libre sigan contestando con los campos
que el código espera. Es lo que atrapa cambios del otro lado.

## Licencia

MIT. El codigo es tuyo. Ver [LICENSE](./LICENSE) para el aviso sobre contenido
musical con derechos.
