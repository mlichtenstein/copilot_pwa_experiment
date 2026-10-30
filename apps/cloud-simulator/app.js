/*
 * Purpose: Render experimental fields and connect playback and parameter controls.
 * Consumers: index.html.
 * Dependencies: simulation.js, ../shared/presets-panel.js (emoji rating bar and ?p= links),
 *   page element IDs, Canvas 2D and service worker APIs.
 */
import { createSimulation, step, threshold } from "./simulation.js";
import { mountPresetBar } from "../shared/presets-panel.js";

const element = id => document.getElementById(id);
const canvas = element("sky");
const context = canvas.getContext("2d");
const image = context.createImageData(canvas.width, canvas.height);
const value = id => Number(element(id).value);
let simulation;
let running = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let elapsed = 0;
let previousTime;

function render() {
  const view = element("view").value;
  for (let i = 0; i < simulation.water.length; i++) {
    const water = simulation.water[i];
    const temperature = simulation.temperature[i];
    let color;
    if (view === "temperature") color = [40 + 205 * temperature, 95 + 40 * temperature, 220 - 150 * temperature];
    else {
      const intensity = Math.min(1, view === "saturation" ? water / threshold(temperature, value("threshold")) / 2 : water / 3);
      color = [13 + 205 * intensity, 24 + 214 * intensity, 43 + 210 * intensity];
      if (view === "saturation" && water > threshold(temperature, value("threshold"))) color = [255, 155 * intensity, 90];
    }
    image.data.set([...color, 255], i * 4);
  }
  context.putImageData(image, 0, 0);
  element("stats").textContent = `Tick ${simulation.tick} · Seed ${value("seed")} · Drained ${simulation.drained.toFixed(1)}`;
}

function setRunning(next) {
  running = next;
  elapsed = 0;
  element("play").textContent = running ? "Pause" : "Play";
  element("play").setAttribute("aria-pressed", String(running));
}

function reset() {
  const seed = value("seed");
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295 || element("seed").value === "") {
    element("seed").setCustomValidity("Use a whole-number seed from 0 to 4294967295.");
    element("seed").reportValidity();
    return;
  }
  element("seed").setCustomValidity("");
  simulation = createSimulation({ seed, moisture: value("moisture"), temperatureNoise: value("noise"), patchSize: value("patch") });
  elapsed = 0;
  render();
}

function advance() {
  step(simulation, { transfer: value("transfer"), baseThreshold: value("threshold") });
}

for (const id of ["transfer", "threshold", "speed", "moisture", "noise", "patch"]) {
  const update = () => { element(id + "-value").textContent = element(id).value; };
  update();
  element(id).addEventListener("input", () => {
    update();
    if (["moisture", "noise", "patch"].includes(id)) reset();
    else render();
  });
}
element("seed").addEventListener("input", () => element("seed").setCustomValidity(""));
element("seed").addEventListener("change", reset);
element("play").addEventListener("click", () => setRunning(!running));
element("step").addEventListener("click", () => { setRunning(false); advance(); render(); });
element("reset").addEventListener("click", reset);
element("new-seed").addEventListener("click", () => {
  element("seed").value = crypto.getRandomValues(new Uint32Array(1))[0];
  reset();
});
element("view").addEventListener("change", () => {
  element("legend").textContent = {
    water: "Water: dark = dry, pale blue = wet. Fixed color scale; no decorative trails.",
    temperature: "Temperature: blue = cold, red = warm. This field stays fixed during a run.",
    saturation: "Relative saturation: orange = above threshold; blue = below. Brightness clips at twice the threshold."
  }[element("view").value];
  render();
});
document.addEventListener("visibilitychange", () => { previousTime = undefined; elapsed = 0; });
reset();
setRunning(running);

// Ratings and links: every slider, the seed, the view and the grid size.
const sliders = ["transfer", "threshold", "speed", "moisture", "noise", "patch"];
const getParams = () => ({ ...Object.fromEntries(sliders.map(id => [id, value(id)])), seed: value("seed"),
  view: element("view").value, resolution: `${canvas.width}x${canvas.height}` });
function applyParams(params) {
  for (const id of sliders) {
    if (typeof params[id] !== "number") continue;
    element(id).value = params[id];
    element(id + "-value").textContent = element(id).value;
  }
  if (Number.isInteger(params.seed) && params.seed >= 0 && params.seed < 2 ** 32) element("seed").value = params.seed;
  if ([...element("view").options].some(option => option.value === params.view)) {
    element("view").value = params.view;
    element("view").dispatchEvent(new Event("change"));
  }
  reset();
}
mountPresetBar(element("presets"), { app: "cloud-simulator/rain", getParams, applyParams, canvas });
function frame(time) {
  if (running && !document.hidden && previousTime !== undefined) {
    elapsed += Math.min(time - previousTime, 250);
    const interval = 1000 / value("speed");
    let changed = false;
    while (elapsed >= interval) { advance(); elapsed -= interval; changed = true; }
    if (changed) render();
  }
  previousTime = time;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./cloud-sw.js").catch(error => {
    console.error("Cloud simulator offline setup failed", error);
    element("status").textContent = "Offline setup failed. The experiment still runs online.";
  });
}
