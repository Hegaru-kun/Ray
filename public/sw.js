const CACHE_NAME = 'ana-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.css',
  '/manifest.json',
  '/Logo.png'
];

// Install the service worker and cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches on activation
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercept fetch requests and serve from cache first
self.addEventListener('fetch', e => {
    // Ignore non-GET requests and requests to the Gemini API
    if (e.request.method !== 'GET' || e.request.url.includes('generativelanguage.googleapis.com')) {
        return;
    }

    e.respondWith(
        caches.match(e.request)
        .then(response => {
            // Cache hit - return response
            if (response) {
                return response;
            }
            // Not in cache - fetch from network, then cache it for next time
            return fetch(e.request).then(
                networkResponse => {
                    // We only cache valid responses to avoid caching errors
                    if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
                        return networkResponse;
                    }

                    // IMPORTANT: Clone the response. A response is a stream
                    // and because we want the browser to consume the response
                    // as well as the cache consuming the response, we need
                    // to clone it so we have two streams.
                    const responseToCache = networkResponse.clone();

                    caches.open(CACHE_NAME)
                    .then(cache => {
                        cache.put(e.request, responseToCache);
                    });

                    return networkResponse;
                }
            );
        })
    );
});