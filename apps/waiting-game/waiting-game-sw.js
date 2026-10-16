/*
 * Waiting Game service worker.
 * Dependencies: browser service-worker and Cache Storage APIs; the local app
 * files named in FILES.
 * Consumer: the browser, registered by index.html to cache this game.
 */
const CACHE = "waiting-game-v1";
const FILES = ["./", "index.html", "manifest.json", "game.js", "ui.js", "icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("waiting-game-") && key !== CACHE).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
