/* Purpose: Mount the combined layers/fields experiment with the existing browser host.
 * Consumers: weather.html. Dependencies: core/host.js and weather-experiment.js. */
import {mountExperiment} from "./core/host.js";
import {weather} from "./weather-experiment.js";
mountExperiment(weather);
