/* Purpose: Mount the combined layers/fields experiment with the existing browser host.
 * Consumers: weather.html. Dependencies: core/host.js, weather-experiment.js and weather-inspector.js. */
import {mountExperiment} from "./core/host.js";
import {weather} from "./weather-experiment.js";
import {mountWeatherInspector} from "./weather-inspector.js";
const page=mountExperiment(weather);
const inspector=mountWeatherInspector({doc:document,root:document.getElementById("weather-inspector"),select:next=>page.applyParams({...page.getParams(),...next})});
page.instance.onImage=()=>inspector.update(page.params,page.instance);
page.render();
