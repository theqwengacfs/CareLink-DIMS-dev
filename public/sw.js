/* CareLink application-shell offline support. Clinical/API responses are never cached. */
const CACHE = 'carelink-shell-v2';
const SCOPE_URL = new URL(self.registration.scope);
const APP_URL = new URL('carelink-v6.html', SCOPE_URL).href;
const SHELL_URLS = [
  new URL('.', SCOPE_URL).href,
  APP_URL,
  new URL('manifest.webmanifest', SCOPE_URL).href,
  new URL('icons/carelink-192.png', SCOPE_URL).href,
  new URL('icons/carelink-512.png', SCOPE_URL).href,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of SHELL_URLS) {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok && response.type !== 'opaque') await cache.put(url, response);
      } catch (_) { /* allow installation when a host omits the optional root redirect */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('carelink-shell-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  /* Never cache API payloads, credentials, auth/session requests, or patient data. */
  if (url.pathname.includes('/api/') || request.headers.has('authorization') || request.headers.has('x-carelink-session')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const live = await fetch(request);
        if (live.ok && url.href === APP_URL) {
          const cache = await caches.open(CACHE);
          await cache.put(APP_URL, live.clone());
        }
        return live;
      } catch (_) {
        return (await caches.match(APP_URL)) || new Response('CareLink is not available offline yet. Open the app once while online to install its application shell.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }
  if (SHELL_URLS.includes(url.href)) {
    event.respondWith((async () => (await caches.match(url.href)) || fetch(request))());
  }
});
