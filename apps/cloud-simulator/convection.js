/*
 * Purpose: Convection study playback, parameter controls and pixel canvas presentation.
 * Consumers: convection.html.
 * Dependencies: convection-model.js, page element IDs, Canvas 2D and service worker APIs.
 */
import { defaults, createConvection, step, totalWater, renderConvection } from "./convection-model.js";

const element = id => document.getElementById(id);
const canvas = element("sky");
const context = canvas.getContext("2d");
const image = context.createImageData(canvas.width, canvas.height);
// Sliders whose id matches a model rule; the remaining rules keep their defaults.
const liveRules = ["buoyancy", "viscosity", "heating", "cooling", "latentHeat", "expansion", "evaporation", "fallSpeed", "flicker"];
const legends = {
  lamp: "Lava lamp: orange = warmer than the row average (rising), blue = cooler (sinking), white = rain and thick cloud.",
  water: "Water: dark air, blue tint = vapor, white = cloud and rain. Fixed color scale; no decorative trails.",
  temperature: "Temperature: blue = cold, red = warm. The floor is heated and the lid is cooled.",
  buoyancy: "Buoyancy: orange = warmer than the row average (rising), blue = cooler (sinking). Clips at ±0.15.",
  humidity: "Relative humidity: brighter = closer to saturation; orange = saturated, where cloud forms."
};
let simulation;
let running = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let elapsed = 0;
let previousTime;

const rules = () => ({ ...defaults, ...Object.fromEntries(liveRules.map(id => [id, Number(element(id).value)])) });

function render() {
  image.data.set(renderConvection(simulation, element("view").value, rules()));
  context.putImageData(image, 0, 0);
  const water = totalWater(simulation) / simulation.temperature.length;
  element("stats").textContent = `Tick ${simulation.tick} · Seed ${element("seed").value} · Water/cell ${water.toFixed(3)} · Fastest flow ${simulation.speed.toFixed(2)} px/tick`;
}

function setRunning(next) {
  running = next;
  elapsed = 0;
  element("play").textContent = running ? "Pause" : "Play";
  element("play").setAttribute("aria-pressed", String(running));
}

function reset() {
  const input = element("seed"), seed = Number(input.value);
  if (input.value === "" || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
    input.setCustomValidity("Use a whole-number seed from 0 to 4294967295.");
    input.reportValidity();
    return;
  }
  input.setCustomValidity("");
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
element("seed").addEventListener("input", () => element("seed").setCustomValidity(""));
element("seed").addEventListener("change", reset);
element("play").addEventListener("click", () => setRunning(!running));
element("step").addEventListener("click", () => { setRunning(false); step(simulation, rules()); render(); });
element("reset").addEventListener("click", reset);
element("new-seed").addEventListener("click", () => {
  element("seed").value = crypto.getRandomValues(new Uint32Array(1))[0];
  reset();
});
element("view").addEventListener("change", () => {
  element("legend").textContent = legends[element("view").value];
  render();
});
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
    console.error("Convection study offline setup failed", error);
    element("status").textContent = "Offline setup failed. The experiment still runs online.";
  });
}
