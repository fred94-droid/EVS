/* Service worker : l'appli fonctionne hors ligne. Changer VERSION à chaque mise à jour du code. */
const VERSION = 'evs-v1';
const ASSETS = ['./', 'index.html', 'style.css', 'calc.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Cache d'abord, puis mise à jour en arrière-plan (stale-while-revalidate)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(VERSION).then(cache =>
    cache.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) cache.put(e.request, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })));
});
