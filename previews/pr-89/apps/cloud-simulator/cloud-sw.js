/*
 * Purpose: Cache the cloud simulator for offline use within this registration's scope.
 * Consumers: the browser, registered by the front page and the experiment pages; sw.test.js.
 * Dependencies: service worker and Cache Storage APIs; files listed in FILES (including the
 *   shared experiment core in core/ and the shared presets and drift modules in ../shared/).
 *
 * Cache Storage is shared by every app and preview on this origin. The cache
 * name includes the registration scope so production and /previews/pr-N/ do
 * not share a bucket. Activation deletes only older names with this prefix.
 */
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/+$/, "") || "/";
const CACHE_PREFIX = "cloud-simulator::" + SCOPE_PATH + "::";
const CACHE = CACHE_PREFIX + "v7";
const FILES = ["./", "index.html", "home.js", "thumbs/sunset.png", "thumbs/convection.png", "thumbs/horizon.png", "thumbs/shafts.png", "thumbs/noise.png", "thumbs/valley.png", "thumbs/lightning.png", "thumbs/weather.png", "manifest.json", "icon.svg", "style.css", "sunset.html", "sunset.js", "sunset-model.js", "sunset-experiment.js", "core/experiment.js", "core/host.js", "core/clock.js", "core/sun-path.js", "core/moon-path.js", "core/daylight.js", "core/registry.js", "core/header.js", "core/hold-help.js", "core/launch.js", "core/sun-light.js", "convection.html", "convection.js", "convection-experiment.js", "convection-model.js", "horizon.html", "horizon.js", "horizon-experiment.js", "horizon-model.js", "atmosphere-model.js", "horizon-bitmaps.js", "noise.html", "noise.js", "noise-experiment.js", "noise-model.js", "shafts.html", "shafts.js", "shafts-experiment.js", "shafts-model.js", "visibility-model.js", "../shared/presets.js", "../shared/presets-panel.js", "../shared/presets.css", "../shared/drift.js", "valley.html", "valley.js", "valley-experiment.js", "valley-model.js", "valley-sampling.js", "valley-noise.js", "valley-textures.js", "textures/FX_CloudAlpha01.jpg", "textures/FX_CloudAlpha06.jpg", "textures/FX_CloudAlpha08.jpg", "textures/FX_CloudAlpha03.jpg", "textures/FX_CloudAlpha05.jpg", "textures/FX_CloudAlpha09.jpg", "textures/sunset-rose.jpg", "textures/sunset-embers.jpg", "lightning.html", "lightning.js", "lightning-model.js", "charge-field.js", "lightning-terrain.js", "lightning-experiment.js", "experiment-session.js", "experiment-architecture.md", "weather-inspector.js", "weather-inspection.js", "weather-inspector.css", "weather.html", "weather.js", "weather-experiment.js", "weather-fields.js", "weather-model.js", "weather-design.md"];

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
