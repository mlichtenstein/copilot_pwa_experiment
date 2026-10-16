/*
 * sw.js - the service worker.
 * A service worker is a script the browser runs in the background, separate
 * from the page. Browsers require one (plus the manifest) before offering to
 * install a site as an app on Android.
 * Consumer: the browser only. app.js registers it; nobody calls it directly.
 * It reacts to three "hooks" (events), each explained where it is handled below.
 * Because paths are relative and it is registered from its own folder, it only
 * controls that folder, so production and previews don't interfere.
 * To force users to pick up changes to the cached file list, bump CACHE.
 */
// Name of the cache storage bucket
const CACHE = 'hello-pwa-v1';
// The files to save for offline use (relative paths, like everything else)
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png'];

// Hook 1 - "install": runs once when the browser first sees this worker (or a
// new version of it). We download all the app files into the cache.
// skipWaiting() makes a new version take over right away.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// Hook 2 - "activate": runs when this worker takes over. We delete caches left
// by older versions (any name other than CACHE) and claim the open pages.
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Hook 3 - "fetch": runs for every request the page makes. We try the network
// first (so you always see the latest), and fall back to the cache if offline.
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
