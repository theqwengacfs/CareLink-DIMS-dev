/* CareLink application-shell offline support. Clinical/API responses are never cached. */
const CACHE = 'carelink-shell-v7';
const RETIRED_PAGES = self.location.hostname === 'theqwengacfs.github.io';
const CANONICAL_ORIGIN = 'https://care-link-dims-dev-three.vercel.app/';
/* A navigation that the network has not answered within this window falls back
   to the cached shell. A captive portal or a stalled 3G link otherwise leaves a
   caregiver looking at a blank screen in front of a patient. */
const NAV_TIMEOUT_MS = 6000;
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
    if (RETIRED_PAGES) { await self.skipWaiting(); return; }
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

/* The page asks for this when it offers "Reload" for a new build. */
self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'CARELINK_SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('carelink-shell-') && (RETIRED_PAGES || key !== CACHE)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (RETIRED_PAGES) {
    if (request.mode === 'navigate') event.respondWith(Response.redirect(CANONICAL_ORIGIN, 302));
    return; // never serve a cached commissioning shell on the retired host
  }
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  /* Never cache API payloads, credentials, auth/session requests, or patient data. */
  if (url.pathname.includes('/api/') || request.headers.has('authorization') || request.headers.has('x-carelink-session')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cachedShell = () => caches.match(APP_URL);
      try {
        /* Race the network against a timer so a silent link cannot hang the app. */
        let timer = null;
        const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), NAV_TIMEOUT_MS); });
        let live = null;
        try { live = await Promise.race([fetch(request), timeout]); } finally { if (timer) clearTimeout(timer); }
        if (live && live.ok) {
          if (url.href === APP_URL) {
            const cache = await caches.open(CACHE);
            await cache.put(APP_URL, live.clone());
          }
          return live;
        }
        const shell = await cachedShell();
        if (shell) return shell;
        if (live) return live;
      } catch (_) { /* fall through to the cached shell */ }
      return (await cachedShell()) || new Response('CareLink is not available offline yet. Open the app once while online to install its application shell.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })());
    return;
  }
  if (SHELL_URLS.includes(url.href)) {
    event.respondWith((async () => (await caches.match(url.href)) || fetch(request))());
  }
});
