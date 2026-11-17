/*
 * Purpose: Cache the site-root app so it can install and work offline.
 * Consumers: the browser only. app.js registers this file; nothing calls it directly.
 * Dependencies: the service worker and Cache Storage APIs, and the files in ASSETS.
 *
 * A service worker is a script the browser runs in the background, separate
 * from the page. Browsers require one (plus the manifest) before offering to
 * install a site as an app on Android.
 * It reacts to three hooks (events), each explained where it is handled below.
 * Because paths are relative and it is registered from its own folder, it only
 * controls that folder. Cache Storage is shared by the whole origin, so the
 * cache name includes this worker's scope path. Production and each preview
 * therefore use different buckets, and activation deletes only older buckets
 * for this same scope.
 */
// Scope path distinguishes /<repo>/ from /<repo>/previews/pr-N/ (and local copies).
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/+$/, '') || '/';
// The v1 suffix marks this cache schema. Online loads refresh the stored
// files, so a content deploy does not need a new name.
const CACHE_PREFIX = 'hello-pwa::' + SCOPE_PATH + '::';
const CACHE = CACHE_PREFIX + 'v1';
// The files to save for offline use (relative paths, like everything else).
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png'];

function precache() {
  return caches.open(CACHE).then((cache) => Promise.all(ASSETS.map((path) => {
    const url = new URL(path, self.registration.scope);
    return fetch(url, { cache: 'no-cache' }).then((response) => {
      if (!response.ok) throw new Error('Precache failed for ' + url.href + ' (' + response.status + ')');
      return cache.put(url, response);
    });
  })));
}

// Hook 1 - "install": runs once when the browser first sees this worker (or a
// new version of it). We download all the app files into this scope's cache.
// skipWaiting() makes a new version take over right away.
self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

// Hook 2 - "activate": runs when this worker takes over. Delete only obsolete
// schema versions for THIS scope, then claim the open pages. Other apps and
// previews keep their own buckets, including older shared names like
// hello-pwa-v1 that a not-yet-updated deployment may still be using.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Hook 3 - "fetch": runs for every request the page makes. Try the network
// first (so a deploy shows up without renaming the cache) and store the
// response for offline use. If the network fails, serve the cached copy.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' }).then((response) => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
      }
      return response;
    }).catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
