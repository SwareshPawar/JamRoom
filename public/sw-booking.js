const CACHE_NAME = 'jamroom-v6';
const STATIC_ASSETS = [
  '/booking.html',
  '/login.html', 
  '/index.html',
  '/css/shared.css',
  '/css/pages/booking.css',
  '/css/vendor/flatpickr.min.css',
  '/manifest.webmanifest',
  '/icons/jamroom-192.png',
  '/icons/jamroom-512.png',
  '/icons/jamroom-maskable.png',
  '/js/shared/theme.js',
  '/js/shared/utils.js',
  '/js/shared/alerts.js',
  '/js/shared/auth.js',
  '/js/shared/payment.js',
  '/js/shared/navigation.js',
  '/js/vendor/flatpickr.min.js',
  '/js/booking/booking-auth.js',
  '/js/booking/booking-availability.js',
  '/js/booking/booking-pricing.js',
  '/js/booking/booking-rentals.js',
  '/js/booking/booking-api.js',
  '/js/booking/booking-form.js',
  '/js/booking/booking-main.js',
  '/js/shared/pwa-install.js',
  '/js/shared/perf-baseline.js',
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
  const isStyleOrScript = request.destination === 'style' || request.destination === 'script' || isCoreAsset;

  // Network-first for documents so users get fresh HTML quickly.
  if (isSameOrigin && isNavigation) {
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

  // Stale-while-revalidate for styles/scripts to avoid intermittent unstyled or half-loaded UI.
  if (isSameOrigin && isStyleOrScript) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const networkPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || networkPromise;
      })
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
