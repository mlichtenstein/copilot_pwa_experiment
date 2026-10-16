/*
 * Dice & Coin PWA service worker.
 * Dependencies: browser service-worker and Cache Storage APIs; the local page,
 * manifest, and icon listed in FILES.
 * Consumer: the browser, registered by the Dice & Coin page to cache this app.
 */
const CACHE = "dice-v1";
const FILES = ["./", "index.html", "manifest.json", "icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
