const CACHE = 'rais-crm-v3';
const RUNTIME_CACHE = 'rais-crm-runtime-v3';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE && k !== RUNTIME_CACHE; }).map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

function isFreshAsset(pathname) {
  return pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.html') ||
    pathname === '/' ||
    pathname.endsWith('/');
}

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN = url.origin === 'https://cdn.jsdelivr.net';

  if (isSameOrigin || isCDN) {
    if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) {
      e.respondWith(fetch(e.request));
      return;
    }

    // App shell + ES modules: network first so deploys show new context menu / features
    if (isSameOrigin && isFreshAsset(url.pathname)) {
      e.respondWith(
        fetch(e.request).then(function(response) {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(function(cache) {
              cache.put(e.request, clone);
            });
          }
          return response;
        }).catch(function() {
          return caches.match(e.request);
        })
      );
      return;
    }

    e.respondWith(
      fetch(e.request).then(function(response) {
        if (!response || response.status !== 200) return response;
        const responseToCache = response.clone();
        caches.open(RUNTIME_CACHE).then(function(cache) {
          cache.put(e.request, responseToCache);
        });
        return response;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
  } else {
    e.respondWith(
      fetch(e.request).catch(function() { return caches.match(e.request); })
    );
  }
});
