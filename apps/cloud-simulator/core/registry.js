/*
 * Purpose: The list of cloud simulator experiments that use the common module contract, so
 *   a page can find, link and load any of them. Its order and its nav labels and taglines are
 *   the shared header's (header.js): every page links every experiment in this order.
 * Consumers: header.js, the core tests; the front page and Random button later (issue #68).
 * Dependencies: the experiment modules, loaded on demand with import().
 */

// href is relative to apps/cloud-simulator/. Every experiment page is ported to
// core/experiment.js (see issue #68).
export const experiments = [
  { id: "normal-lighting", title: "Normal lighting", nav: "Normals", tagline: "Baked shapes. Warm light. Cool folds.", href: "normal-lighting.html", load: () => import("../normal-lighting-experiment.js").then(module => module.normalLighting) },
  { id: "weather", title: "Weather layers", nav: "Combined layers", tagline: "One cloud field. Several ways to see it.", href: "weather.html", load: () => import("../weather-experiment.js").then(module => module.weather) },
  { id: "sunset", title: "Sunset study", nav: "Sunset", tagline: "Fixed droplets. Moving sunlight. Follow the light to the camera.", href: "sunset.html", load: () => import("../sunset-experiment.js").then(module => module.sunset) },
  { id: "convection", title: "Convection study", nav: "Convection", tagline: "Hot floor. Cold lid. Warm blobs rise, rain falls, the water comes back.", href: "convection.html", load: () => import("../convection-experiment.js").then(module => module.convection) },
  { id: "horizon", title: "Horizon light", nav: "Horizon", tagline: "One sun. Six layers. Different paths through the atmosphere.", href: "horizon.html", load: () => import("../horizon-experiment.js").then(module => module.horizon) },
  { id: "shafts", title: "Light shafts", nav: "Shafts", tagline: "Cloud cutouts. Extruded shadows. Light through the air.", href: "shafts.html", load: () => import("../shafts-experiment.js").then(module => module.shafts) },
  { id: "noise", title: "Noise weather", nav: "Noise", tagline: "Heat, humidity and pressure drift as noise; clouds form in a layer, linger and rain.", href: "noise.html", load: () => import("../noise-experiment.js").then(module => module.noise) },
  { id: "valley", title: "Valley textures", nav: "Valley", tagline: "Borrow the detail. Move the texture. Shape where it appears.", href: "valley.html", load: () => import("../valley-experiment.js").then(module => module.valley) },
  { id: "lightning", title: "Lightning", nav: "Lightning", tagline: "Three charged storm layers. Watch the field break down.", href: "lightning.html", load: () => import("../lightning-experiment.js").then(module => module.lightning) }
];

export const findExperiment = id => experiments.find(entry => entry.id === id) ?? null;
