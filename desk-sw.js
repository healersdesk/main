// Healer's Desk — app helper for "My Healing Desk".
// Always loads the newest version from the internet; only when you're offline
// does it show the last saved copy of the desk screen. Client data is never cached.
const CACHE = 'healersdesk-v1';
const SHELL = ['/desk', '/config.js', '/desk/manifest.webmanifest', '/desk/icons/icon-192.png', '/assets/mark.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok && SHELL.includes(url.pathname)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/desk')))
  );
});
