/* Purpose: Load sourced bitmaps and connect valley texture controls to a simulation clock.
 * Consumers: valley.html. Dependencies: valley-model.js, DOM IDs, valley-textures.js, Image/Canvas and service worker APIs. */
import { defaults, textureOptions, renderValley } from "./valley-model.js";
import { decodeCloudTexture } from "./valley-textures.js";
const element = id => document.getElementById(id), canvas = element("sky"), context = canvas.getContext("2d");
let textures, brushSeed = 1, time = 0, playing = false, previous, elapsed = 0, dirty = true;
function selectedTexture(slot) { return textureOptions.find(option => option.id === element("texture-" + slot).value) ?? textureOptions[0]; }
function preview(slot) {
  const selected = selectedTexture(slot), texture = textures[selected.id], target = element("preview-" + slot), ctx = target.getContext("2d");
  const image = ctx.createImageData(target.width, target.height);
  for (let y = 0; y < target.height; y++) for (let x = 0; x < target.width; x++) {
    const i = Math.floor(y / target.height * texture.height) * texture.width + Math.floor(x / target.width * texture.width), out = (y * target.width + x) * 4;
    const shade = texture.shading ? texture.shading[i] : 1 - texture.pixels[i];
    image.data[out] = image.data[out + 1] = image.data[out + 2] = shade * 255; image.data[out + 3] = texture.pixels[i] * 255;
  }
  ctx.putImageData(image, 0, 0); target.setAttribute("aria-label", selected.name + " grayscale cloud mask");
}
function render() {
  const start = performance.now(), options = Object.fromEntries(Object.keys(defaults).map(key => [key, Number(element(key).value)]));
  options.horizon = ["valley", "hills", "open"].find(id => element("horizon-" + id).checked) ?? "hills";
  options.brushSeed = brushSeed;
  options.placement = element("placement").value;
  const a = selectedTexture("a"), b = selectedTexture("b"), image = context.createImageData(canvas.width, canvas.height);
  image.data.set(renderValley(textures[a.id], time, options, element("shape").value, canvas.width, canvas.height, textures[b.id]));
  context.putImageData(image, 0, 0);
  for (const key of Object.keys(defaults)) element(key + "-value").textContent = element(key).value;
  element("stats").textContent = `${a.name} → ${b.name} · ${Math.round(options.textureBlend * 100)}% B · layout ${brushSeed} · t ${time.toFixed(1)} s · ${(performance.now() - start).toFixed(0)} ms/frame`;
  dirty = false;
}
function setPlaying(value) {
  playing = value; previous = undefined; elapsed = 0;
  element("play").textContent = playing ? "Pause wind" : "Play wind";
  element("play").setAttribute("aria-pressed", String(playing));
}
for (const key of Object.keys(defaults)) element(key).addEventListener("input", () => { dirty = true; });
for (const slot of ["a", "b"]) element("texture-" + slot).addEventListener("change", () => { if (textures) preview(slot); dirty = true; });
for (const id of ["valley", "hills", "open"]) element("horizon-" + id).addEventListener("change", () => { dirty = true; });
element("placement").addEventListener("change", () => { dirty = true; });
element("shape").addEventListener("change", () => { dirty = true; });
element("play").addEventListener("click", () => setPlaying(!playing));
element("step").addEventListener("click", () => { setPlaying(false); time += 1; dirty = true; });
element("shuffle").addEventListener("click", () => { brushSeed += 1; dirty = true; });
element("reset").addEventListener("click", () => {
  setPlaying(false); time = 0; brushSeed = 1;
  for (const [key, value] of Object.entries(defaults)) element(key).value = value;
  element("texture-a").value = "rose"; element("texture-b").value = "billow";
  if (textures) { preview("a"); preview("b"); }
  element("shape").value = "noise"; element("placement").value = "full";
  for (const id of ["valley", "hills", "open"]) element("horizon-" + id).checked = id === "hills"; dirty = true;
});
async function loadTexture(option) {
  const image = new Image(); image.src = option.file; await image.decode();
  const scratch = document.createElement("canvas"); scratch.width = 512; scratch.height = Math.max(1, Math.round(512 * (image.naturalHeight || 512) / (image.naturalWidth || 512)));
  const ctx = scratch.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, 0, 0, scratch.width, scratch.height);
  const rgba = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
  const texture = decodeCloudTexture(rgba, scratch.width, scratch.height, option.profile);
  texture.seed = textureOptions.indexOf(option) * 101;
  return [option.id, texture];
}
export const ready = Promise.all(textureOptions.map(loadTexture)).then(entries => {
  textures = Object.fromEntries(entries); preview("a"); preview("b");
  for (const id of ["play", "step", "reset", "shuffle"]) element(id).disabled = false;
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
