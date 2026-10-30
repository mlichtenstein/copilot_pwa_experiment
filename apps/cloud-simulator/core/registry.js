/*
 * Purpose: The list of cloud simulator experiments that use the common module contract, so
 *   a page (the planned front page and its Random button) can find, link and load any of them.
 * Consumers: experiment.test.js now; the front page and Random button later (issue #68).
 * Dependencies: the experiment modules, loaded on demand with import().
 */

// href is relative to apps/cloud-simulator/. Experiments join this list as they are ported
// to core/experiment.js (see issue #68).
export const experiments = [
  { id: "sunset", title: "Sunset study", href: "sunset.html", load: () => import("../sunset-experiment.js").then(module => module.sunset) },
  { id: "horizon", title: "Horizon light", href: "horizon.html", load: () => import("../horizon-experiment.js").then(module => module.horizon) }
];

export const findExperiment = id => experiments.find(entry => entry.id === id) ?? null;
