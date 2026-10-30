/*
 * Purpose: Noise weather playback, parameter controls and pixel canvas presentation.
 * Consumers: noise.html.
 * Dependencies: noise-model.js, ../shared/presets-panel.js (emoji rating bar and ?p= links),
 *   ../shared/drift.js (Drift: sliders wander on their own), page element IDs, Canvas 2D and service worker APIs.
 */
import { defaults, createWeather, step, sampleFields, renderWeather, airborneRain, pooledRain,
  createRainLayer, updateRainLayer, startCloud } from "./noise-model.js";
import { mountPresetBar } from "../shared/presets-panel.js";
import { bindDrift } from "../shared/drift.js";

const element = id => document.getElementById(id);
const canvas = element("sky");
const context = canvas.getContext("2d");
const image = context.createImageData(canvas.width, canvas.height);
// Every slider is a model rule and affects the current run.
const liveRules = Object.keys(defaults).filter(id => element(id));
const TICKS_PER_SECOND = 20;
const legends = {
  sunset: "Sunset: clouds lit peach toward the low sun at lower right and grey-violet where thick; smooth grey curtain under a cloud base and thin streaks = rain falling from a raining cloud; blue floor = puddles.",
  water: "Cloud and rain: white = stored cloud water, gold tint = dense, lasting cloud that is raining, pale blue = rain in the air.",
  relative: "Cloud forcing: relative humidity × the cloud-layer band; brighter = closer to forming, orange = cloud condenses here now.",
  humidity: "Humidity: dark = dry, blue = moist.",
  temperature: "Temperature: blue = cold, red = warm.",
  pressure: "Pressure: purple = low (more cloud), yellow = high (clearer)."
};
let simulation, rain;
// Seeds only make a run reproducible; behavior should look alike on any seed.
let seed = crypto.getRandomValues(new Uint32Array(1))[0];
let running = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let elapsed = 0;
let previousTime;

const rules = () => ({ ...defaults, ...Object.fromEntries(liveRules.map(id => [id, Number(element(id).value)])) });

function render() {
  image.data.set(renderWeather(simulation, element("view").value, rules(), rain));
  context.putImageData(image, 0, 0);
  const cloudy = simulation.cloud.filter(value => value > 0).length / simulation.cloud.length;
  element("stats").textContent = `Tick ${simulation.tick} · Cloud ${(100 * cloudy).toFixed(0)}% · Rain in air ${airborneRain(simulation).toFixed(2)} · Puddles ${pooledRain(simulation).toFixed(2)}`;
}

function setRunning(next) {
  running = next;
  elapsed = 0;
  element("play").textContent = running ? "Pause" : "Play";
  element("play").setAttribute("aria-pressed", String(running));
}

function advance(current) {
  step(simulation, current);
  updateRainLayer(rain, simulation, current);
}

function reset() {
  simulation = createWeather({ width: canvas.width, height: canvas.height, seed });
  rain = createRainLayer(seed);
  sampleFields(simulation, rules());
  startCloud(simulation);
  elapsed = 0;
  render();
}

const showValue = id => { element(id + "-value").textContent = element(id).value; };
for (const id of liveRules) {
  const update = () => showValue(id);
  update();
  element(id).addEventListener("input", () => {
    update();
    // Slider changes show at once: the forcing always, and while paused the cloud is reset
    // to it (playing, the stored cloud follows at its own pace).
    sampleFields(simulation, rules());
    if (!running) startCloud(simulation);
    render();
  });
}
// Drift: while playing, every slider wanders on its own slow random walk (own random
// numbers, so the weather seed is untouched). Dragging a slider takes it over; it wanders on
// from where it is left.
const drift = bindDrift(liveRules.map(element), { seed: crypto.getRandomValues(new Uint32Array(1))[0], onChange: slider => showValue(slider.id) });
element("drift").addEventListener("change", () => drift.sync());
element("play").addEventListener("click", () => setRunning(!running));
element("step").addEventListener("click", () => { setRunning(false); advance(rules()); render(); });
element("reset").addEventListener("click", reset);
element("new-seed").addEventListener("click", () => {
  seed = crypto.getRandomValues(new Uint32Array(1))[0];
  reset();
});
const showLegend = () => { element("legend").textContent = legends[element("view").value]; };
element("view").addEventListener("change", () => { showLegend(); render(); });
showLegend();
// Hidden tabs do not bank time: playback resumes from the current state.
document.addEventListener("visibilitychange", () => { previousTime = undefined; elapsed = 0; });
reset();
setRunning(running);

// Ratings and links: a run is its rules plus the seed and view.
const getParams = () => ({ ...Object.fromEntries(liveRules.map(id => [id, Number(element(id).value)])), seed, view: element("view").value, drift: element("drift").checked });
function applyParams(params) {
  for (const id of liveRules) {
    if (typeof params[id] !== "number") continue;
    element(id).value = params[id];
    element(id + "-value").textContent = element(id).value;
  }
  if ([...element("view").options].some(option => option.value === params.view)) element("view").value = params.view;
  if (typeof params.drift === "boolean") element("drift").checked = params.drift;
  drift.sync();
  if (Number.isInteger(params.seed) && params.seed >= 0 && params.seed < 2 ** 32) seed = params.seed;
  showLegend(); reset();
}
mountPresetBar(element("presets"), { app: "cloud-simulator/noise", getParams, applyParams, canvas });
function frame(time) {
  if (running && !document.hidden && previousTime !== undefined) {
    elapsed += Math.min(time - previousTime, 250);
    const interval = 1000 / TICKS_PER_SECOND, ticks = Math.floor(elapsed / interval);
    // Drift moves the sliders by the sim time that passes, so it stops when paused.
    if (ticks && element("drift").checked) drift.step(ticks / TICKS_PER_SECOND);
    const current = rules();
    let changed = false;
    while (elapsed >= interval) { advance(current); elapsed -= interval; changed = true; }
    if (changed) render();
  }
  previousTime = time;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./cloud-sw.js").catch(error => {
    console.error("Noise weather offline setup failed", error);
    element("status").textContent = "Offline setup failed. The experiment still runs online.";
  });
}
