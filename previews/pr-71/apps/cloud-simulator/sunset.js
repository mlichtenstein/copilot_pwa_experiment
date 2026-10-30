/* Purpose: Sunset controls, animation and pixel canvas presentation.
 * Consumers: sunset.html. Dependencies: sunset-model.js, ../shared/presets-panel.js (emoji rating bar and ?p= links),
 *   DOM IDs, Canvas and service worker APIs. */
import { defaults, createDensity, renderSunset } from "./sunset-model.js";
import { mountPresetBar } from "../shared/presets-panel.js";
const element = id => document.getElementById(id);
const canvas = element("sky"), context = canvas.getContext("2d");
let field = createDensity();
let playing = false, previous, accumulated = 0;
function render() {
  const settings = Object.fromEntries(Object.keys(defaults).map(key => [key, Number(element(key).value)]));
  for (const key of Object.keys(defaults)) element(key + "-value").textContent = element(key).value;
  const image = context.createImageData(field.width, field.height);
  image.data.set(renderSunset(field, settings, element("view").value));
  context.putImageData(image, 0, 0);
  element("stats").textContent = `Seed ${element("seed").value} · density fixed · sunAngle ${settings.sunAngle.toFixed(1)}°`;
}
function setPlaying(value) {
  playing = value; previous = undefined; accumulated = 0;
  element("play").textContent = playing ? "Pause sun" : "Play sun";
  element("play").setAttribute("aria-pressed", String(playing));
}
for (const key of Object.keys(defaults)) element(key).addEventListener("input", () => {
  if (key === "sunAngle") setPlaying(false);
  render();
});
element("view").addEventListener("change", render);
element("play").addEventListener("click", () => setPlaying(!playing));
element("reset").addEventListener("click", () => { setPlaying(false); element("sunAngle").value = defaults.sunAngle; render(); });
function resetDensity() {
  const input = element("seed"), seed = Number(input.value);
  input.setCustomValidity("");
  if (input.value === "" || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
    input.setCustomValidity("Use an integer from 0 to 4294967295."); input.reportValidity(); return;
  }
  field = createDensity(canvas.width, canvas.height, seed); render();
}
element("seed").addEventListener("input", () => element("seed").setCustomValidity(""));
element("seed").addEventListener("change", resetDensity);
element("new-seed").addEventListener("click", () => {
  element("seed").value = crypto.getRandomValues(new Uint32Array(1))[0]; resetDensity();
});
document.addEventListener("visibilitychange", () => { previous = undefined; accumulated = 0; });
function frame(time) {
  if (playing && !document.hidden && previous !== undefined) {
    accumulated += Math.min(time - previous, 250);
    if (accumulated >= 100) {
      let angle = Number(element("sunAngle").value) - accumulated * 0.005;
      if (angle < -8) angle = 170;
      // Keep sub-degree movement despite the slider's manual one-degree steps.
      element("sunAngle").step = "any";
      element("sunAngle").value = angle; accumulated = 0; render();
    }
  }
  previous = time; requestAnimationFrame(frame);
}
render(); requestAnimationFrame(frame);
// Ratings and links: every slider, the density seed, the view and the grid size.
const getParams = () => ({ ...Object.fromEntries(Object.keys(defaults).map(key => [key, Number(element(key).value)])),
  seed: Number(element("seed").value), view: element("view").value, resolution: `${canvas.width}x${canvas.height}` });
function applyParams(params) {
  setPlaying(false);
  for (const key of Object.keys(defaults)) if (typeof params[key] === "number") element(key).value = params[key];
  if ([...element("view").options].some(option => option.value === params.view)) element("view").value = params.view;
  if (Number.isInteger(params.seed) && params.seed >= 0 && params.seed < 2 ** 32) element("seed").value = params.seed;
  resetDensity();
}
mountPresetBar(element("presets"), { app: "cloud-simulator/sunset", getParams, applyParams, canvas });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./cloud-sw.js").catch(error => {
  console.error("Sunset offline setup failed", error);
  element("status").textContent = "Offline setup failed; the experiment still works online.";
});
