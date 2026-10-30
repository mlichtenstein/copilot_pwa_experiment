/*
 * Purpose: Noise weather playback, parameter controls and pixel canvas presentation.
 * Consumers: noise.html.
 * Dependencies: noise-model.js, page element IDs, Canvas 2D and service worker APIs.
 */
import { defaults, createWeather, step, sampleFields, renderWeather, airborneRain, pooledRain } from "./noise-model.js";

const element = id => document.getElementById(id);
const canvas = element("sky");
const context = canvas.getContext("2d");
const image = context.createImageData(canvas.width, canvas.height);
// Every slider whose id matches a model rule; all of them affect the current run.
const liveRules = Object.keys(defaults).filter(id => element(id));
const legends = {
  sunset: "Sunset: clouds lit peach toward the low sun at lower right and grey-violet where thick; pale blue dashes = falling rain; blue floor = puddles.",
  water: "Cloud and rain: white = cloud, gold tint = cloud charged enough to rain, pale blue = rain in the air.",
  relative: "Relative humidity: brighter = closer to the cloud threshold; orange = above it, where cloud appears.",
  humidity: "Humidity: dark = dry, blue = moist (after drying aloft).",
  temperature: "Temperature: blue = cold, red = warm (after the lapse rate).",
  pressure: "Pressure: purple = low (more cloud), yellow = high (clearer).",
  wind: "Wind: teal = blowing left, pink = blowing right. It only pushes the rain."
};
let simulation;
// Seeds only make a run reproducible; behavior should look alike on any seed.
let seed = crypto.getRandomValues(new Uint32Array(1))[0];
let running = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let elapsed = 0;
let previousTime;

const rules = () => ({ ...defaults, ...Object.fromEntries(liveRules.map(id => [id, Number(element(id).value)])) });

function render() {
  image.data.set(renderWeather(simulation, element("view").value, rules()));
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

function reset() {
  simulation = createWeather({ width: canvas.width, height: canvas.height, seed });
  sampleFields(simulation, rules());
  elapsed = 0;
  render();
}

for (const id of [...liveRules, "speed"]) {
  const update = () => { element(id + "-value").textContent = element(id).value; };
  update();
  element(id).addEventListener("input", () => {
    update();
    // Field sliders show their effect at once, even while paused.
    if (id !== "speed") sampleFields(simulation, rules());
    render();
  });
}
element("play").addEventListener("click", () => setRunning(!running));
element("step").addEventListener("click", () => { setRunning(false); step(simulation, rules()); render(); });
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
function frame(time) {
  if (running && !document.hidden && previousTime !== undefined) {
    elapsed += Math.min(time - previousTime, 250);
    const interval = 1000 / Number(element("speed").value);
    const current = rules();
    let changed = false;
    while (elapsed >= interval) { step(simulation, current); elapsed -= interval; changed = true; }
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
