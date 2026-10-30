/* Purpose: Load sourced bitmaps and connect valley texture controls to a simulation clock.
 * Consumers: valley.html. Dependencies: valley-model.js, DOM IDs, valley-textures.js, Image/Canvas and service worker APIs. */
import { defaults, textureOptions, renderValley } from "./valley-model.js";
import { decodeCloudTexture } from "./valley-textures.js";
const element = id => document.getElementById(id), canvas = element("sky"), context = canvas.getContext("2d");
let textures, time = 0, playing = false, previous, elapsed = 0, dirty = true;
function selectedTexture() { return textureOptions.find(option => element("texture-" + option.id).checked) ?? textureOptions[0]; }
function render() {
  const start = performance.now(), options = Object.fromEntries(Object.keys(defaults).map(key => [key, Number(element(key).value)]));
  options.horizon = ["valley", "hills", "open"].find(id => element("horizon-" + id).checked) ?? "hills";
  options.placement = element("placement").value;
  const selected = selectedTexture(), image = context.createImageData(canvas.width, canvas.height);
  image.data.set(renderValley(textures[selected.id], time, options, element("shape").value, canvas.width, canvas.height));
  context.putImageData(image, 0, 0);
  for (const key of Object.keys(defaults)) element(key + "-value").textContent = element(key).value;
  element("stats").textContent = `${selected.name} · t ${time.toFixed(1)} s · ${(performance.now() - start).toFixed(0)} ms/frame`;
  dirty = false;
}
function setPlaying(value) {
  playing = value; previous = undefined; elapsed = 0;
  element("play").textContent = playing ? "Pause wind" : "Play wind";
  element("play").setAttribute("aria-pressed", String(playing));
}
for (const key of Object.keys(defaults)) element(key).addEventListener("input", () => { dirty = true; });
for (const option of textureOptions) element("texture-" + option.id).addEventListener("change", () => { dirty = true; });
for (const id of ["valley", "hills", "open"]) element("horizon-" + id).addEventListener("change", () => { dirty = true; });
element("placement").addEventListener("change", () => { dirty = true; });
element("shape").addEventListener("change", () => { dirty = true; });
element("play").addEventListener("click", () => setPlaying(!playing));
element("step").addEventListener("click", () => { setPlaying(false); time += 1; dirty = true; });
element("reset").addEventListener("click", () => {
  setPlaying(false); time = 0;
  for (const [key, value] of Object.entries(defaults)) element(key).value = value;
  for (const option of textureOptions) element("texture-" + option.id).checked = option.id === "rose";
  element("shape").value = "noise"; element("placement").value = "full";
  for (const id of ["valley", "hills", "open"]) element("horizon-" + id).checked = id === "hills"; dirty = true;
});
async function loadTexture(option) {
  const image = new Image(); image.src = option.file; await image.decode();
  const scratch = document.createElement("canvas"); scratch.width = scratch.height = 512;
  const ctx = scratch.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, 0, 0, 512, 512);
  const rgba = ctx.getImageData(0, 0, 512, 512).data;
  return [option.id, decodeCloudTexture(rgba, 512, 512, option.profile)];
}
export const ready = Promise.all(textureOptions.map(loadTexture)).then(entries => {
  textures = Object.fromEntries(entries);
  for (const id of ["play", "step", "reset"]) element(id).disabled = false;
}).catch(error => {
  console.error("Valley texture load failed", error); element("status").textContent = "Cloud textures could not load. Reload online to try again.";
  element("stats").textContent = "Texture loading failed.";
});
document.addEventListener("visibilitychange", () => { previous = undefined; elapsed = 0; });
function frame(stamp) {
  if (textures && playing && !document.hidden && previous !== undefined) {
    const dt = Math.min(250, stamp - previous); time += dt / 1000; elapsed += dt;
    if (elapsed >= 80) { dirty = true; elapsed = 0; }
  }
  if (textures && dirty && !document.hidden) render();
  previous = stamp; requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./cloud-sw.js").catch(error => {
  console.error("Valley offline setup failed", error); element("status").textContent = "Offline setup failed; the experiment still works online.";
});
