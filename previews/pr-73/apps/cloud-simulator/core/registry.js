/*
 * Purpose: The list of cloud simulator experiments that use the common module contract, so
 *   a page (the planned front page and its Random button) can find, link and load any of them.
 * Consumers: experiment.test.js now; the front page and Random button later (issue #68).
 * Dependencies: the experiment modules, loaded on demand with import().
 */

// href is relative to apps/cloud-simulator/. Every experiment page is ported to
// core/experiment.js (see issue #68).
export const experiments = [
  { id: "sunset", title: "Sunset study", href: "sunset.html", load: () => import("../sunset-experiment.js").then(module => module.sunset) },
  { id: "horizon", title: "Horizon light", href: "horizon.html", load: () => import("../horizon-experiment.js").then(module => module.horizon) },
  { id: "shafts", title: "Light shafts", href: "shafts.html", load: () => import("../shafts-experiment.js").then(module => module.shafts) },
  { id: "noise", title: "Noise weather", href: "noise.html", load: () => import("../noise-experiment.js").then(module => module.noise) },
  { id: "convection", title: "Convection study", href: "convection.html", load: () => import("../convection-experiment.js").then(module => module.convection) },
  { id: "valley", title: "Valley textures", href: "valley.html", load: () => import("../valley-experiment.js").then(module => module.valley) }
];

export const findExperiment = id => experiments.find(entry => entry.id === id) ?? null;
