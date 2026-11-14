const CACHE = 'paseka-shell-v320';
const CACHE_PREFIX = 'paseka-shell-';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/paseka.svg',
  './js/voice-command-parser.js',
  './js/voice-session.js',
  './js/hive-model.js',
  './js/equipment-labels.js',
  './js/equipment-bodies.js',
  './js/equipment-inventory.js',
  './js/equipment-reconciliation.js',
  './js/equipment-reconciliation-voice.js',
  './js/entrance-analysis.js',
  './js/varroa-monitor.js',
  './js/pesticide-incident.js',
  './js/season-planning.js',
  './js/deadout-review.js',
  './js/paseka-archive.js',
  './js/paseka-archive-restore.js',
  './js/paseka-auto-snapshots.js',
  './js/paseka-media-store.js',
  './js/paseka-media-renderer.js',
  './js/paseka-media-migration.js',
  './js/paseka-media-migration-engine.js',
  './js/paseka-media-migration-verifier.js',
  './js/paseka-media-reference-switch.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const isNavigation = request.mode === 'navigate' ||
    new URL(request.url).pathname.endsWith('/index.html');

  if (isNavigation) {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() =>
        caches.match(request).then(cached =>
          cached || caches.match('./index.html')
        )
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});
