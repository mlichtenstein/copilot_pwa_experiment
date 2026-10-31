/* Purpose: Horizon light page entry: mounts the Horizon experiment module on this page.
 * Consumers: horizon.html. Dependencies: horizon-experiment.js and core/host.js (controls, shared
 *   loop, clock and figure-eight sun, emoji rating bar, ?p= links, service worker), and the
 *   page's DOM contract described in core/host.js. */
import { horizon } from "./horizon-experiment.js";
import { mountExperiment } from "./core/host.js";

// Starts paused, as before; Play sunset runs the shared clock.
export const page = mountExperiment(horizon);
