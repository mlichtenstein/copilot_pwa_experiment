/* Purpose: Horizon-light controls, fixed-pixel presentation and sunset playback.
 * Consumers: horizon.html. Dependencies: horizon-model.js, page IDs, Canvas and service worker APIs. */
import { defaults, renderHorizon, cloudCenters } from "./horizon-model.js";
const element = id => document.getElementById(id), canvas = element("sky"), context = canvas.getContext("2d");
let dirty = true, playing = false, previous, elapsed = 0, elevationDirection = -1, azimuthDirection = 1;
function pause() { playing = false; element("play").textContent = "Play sunset"; element("play").setAttribute("aria-pressed", "false"); }
function render() {
  const settings = Object.fromEntries(Object.keys(defaults).map(key => [key, Number(element(key).value)]));
  const start = performance.now(), image = context.createImageData(canvas.width, canvas.height);
  image.data.set(renderHorizon(settings, canvas.width, canvas.height)); context.putImageData(image, 0, 0);
  for (const key of Object.keys(defaults)) element(key + "-value").textContent = element(key).value;
  element("stats").textContent = `Fixed bitmaps · six layers · ${(performance.now() - start).toFixed(0)} ms/frame`;
  element("cloud-status").textContent = cloudCenters(settings).map((layer, i) => `${["Near", "Middle", "Far"][i]} cloud: ${layer.height.toFixed(1)} km high, ${layer.distance.toFixed(0)} km away, ${layer.lit ? "sunlit" : "Earth shadow"}`).join(" · ");
  dirty = false;
}
for (const key of Object.keys(defaults)) element(key).addEventListener("input", () => {
  if (["sunElevation", "sunAzimuth"].includes(key)) pause(); dirty = true;
});
element("play").addEventListener("click", () => {
  playing = !playing; previous = undefined; elapsed = 0;
  element("play").textContent = playing ? "Pause sunset" : "Play sunset";
  element("play").setAttribute("aria-pressed", String(playing));
});
element("reset").addEventListener("click", () => {
  pause(); for (const [key, value] of Object.entries(defaults)) element(key).value = value;
  elevationDirection = -1; azimuthDirection = 1; dirty = true;
});
document.addEventListener("visibilitychange", () => { previous = undefined; elapsed = 0; });
function frame(time) {
  if (playing && !document.hidden && previous !== undefined) {
    elapsed += Math.min(time - previous, 250);
    if (elapsed >= 200) {
      const step = elapsed / 1000 * Number(element("sunSpeed").value);
      let elevation = Number(element("sunElevation").value) + elevationDirection * step;
      let azimuth = Number(element("sunAzimuth").value) + azimuthDirection * step * 0.5;
      if (elevation <= -8 || elevation >= 15) { elevation = Math.max(-8, Math.min(15, elevation)); elevationDirection *= -1; }
      if (azimuth <= -45 || azimuth >= 45) { azimuth = Math.max(-45, Math.min(45, azimuth)); azimuthDirection *= -1; }
      element("sunElevation").step = element("sunAzimuth").step = "any";
      element("sunElevation").value = elevation; element("sunAzimuth").value = azimuth;
      elapsed = 0; dirty = true;
    }
  }
  if (dirty && !document.hidden) render(); previous = time; requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./cloud-sw.js").catch(error => {
  console.error("Horizon offline setup failed", error); element("status").textContent = "Offline setup failed; the experiment still runs online.";
});
