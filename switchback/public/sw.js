/*
 * Switchback service worker.
 *
 * This app is played standing in a queue, in a building full of concrete, on a
 * phone with one bar and 20% battery. There is no backend and the leaderboard
 * is local, so *every* byte the app needs can live in the cache — offline is
 * the normal case here, not the fallback.
 *
 * Strategy:
 *   - Non-GET and cross-origin requests are never intercepted.
 *   - Navigations: cache-first against the app shell ('/'), refreshed in the
 *     background. A cold queue with no signal still opens the game instantly;
 *     the next visit picks up whatever the refresh fetched.
 *   - Same-origin static assets: cache-first with background revalidate. Expo
 *     emits content-hashed bundle names, so a stale hit is byte-identical.
 *
 * Bump VERSION to invalidate all caches on the next deploy's activate.
 */

const VERSION = 'v1';
const CACHE_NAME = `switchback-${VERSION}`;
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
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // (a) Navigations: serve the cached shell straight away, refresh behind it.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match('/').then((cached) => {
          const networkFetch = fetch(request)
            .then((response) => {
              // Only an OK response may replace the shell — a 404 or 502 from
              // a bad deploy must not poison the offline copy.
              if (response.ok) cache.put('/', response.clone()).catch(() => {});
              return response;
            });

          if (cached) {
            event.waitUntil(networkFetch.catch(() => {}));
            return cached;
          }
          return networkFetch.catch(() => Response.error());
        })
      )
    );
    return;
  }

  // (b) Static assets: cache-first, revalidate in the background. The manifest
  // is precached but has destination 'manifest', so it needs naming directly.
  const isManifest = url.pathname === '/site.webmanifest';
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
            event.waitUntil(networkFetch.catch(() => {}));
            return cached;
          }
          return networkFetch;
        })
      )
    );
  }
  // Anything else same-origin falls through to the network untouched.
});
