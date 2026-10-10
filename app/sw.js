/*
 * sw.js - the service worker.
 * A service worker is a script the browser runs in the background, separate
 * from the page. Browsers require one (plus the manifest) before offering to
 * install a site as an app on Android.
 * Consumer: the browser only. app.js registers it; nobody calls it directly.
 * What it does here:
 *   - On install: downloads the app files into a cache.
 *   - On fetch: tries the network first, and uses the cache if offline.
 * Because paths are relative and it is registered from its own folder, it only
 * controls that folder, so production and previews don't interfere.
 * To force users to pick up changes to the cached file list, bump CACHE.
 */
// Name of the cache storage bucket
const CACHE = 'hello-pwa-v1';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
