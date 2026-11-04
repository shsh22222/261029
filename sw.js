/* オフライン対応 Service Worker */
const CACHE = 'tsuzuri-v6';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/markdown.js',
  './js/crypto.js',
  './js/db.js',
  './js/data.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先（常に最新版）＋ オフライン時はキャッシュ
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate';
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(isPage ? './index.html' : req, copy));
        }
        return res;
      })
      .catch(() => caches.match(isPage ? './index.html' : req, { ignoreSearch: true }))
  );
});

// 通知をタップしたら該当セッションを開く
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('navigate' in c) return c.navigate(url).then((w) => (w || c).focus());
      }
      return self.clients.openWindow(url);
    })
  );
});
