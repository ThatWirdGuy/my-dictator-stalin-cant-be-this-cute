/*
 * Fixed Service Worker for "My Dictator Stalin Can't Be This Cute"
 * Manually corrected to remove Godot export placeholders.
 */

const CACHE_VERSION = '1.0.0';
const CACHE_PREFIX = 'stalin-game-sw-cache-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const OFFLINE_URL = 'index.offline.html';
const ENSURE_CROSSORIGIN_ISOLATION_HEADERS = true;

// Define the core files needed to run the game
const CACHED_FILES = [
	'index.html',
	'index.js',
	'index.pck',
	'index.wasm',
	'index.png',
	'index.service.worker.js'
];

const CACHABLE_FILES = [];
const FULL_CACHE = CACHED_FILES.concat(CACHABLE_FILES);

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHED_FILES)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(caches.keys().then(
		function (keys) {
			return Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
		}
	).then(function () {
		return ('navigationPreload' in self.registration) ? self.registration.navigationPreload.enable() : Promise.resolve();
	}));
});

function ensureCrossOriginIsolationHeaders(response) {
	if (response.headers.get('Cross-Origin-Embedder-Policy') === 'require-corp'
		&& response.headers.get('Cross-Origin-Opener-Policy') === 'same-origin') {
		return response;
	}

	const crossOriginIsolatedHeaders = new Headers(response.headers);
	crossOriginIsolatedHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
	crossOriginIsolatedHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
	
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: crossOriginIsolatedHeaders,
	});
}

async function fetchAndCache(event, cache, isCacheable) {
	let response = await event.preloadResponse;
	if (response == null) {
		response = await self.fetch(event.request);
	}

	if (ENSURE_CROSSORIGIN_ISOLATION_HEADERS) {
		response = ensureCrossOriginIsolationHeaders(response);
	}

	if (isCacheable) {
		cache.put(event.request, response.clone());
	}

	return response;
}

self.addEventListener('fetch', (event) => {
	const isNavigate = event.request.mode === 'navigate';
	const url = event.request.url || '';
	const referrer = event.request.referrer || '';
	const base = referrer.slice(0, referrer.lastIndexOf('/') + 1);
	const local = url.startsWith(base) ? url.replace(base, '') : '';
	const isCachable = FULL_CACHE.some((v) => v === local);

	if (isNavigate || isCachable) {
		event.respondWith((async () => {
			const cache = await caches.open(CACHE_NAME);
			if (isNavigate) {
				const fullCache = await Promise.all(FULL_CACHE.map((name) => cache.match(name)));
				const missing = fullCache.some((v) => v === undefined);
				if (missing) {
					try {
						return await fetchAndCache(event, cache, isCachable);
					} catch (e) {
						return caches.match(OFFLINE_URL);
					}
				}
			}
			let cached = await cache.match(event.request);
			if (cached != null) {
				if (ENSURE_CROSSORIGIN_ISOLATION_HEADERS) {
					cached = ensureCrossOriginIsolationHeaders(cached);
				}
				return cached;
			}
			return await fetchAndCache(event, cache, isCachable);
		})());
	} else if (ENSURE_CROSSORIGIN_ISOLATION_HEADERS) {
		event.respondWith((async () => {
			let response = await fetch(event.request);
			return ensureCrossOriginIsolationHeaders(response);
		})());
	}
});

self.addEventListener('message', (event) => {
	if (event.origin !== self.origin) return;
	const id = event.source.id || '';
	const msg = event.data || '';
	self.clients.get(id).then(function (client) {
		if (!client) return;
		if (msg === 'claim') {
			self.skipWaiting().then(() => self.clients.claim());
		} else if (msg === 'clear') {
			caches.delete(CACHE_NAME);
		} else if (msg === 'update') {
			self.skipWaiting().then(() => self.clients.claim()).then(() => self.clients.matchAll()).then((all) => all.forEach((c) => c.navigate(c.url)));
		}
	});
});
