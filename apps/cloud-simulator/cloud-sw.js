/*
 * Purpose: Cache the cloud simulator for offline use within this registration's scope.
 * Consumers: the browser, registered by the experiment pages.
 * Dependencies: service worker and Cache Storage APIs; files listed in FILES (including the
 *   shared presets and drift modules in ../shared/).
 *
 * Cache Storage is shared by every app and preview on this origin. The cache
 * name includes the registration scope so production and /previews/pr-N/ do
 * not share a bucket. Activation deletes only older names with this prefix.
 */
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/+$/, "") || "/";
const CACHE_PREFIX = "cloud-simulator::" + SCOPE_PATH + "::";
const CACHE = CACHE_PREFIX + "v1";
const FILES = ["./", "index.html", "manifest.json", "icon.svg", "style.css", "sunset.html", "sunset.js", "sunset-model.js", "convection.html", "convection.js", "convection-model.js", "horizon.html", "horizon.js", "horizon-model.js", "atmosphere-model.js", "horizon-bitmaps.js", "noise.html", "noise.js", "noise-model.js", "shafts.html", "shafts.js", "shafts-model.js", "visibility-model.js", "../shared/presets.js", "../shared/presets-panel.js", "../shared/presets.css", "../shared/drift.js", "valley.html", "valley.js", "valley-model.js", "valley-sampling.js", "valley-noise.js", "valley-textures.js", "textures/FX_CloudAlpha01.jpg", "textures/FX_CloudAlpha06.jpg", "textures/FX_CloudAlpha08.jpg", "textures/FX_CloudAlpha03.jpg", "textures/FX_CloudAlpha05.jpg", "textures/FX_CloudAlpha09.jpg", "textures/sunset-rose.jpg", "textures/sunset-embers.jpg"];

function precache() {
  return caches.open(CACHE).then(cache => Promise.all(FILES.map(path => {
    const url = new URL(path, self.registration.scope);
    return fetch(url, { cache: "no-cache" }).then(response => {
      if (!response.ok) throw new Error("Precache failed for " + url.href + " (" + response.status + ")");
      return cache.put(url, response);
    });
  })));
}

self.addEventListener("install", event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  // Cross-origin requests (the presets API) go straight to the network, never cached.
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: "no-cache" }).then(response => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
      }
      return response;
    }).catch(() => caches.open(CACHE).then(cache => cache.match(event.request)))
  );
});
