const CACHE_NAME = 'jamroom-v2';
const STATIC_ASSETS = [
  '/booking.html',
  '/login.html', 
  '/index.html',
  '/manifest.webmanifest',
  '/icons/jamroom-icon.svg',
  '/icons/jamroom-maskable.svg',
  '/js/client-pdf-generator.js',
  '/js/pdfHTMLTemplate.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  // Always use network for API calls to keep booking data fresh.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = request.mode === 'navigate' || request.destination === 'document' || url.pathname.endsWith('.html');
  const isCoreAsset = url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/');

  // Network-first for documents and core assets to avoid stale app code.
  if (isSameOrigin && (isNavigation || isCoreAsset)) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && isSameOrigin) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkPromise;
    })
  );
});
