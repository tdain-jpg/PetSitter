/*
 * Pawstructions service worker.
 *
 * Strategy:
 *   - Non-GET and cross-origin requests (Supabase, analytics, anything not
 *     ours) are NEVER intercepted — the browser handles them untouched.
 *   - Navigations: network-first, falling back to the cached app shell ('/')
 *     when offline. The SPA serves the same shell for every route, so '/' is
 *     a valid fallback for any navigation.
 *   - Same-origin static assets (scripts/styles/images/fonts): cache-first
 *     with a background revalidate. Expo emits content-hashed bundle names,
 *     so a stale hit can only ever be a byte-identical file.
 *
 * Bump VERSION to invalidate all caches on the next deploy's activate.
 */

const VERSION = 'v1';
const CACHE_NAME = `pawstructions-${VERSION}`;
const PRECACHE_URLS = ['/', '/site.webmanifest'];

// request.destination values treated as static assets.
const STATIC_DESTINATIONS = ['script', 'style', 'image', 'font'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // (a) Ignore non-GET requests and anything cross-origin. Returning without
  // calling respondWith() hands the request straight to the network —
  // Supabase auth/data calls must never pass through this worker.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // (b) Navigations: network-first with offline fallback to the app shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Keep the offline shell fresh whenever a navigation succeeds —
          // but only for OK responses, so a 404/500 (bad deploy, hosting
          // incident) can never poison the cached app shell.
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put('/', copy))
                .catch(() => {})
            );
          }
          return response;
        })
        .catch(() =>
          caches.match('/').then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // (c) Static assets: cache-first, revalidate in the background.
  // The manifest is precached at install but has destination 'manifest',
  // so without this it would never be served from cache (offline installs
  // and revisits would miss it).
  const isManifest = new URL(request.url).pathname === '/site.webmanifest';
  if (isManifest || STATIC_DESTINATIONS.includes(request.destination)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            if (response && response.ok) {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          });

          if (cached) {
            // Serve the cached copy immediately; refresh quietly for next time.
            event.waitUntil(networkFetch.catch(() => {}));
            return cached;
          }
          return networkFetch;
        })
      )
    );
  }
  // Everything else same-origin (e.g. the manifest fetched as a resource,
  // JSON) falls through to the network untouched.
});
