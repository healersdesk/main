// Healer's Desk — app helper for "My Healing Desk".
// Always loads the newest version from the internet; only when you're offline
// does it show the last saved copy of the desk screen. Client data is never cached.
const CACHE = 'healersdesk-v4';
// The app now lives on app.healersdesk.com. A copy of this helper left on the old
// address removes itself so it can't get in the way of the move.
const OLD_HOST = /^(www\.)?healersdesk\.com$/.test(self.location.hostname);
const SHELL = ['/desk', '/config.js', '/desk/manifest.webmanifest', '/desk/icons/icon-192.png', '/assets/brand/logo-full-600.png', '/assets/brand/icon-128.png'];

self.addEventListener('install', e => {
  if (OLD_HOST) { self.skipWaiting(); return; }
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  if (OLD_HOST) { e.waitUntil(caches.keys().then(k => Promise.all(k.map(x => caches.delete(x)))).then(() => self.registration.unregister())); return; }
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (OLD_HOST) return;
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok && SHELL.includes(url.pathname)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/desk')))
  );
});
