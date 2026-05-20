const VERSION = '1.1.7';
const CACHE_NAME = `horsie-picker-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'horsie-app.js',
  'manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => {
        return Promise.all(
          keys.filter(key => key.startsWith('horsie-picker-') && key !== CACHE_NAME).map(key => caches.delete(key))
        );
      }),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  // Handle SPA navigation: Redirect all navigation requests to index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then(response => response || fetch(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
