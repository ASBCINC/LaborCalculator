// ASBC Labor Calculator service worker (v10.9.8): offline-ready, network-first.
const CACHE_NAME = 'asbc-tools-next-v10.9.8';
const CORE_ASSETS = [
  './',
  './index.html',
  './log.html',
  './pricing.js',
  './leaderboard-core.js',
  './leaderboard.html',
  './jobs.html',
  './signoff.html',
  './calendar.html',
  './pipeline.html',
  './home.html',
  './users.html',
  './roles.js',
  './tailwind.css',
  './dtools-schedule.js',
  './nav.js',
  './health.js',
  './ramp.js',
  './expenses.html',
  './update-check.js',
  './tools.css',
  './sidebar.js',
  './diag.js',
  './manifest.json',
  './labor-catalog.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon.svg',
  './bo-california-logo.png',
  './asbc-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname === 'firestore.googleapis.com' || url.hostname === 'script.google.com' || url.hostname.endsWith('.workers.dev')) return;  // v10.6.0 job photos stay out of the offline cache

  event.respondWith(
    // v8.25.0: same-origin files always ask GitHub "has this changed?" so a push reaches phones right away (no 10-minute cache)
    (url.origin === self.location.origin ? fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(request))
      .then((response) => {
        // v8.18.0: also keep the Firebase library (www.gstatic.com) so the Jobs page opens with no signal
        if (response && ((response.ok && url.origin === self.location.origin) || url.hostname === 'www.gstatic.com')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')))
  );
});
