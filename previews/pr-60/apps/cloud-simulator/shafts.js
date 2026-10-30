/* Purpose: Simple sun/cloud/haze controls and image playback.
 * Consumers: shafts.html. Dependencies: shafts-model.js, visibility-model.js, page IDs, Canvas and service worker APIs. */
import { defaults, createScene, createLayer, buildLightMaps, renderShafts } from "./shafts-model.js";
import { buildVisibility, renderVisibility, buildLayeredVisibility, visibilityDefaults } from "./visibility-model.js";
const element = id => document.getElementById(id), canvas = element("sky"), context = canvas.getContext("2d");
const controlDefaults = { ...defaults, ...visibilityDefaults };
let scene = createScene(), dirty = true, playing = false, previous, elapsed = 0, direction = 1;
function render() {
  const start = performance.now();
  const options = Object.fromEntries(Object.keys(controlDefaults).map(key => [key, Number(element(key).value)]));
  const layeredMode = element("strategy-layered").checked;
  const polygonMode = layeredMode || element("strategy-visibility").checked;
  element("sourceRadius").disabled = !polygonMode;
  const image = context.createImageData(canvas.width, canvas.height);
  if (polygonMode) image.data.set(renderVisibility(scene, (layeredMode ? buildLayeredVisibility : buildVisibility)(scene, options, canvas.width, canvas.height)));
  else image.data.set(renderShafts(scene, buildLightMaps(scene, options), canvas.width, canvas.height));
  context.putImageData(image, 0, 0);
  for (const key of Object.keys(controlDefaults)) element(key + "-value").textContent = element(key).value;
  element("stats").textContent = `3 cloud layers · ${layeredMode ? "layered visibility" : polygonMode ? "visibility polygons" : "geometric shadows"} · ${(performance.now() - start).toFixed(0)} ms/frame`;
  element("patterns").textContent = scene.layers.map(layer => `${layer.name}: ${layer.seed}`).join(" · ");
  dirty = false;
}
for (const id of ["strategy-visibility", "strategy-layered", "strategy-geometric"]) element(id).addEventListener("change", () => { dirty = true; });
function pause() { playing = false; element("play").textContent = "Play sun"; element("play").setAttribute("aria-pressed", "false"); }
for (const key of Object.keys(controlDefaults)) element(key).addEventListener("input", () => {
  if (key === "sunAzimuth") pause(); dirty = true;
});
element("play").addEventListener("click", () => {
  playing = !playing; previous = undefined; elapsed = 0;
  element("play").textContent = playing ? "Pause sun" : "Play sun";
  element("play").setAttribute("aria-pressed", String(playing));
});
element("reset").addEventListener("click", () => {
  pause(); for (const [key, value] of Object.entries(controlDefaults)) element(key).value = value;
  scene = createScene(); dirty = true;
});
for (let i = 0; i < 3; i++) element("pattern-" + i).addEventListener("click", () => {
  scene.layers[i] = createLayer(i, (scene.layers[i].seed + 1) >>> 0); dirty = true;
});
document.addEventListener("visibilitychange", () => { previous = undefined; elapsed = 0; });
function frame(time) {
  if (playing && !document.hidden && previous !== undefined) {
    elapsed += Math.min(250, time - previous);
    if (elapsed >= 160) {
      let angle = Number(element("sunAzimuth").value) + direction * elapsed * 0.003;
      if (angle >= 40 || angle <= -40) { angle = Math.max(-40, Math.min(40, angle)); direction *= -1; }
      element("sunAzimuth").step = "any"; element("sunAzimuth").value = angle; elapsed = 0; dirty = true;
    }
  }
  if (dirty && !document.hidden) render(); previous = time; requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./cloud-sw.js").catch(error => {
  console.error("Light-shaft offline setup failed", error); element("status").textContent = "Offline setup failed; the experiment still runs online.";
});
