/*
 * Purpose: Convection study playback, parameter controls and pixel canvas presentation.
 * Consumers: convection.html.
 * Dependencies: convection-model.js, ../shared/presets-panel.js (emoji rating bar and ?p= links),
 *   page element IDs, Canvas 2D and service worker APIs.
 */
import { defaults, createConvection, step, totalWater, renderConvection } from "./convection-model.js";
import { mountPresetBar } from "../shared/presets-panel.js";

const element = id => document.getElementById(id);
const canvas = element("sky");
const context = canvas.getContext("2d");
let image;
// Sliders whose id matches a model rule; the remaining rules keep their defaults.
const liveRules = ["inversionHeight", "lclHeight", "buoyancy", "viscosity", "heating", "cooling", "latentHeat", "expansion", "evaporation", "autoconversion", "fallSpeed", "flicker"];
const legends = {
  sunset: "Sunset: solid clouds = cloudy air that is rising or warm, or pressed flat under warmer air above it (the inversion); with the LCL they sit on flat bases at one height over clear air, lit peach and pink from a low sun at lower right and grey-violet in their own shadow, with frayed wisps at the edges; faint veil = still cloud and near-saturated haze; soft curtains = falling rain.",
  sunsetRaw: "Sunset, raw cloud water: every bit of simulated cloud drawn by its own amount, lit from a low sun at lower right; it reads as smoke. Soft curtains = falling rain.",
  lamp: "Lava lamp: orange = warmer than the row average (rising), blue = cooler (sinking), pale cyan = falling rain (cloud is hidden here; see Cloud and rain).",
  water: "Cloud and rain: dark air, blue tint = vapor, gray-white = cloud, pale cyan = falling rain. Fixed color scale; no decorative trails.",
  temperature: "Temperature: blue = cold, red = warm. The floor is heated and the lid is cooled.",
  buoyancy: "Buoyancy: orange = warmer than the row average (rising), blue = cooler (sinking). Clips at ±0.15.",
  humidity: "Relative humidity: brighter = closer to saturation; orange = saturated, where cloud forms."
};
let simulation;
// Seeds only make a run reproducible; behavior should look alike on any seed, so the
// page picks one at random and Reset restarts the same run.
let seed = crypto.getRandomValues(new Uint32Array(1))[0];
let running = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let elapsed = 0;
let previousTime;

// The run's full parameters: sliders plus the Options group. Plain JSON, so a preset
// can save and restore all of it. `layering` replaces the older `inversion` boolean,
// which the model still reads when a saved preset has no `layering`.
const rules = () => ({
  ...defaults,
  ...Object.fromEntries(liveRules.map(id => [id, Number(element(id).value)])),
  layering: document.querySelector("input[name=layering]:checked").value,
  cloudStyle: document.querySelector("input[name=cloudStyle]:checked").value,
  feather: element("feather").checked,
  pixelArt: element("pixelArt").checked,
  resolution: document.querySelector("input[name=resolution]:checked").value
});

function render() {
  image.data.set(renderConvection(simulation, element("view").value, rules()));
  context.putImageData(image, 0, 0);
  const water = totalWater(simulation) / simulation.temperature.length;
  element("stats").textContent = `Tick ${simulation.tick} · Water/cell ${water.toFixed(3)} · Fastest flow ${simulation.speed.toFixed(2)} px/tick`;
}

function setRunning(next) {
  running = next;
  elapsed = 0;
  element("play").textContent = running ? "Pause" : "Play";
  element("play").setAttribute("aria-pressed", String(running));
}

// Grid size from the resolution toggle ("64x48" pixel art or "128x96" detailed). The model
// scales its pixel-counted lengths and speeds to the grid (gridScale), so both behave alike.
function sizeCanvas() {
  const [width, height] = rules().resolution.split("x").map(Number);
  if (canvas.width !== width || canvas.height !== height || !image) {
    canvas.width = width; canvas.height = height;
    image = context.createImageData(width, height);
  }
}

function reset() {
  sizeCanvas();
  simulation = createConvection({ width: canvas.width, height: canvas.height, seed, water: Number(element("water").value) });
  elapsed = 0;
  render();
}

for (const id of [...liveRules, "speed", "water"]) {
  const update = () => { element(id + "-value").textContent = element(id).value; };
  update();
  element(id).addEventListener("input", () => {
    update();
    if (id === "water") reset();
    else render();
  });
}
element("play").addEventListener("click", () => setRunning(!running));
element("step").addEventListener("click", () => { setRunning(false); step(simulation, rules()); render(); });
element("reset").addEventListener("click", reset);
element("new-seed").addEventListener("click", () => {
  seed = crypto.getRandomValues(new Uint32Array(1))[0];
  reset();
});
const showLegend = () => {
  const view = element("view").value, raw = rules().cloudStyle === "raw";
  element("legend").textContent = legends[view === "sunset" && raw ? "sunsetRaw" : view];
};
// Grey out controls that do nothing in the current state.
const syncOptions = () => {
  const { layering, cloudStyle } = rules();
  element("inversionHeight").disabled = layering !== "inversion";
  element("lclHeight").disabled = layering !== "lcl";
  // LCL mode runs its own lapse and cloud evaporation (see the formulas), so these idle.
  for (const id of ["expansion", "evaporation"]) element(id).disabled = layering === "lcl";
  element("feather").disabled = cloudStyle === "raw"; element("pixelArt").disabled = cloudStyle === "raw";
};
element("view").addEventListener("change", () => { showLegend(); render(); });
// Switching resolution restarts the same seed and parameters at the new size; the
// pixel-art style follows it (on for 64×48, off for 128×96) and can still be changed.
for (const input of document.querySelectorAll("input[name=resolution]")) {
  input.addEventListener("change", () => { element("pixelArt").checked = input.value === "64x48"; reset(); });
}
for (const input of element("options").querySelectorAll("input[type=checkbox], input[type=radio]")) {
  input.addEventListener("change", () => { syncOptions(); showLegend(); render(); });
}
syncOptions();
// Browsers may restore a previous view choice on reload; match its legend.
showLegend();
// Hidden tabs do not bank time: playback resumes from the current state.
document.addEventListener("visibilitychange", () => { previousTime = undefined; elapsed = 0; });
reset();
setRunning(running);

// Ratings and links: a run is its rules plus the seed, starting water and view.
const getParams = () => ({ ...rules(), seed, water: Number(element("water").value), view: element("view").value });
function applyParams(params) {
  for (const id of [...liveRules, "water"]) {
    if (typeof params[id] !== "number") continue;
    element(id).value = params[id];
    element(id + "-value").textContent = element(id).value;
  }
  for (const name of ["layering", "cloudStyle", "resolution"]) {
    const input = document.querySelector(`input[name=${name}][value="${CSS.escape(String(params[name]))}"]`);
    if (input) input.checked = true;
  }
  for (const id of ["feather", "pixelArt"]) if (typeof params[id] === "boolean") element(id).checked = params[id];
  if ([...element("view").options].some(option => option.value === params.view)) element("view").value = params.view;
  if (Number.isInteger(params.seed) && params.seed >= 0 && params.seed < 2 ** 32) seed = params.seed;
  syncOptions(); showLegend(); reset();
}
mountPresetBar(element("presets"), { app: "cloud-simulator/convection", getParams, applyParams, canvas });
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
    console.error("Convection study offline setup failed", error);
    element("status").textContent = "Offline setup failed. The experiment still runs online.";
  });
}
