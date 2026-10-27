/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />
/**
 * Service worker (9.1): precache de la carcasa (JS, CSS, fuentes, iconos) por versión.
 * Las páginas y los datos llevan sesión: van siempre a la red y nunca se guardan en caché;
 * sin red se muestra `offline.html`. La cola de escaneos sin cobertura (IndexedDB) se reenvía
 * con Background Sync donde existe; en el resto, desde la página al recuperar la red.
 */
import { build, files, version } from '$service-worker';
import { flush, SYNC_TAG } from '$lib/offline/queue';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `carcasa-${version}`;
const SHELL = [...build, ...files.filter((f) => !f.endsWith('.webmanifest'))];
const OFFLINE = '/offline.html';

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

/** La página pide activar la versión nueva cuando la persona pulsa «Actualizar». */
sw.addEventListener('message', (event) => {
	if (event.data === 'activar') sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin || url.pathname.startsWith('/api/')) return;

	// Estáticos con hash o de /static: de la caché de la carcasa.
	if (SHELL.includes(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(request)));
		return;
	}

	// Navegaciones: siempre red; sin conexión, la página de aviso (sin datos de nadie).
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error())
		);
	}
});

/** Background Sync: el navegador avisa cuando vuelve la red y se reenvía la cola de kits. */
sw.addEventListener('sync', (event) => {
	const e = event as Event & { tag: string; waitUntil(p: Promise<unknown>): void };
	if (e.tag === SYNC_TAG) e.waitUntil(flush());
});
