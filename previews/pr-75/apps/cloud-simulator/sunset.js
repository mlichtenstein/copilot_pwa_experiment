/* Purpose: Sunset study page entry: mounts the Sunset experiment module on this page.
 * Consumers: sunset.html. Dependencies: sunset-experiment.js and core/host.js (controls, shared
 *   loop, clock and figure-eight sun, emoji rating bar, ?p= links, service worker), and the
 *   page's DOM contract described in core/host.js. */
import { sunset } from "./sunset-experiment.js";
import { mountExperiment } from "./core/host.js";

// Starts paused, as before; Play sun runs the shared clock.
export const page = mountExperiment(sunset);
