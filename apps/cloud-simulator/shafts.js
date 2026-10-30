/* Purpose: Controls, sun playback and presentation for experiment 03.
 * Consumers: shafts.html. Dependencies: shafts-model.js, page IDs, Canvas and service worker APIs. */
import { defaults, createScene, sweepSunlight, renderShafts } from "./shafts-model.js";
const element = id => document.getElementById(id);
const canvas = element("sky"), context = canvas.getContext("2d");
let scene = createScene(), lighting, playing = false, previous, elapsed = 0, direction = 1;
let dirty = true, lightDirty = true;
function settings() { return Object.fromEntries(Object.keys(defaults).map(key => [key, Number(element(key).value)])); }
function render() {
  const start = performance.now(), options = settings();
  if (lightDirty) lighting = sweepSunlight(scene, options);
  else lighting.settings = options;
  const image = context.createImageData(canvas.width, canvas.height);
  image.data.set(renderShafts(scene, lighting, element("view").value, canvas.width, canvas.height, Number(element("slice").value)));
  context.putImageData(image, 0, 0);
  for (const key of [...Object.keys(defaults), "slice"]) element(key + "-value").textContent = Number(element(key).value).toFixed(key === "haze" ? 3 : 1);
  element("slice-value").textContent = `${element("slice").value} · z = ${(Number(element("slice").value) + 0.5) * scene.dz}`;
  element("stats").textContent = `Seed ${scene.seed} · ${scene.nx}×${scene.ny}×${scene.nz} · ${(performance.now() - start).toFixed(0)} ms/frame`;
  dirty = lightDirty = false;
}
function pause() { playing = false; element("play").textContent = "Play sun"; element("play").setAttribute("aria-pressed", "false"); }
for (const key of Object.keys(defaults)) element(key).addEventListener("input", () => {
  if (key === "sunAzimuth") pause();
  dirty = true;
  if (!["g", "fov", "exposure"].includes(key)) lightDirty = true;
});
element("view").addEventListener("change", () => { dirty = true; });
element("slice").addEventListener("input", () => {
  pause(); element("view").value = "slice"; dirty = true;
});
element("play").addEventListener("click", () => {
  playing = !playing; previous = undefined; elapsed = 0;
  element("play").textContent = playing ? "Pause sun" : "Play sun";
  element("play").setAttribute("aria-pressed", String(playing));
});
element("reset").addEventListener("click", () => { pause(); for (const [key, value] of Object.entries(defaults)) element(key).value = value; dirty = lightDirty = true; });
function newScene() {
  const input = element("seed"), seed = Number(input.value); input.setCustomValidity("");
  if (input.value === "" || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) { input.setCustomValidity("Use an integer from 0 to 4294967295."); input.reportValidity(); return; }
  scene = createScene(seed); dirty = lightDirty = true;
}
element("seed").addEventListener("input", () => element("seed").setCustomValidity(""));
element("seed").addEventListener("change", newScene);
element("new-seed").addEventListener("click", () => { element("seed").value = crypto.getRandomValues(new Uint32Array(1))[0]; newScene(); });
document.addEventListener("visibilitychange", () => { previous = undefined; elapsed = 0; });
function frame(time) {
  if (playing && !document.hidden && previous !== undefined) {
    elapsed += Math.min(250, time - previous);
    if (elapsed >= 160) {
      let angle = Number(element("sunAzimuth").value) + direction * elapsed * 0.003;
      if (angle >= 40 || angle <= -40) { angle = Math.max(-40, Math.min(40, angle)); direction *= -1; }
      element("sunAzimuth").step = "any"; element("sunAzimuth").value = angle;
      elapsed = 0; dirty = lightDirty = true;
    }
  }
  if (dirty && !document.hidden) render();
  previous = time; requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./cloud-sw.js").catch(error => {
  console.error("Light-shaft offline setup failed", error); element("status").textContent = "Offline setup failed; the experiment still runs online.";
});
