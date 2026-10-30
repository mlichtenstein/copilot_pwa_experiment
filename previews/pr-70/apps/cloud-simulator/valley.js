/* Purpose: Valley textures page entry: mounts the Valley textures experiment module.
 * Consumers: valley.html. Dependencies: valley-experiment.js and core/host.js (controls,
 *   shared loop and clock, texture loading lock, emoji rating bar, ?p= links, service
 *   worker), and the page's DOM contract described in core/host.js. */
import { valley } from "./valley-experiment.js";
import { mountExperiment } from "./core/host.js";

// Starts paused, as before; Play wind runs the shared clock.
export const page = mountExperiment(valley);
