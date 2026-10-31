/* Purpose: Light shafts page entry: mounts the Light shafts experiment module on this page.
 * Consumers: shafts.html. Dependencies: shafts-experiment.js and core/host.js (controls, shared
 *   loop, clock and figure-eight sun, emoji rating bar, ?p= links, service worker), and the
 *   page's DOM contract described in core/host.js. */
import { shafts } from "./shafts-experiment.js";
import { mountExperiment } from "./core/host.js";

// Starts paused, as before; Play sun runs the shared clock.
export const page = mountExperiment(shafts);
