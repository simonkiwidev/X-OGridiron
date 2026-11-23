// Offline support: keep a copy of the app so it opens without Wi-Fi.
// Bump VERSION whenever app files change so devices pick up the update.
const VERSION = 'xog-v3';
const FILES = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/designer.js', 'js/ui.js', 'js/cloud.js', 'js/pictures.js', 'js/names.js', 'js/vendor/firebase.js', 'js/field.js', 'js/formation.js', 'js/routes.js', 'js/storage.js', 'js/timeline.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Open instantly from the saved copy (great on patchy Wi-Fi) and quietly fetch
// a fresh copy in the background for next time.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        e.waitUntil(fresh);
        return cached;
      }
      return (await fresh) || (await cache.match('index.html')) || Response.error();
    }),
  );
});
