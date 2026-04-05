// RichSmart Service Worker v2
const CACHE = 'richsmart-v4';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([
      '/RichSmart/',
      '/RichSmart/index.html',
      '/RichSmart/manifest.json',
    ])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always serve index.html for navigation requests — fixes 404 on home screen open
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/RichSmart/index.html')
        .then(r => r || fetch('/RichSmart/index.html'))
        .catch(() => fetch('/RichSmart/index.html'))
    );
    return;
  }

  // Cache first for everything else
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return response;
    })).catch(() => caches.match('/RichSmart/index.html'))
  );
});
