/* senorbak · service worker: la app funciona sin conexión */
const VERSION = 'senorbak-v1.2.0';
const FONT_CACHE = 'senorbak-fonts';
const SHELL = ['./', './index.html', './app.css', './app.js', './i18n.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('senorbak-v') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
      const net = fetch(req).then((r) => { if (r.ok && r.type === 'basic') cache.put(req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || new Response('', { status: 504 });
    })());
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok && r.type !== 'opaque') cache.put(req, r.clone()); return r; }
      catch { return new Response('', { status: 504 }); }
    })());
  }
});