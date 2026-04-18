/**
 * ArenaIQ Service Worker
 *
 * Caches the platform shell and static assets for offline access.
 * Uses a cache-first strategy for versioned static files and a
 * network-first strategy for navigations, so the latest HTML is always
 * fetched when online but the app still loads when offline.
 */

const CACHE_NAME = 'arenaiq-v1';

/** Static assets to pre-cache on install. */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/fan.html',
  '/styles.css',
  '/script.js',
  '/js/main.js',
  '/js/fan.js',
  '/js/config.js',
  '/js/crowd-monitor.js',
  '/js/queue-predictor.js',
  '/js/notifications.js',
  '/js/dashboard.js',
  '/js/simulated-venue-map.js',
  '/js/venue-map.js',
  '/js/accessibility.js',
  '/js/theme.js',
];

// ── Install: pre-cache shell assets ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)),
  );
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();
});

// ── Activate: remove stale caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// ── Fetch: network-first for navigations, cache-first for assets ──────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network-first: always try to serve fresh HTML
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html'))),
    );
  } else {
    // Cache-first for JS / CSS / images
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
  }
});
