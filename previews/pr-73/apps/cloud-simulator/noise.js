/* Purpose: Noise weather page entry: mounts the Noise weather experiment module on this page.
 * Consumers: noise.html. Dependencies: noise-experiment.js and core/host.js (controls, shared
 *   loop and clock, Drift, emoji rating bar, ?p= links, service worker), and the page's DOM
 *   contract described in core/host.js. */
import { noise } from "./noise-experiment.js";
import { mountExperiment } from "./core/host.js";

// Plays on load unless the reader prefers reduced motion, as before.
export const page = mountExperiment(noise);
