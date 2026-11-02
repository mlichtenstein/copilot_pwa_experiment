/* Purpose: Convection study page entry: mounts the Convection study experiment module.
 * Consumers: convection.html. Dependencies: convection-experiment.js and core/host.js
 *   (controls, shared loop and clock, emoji rating bar, ?p= links, service worker), and the
 *   page's DOM contract described in core/host.js. */
import { convection } from "./convection-experiment.js";
import { mountExperiment } from "./core/host.js";

// Plays on load unless the reader prefers reduced motion, as before.
export const page = mountExperiment(convection);
