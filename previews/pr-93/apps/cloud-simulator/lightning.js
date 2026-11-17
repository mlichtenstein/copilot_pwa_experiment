/* Purpose: Lightning page entry: mounts the Lightning experiment module on the shared core.
 * Consumers: lightning.html. Dependencies: lightning-experiment.js and core/host.js (common
 *   panel, controls, shared loop and clock, Drift, emoji rating bar, ?p= links, service
 *   worker), and the page's DOM contract described in core/host.js. */
import { lightning } from "./lightning-experiment.js";
import { mountExperiment } from "./core/host.js";

// Starts paused on a fresh strike, as before.
export const page = mountExperiment(lightning);
