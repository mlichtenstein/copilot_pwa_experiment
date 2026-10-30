/* Purpose: Mount the lightning scene without embedding scene-specific UI rules.
 * Consumers: lightning.html. Dependencies: experiment-host.js and lightning-model.js. */
import { mountExperiment } from "./experiment-host.js";
import { lightningScene } from "./lightning-model.js";
mountExperiment(lightningScene);
