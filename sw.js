// Falla Portal — Service Worker v2.1.1
const BUILD_VERSION = '2119';
const CACHE_NAME = 'falla-portal-v' + BUILD_VERSION;
const BASE = '/fallaportal';

// Instal·lació — pre-caché dels recursos estàtics
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll([
        BASE + '/',
        BASE + '/index.html',
        BASE + '/icon-192.png',
        BASE + '/icon-512.png',
        BASE + '/apple-touch-icon.png'
      ]);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activació — netejar caché antic
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch — Network First per a tot excepte APIs de Google
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Les crides a Google APIs mai van a caché
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('google.com') ||
      url.hostname.includes('accounts.google.com')) {
    return;
  }

  // HTML principal: Network First amb fallback a caché
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(function() {
          return caches.match(BASE + '/index.html');
        })
    );
    return;
  }

  // Icones: Cache First
  if (event.request.url.includes('icon-') ||
      event.request.url.includes('apple-touch-icon')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        return cached || fetch(event.request);
      })
    );
    return;
  }
});
