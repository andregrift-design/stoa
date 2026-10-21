// Offline support: app files and CDN libraries are cached; Supabase calls always go to the network.
const VERSION = 'stoa-v10';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'src/main.js', 'src/views.js', 'src/db.js', 'src/calendar.js', 'src/ink.js', 'src/ui.js', 'src/dates.js', 'src/stoic.js', 'src/review.js', 'src/config.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;
  const sameOrigin = url.origin === location.origin;
  // App files: network first so updates show up, cache as fallback when offline.
  // CDN files (pinned versions): cache first.
  e.respondWith(sameOrigin
    ? fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
    : caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })));
});
