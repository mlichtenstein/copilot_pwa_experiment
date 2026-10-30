/* Purpose: Three cloud pictures and two coarse illuminated-air pictures, with no volume grid.
 * Consumers: shafts.js and shafts-model.test.js. Dependencies: sunset-model.js; no browser APIs. */
import { createDensity, sunlight } from "./sunset-model.js";
export const defaults = { sunElevation: 8, sunAzimuth: -18, cloudOpacity: 1.2, haze: 0.35 };
export const layerNames = ["near", "middle", "far"];
export function createLayer(index, seed) {
  const width = [32, 64, 96][index], height = [20, 40, 60][index];
  const sourceWidth = Math.max(128, width * 2), sourceHeight = Math.max(80, height * 2);
  const source = createDensity(sourceWidth, sourceHeight, seed).density;
  return { name: layerNames[index], width, height, depth: [22, 50, 78][index], cellSize: 4, seed,
    density: Float64Array.from({ length: width * height }, (_, i) =>
      source[Math.floor(Math.floor(i / width) / height * sourceHeight) * sourceWidth + Math.floor(i % width / width * sourceWidth)]) };
}
export function createScene(seed = 42) {
  return { seed, layers: layerNames.map((_, i) => createLayer(i, (seed + i * 997) >>> 0)) };
}
export function sampleCloud(layer, x, y) {
  const u = x / layer.cellSize + layer.width / 2 - 0.5;
  const v = layer.height / 2 - y / layer.cellSize - 0.5;
  const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
  const at = (a, b) => a < 0 || b < 0 || a >= layer.width || b >= layer.height ? 0 : layer.density[b * layer.width + a];
  return at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy)
    + at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
}
export function sunDirection(settings) {
  const e = settings.sunElevation * Math.PI / 180, a = settings.sunAzimuth * Math.PI / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}
// Project each farther cloud picture's shadow onto the requested air/cloud position.
export function lightAt(scene, x, y, depth, settings) {
  const direction = sunDirection(settings);
  let transmission = 1;
  for (const layer of scene.layers) if (layer.depth > depth) {
    const distance = (layer.depth - depth) / direction[2];
    const density = sampleCloud(layer, x + direction[0] * distance, y + direction[1] * distance);
    transmission *= Math.exp(-settings.cloudOpacity * density / direction[2]);
  }
  return transmission;
}
function screenPosition(x, y, width, height, depth) {
  const scale = Math.tan(58 * Math.PI / 360), distance = depth + 12;
  return [(2 * (x + 0.5) / width - 1) * scale * width / height * distance,
    (1 - 2 * (y + 0.5) / height) * scale * distance];
}
export function buildLightMaps(scene, options = {}) {
  const settings = { ...defaults, ...options }, width = 64, height = 40;
  const color = sunlight(settings.sunElevation, 0.12);
  const gaps = [0, 1].map(i => {
    const depth = (scene.layers[i].depth + scene.layers[i + 1].depth) / 2;
    const airT = Math.exp(-settings.haze * (scene.layers[i + 1].depth - scene.layers[i].depth) * 0.04);
    const pixels = new Float32Array(width * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const [px, py] = screenPosition(x, y, width, height, depth);
      const illumination = lightAt(scene, px, py, depth, settings);
      for (let c = 0; c < 3; c++) pixels[(y * width + x) * 3 + c] = (1 - airT) * illumination * color[c];
    }
    return { depth, airT, pixels };
  });
  return { settings, width, height, color, gaps };
}
export function renderShafts(scene, maps, width = 128, height = 80) {
  const { settings, color } = maps, direction = sunDirection(settings);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [rx, ry] = screenPosition(x, y, width, height, -11); // unit camera-plane distance
    const cosine = (rx * direction[0] + ry * direction[1] + direction[2]) / Math.hypot(rx, ry, 1);
    const disk = cosine > Math.cos(0.8 * Math.PI / 180) ? 4 : 0;
    let rgb = [0.035, 0.065, 0.14].map((v, c) => v + color[c] * (disk + Math.exp(-Math.abs(ry) * 6) * 0.09));
    // Back-to-front image compositing: far cloud, air, middle cloud, air, near cloud.
    for (let i = 2; i >= 0; i--) {
      const layer = scene.layers[i], [px, py] = screenPosition(x, y, width, height, layer.depth);
      const density = sampleCloud(layer, px, py), transmission = Math.exp(-settings.cloudOpacity * density);
      const illumination = lightAt(scene, px, py, layer.depth, settings);
      rgb = rgb.map((v, c) => v * transmission + (1 - transmission) * (0.025 + color[c] * illumination * 0.65));
      if (i > 0) {
        const gap = maps.gaps[i - 1];
        const gx = Math.min(maps.width - 1, Math.floor(x / width * maps.width));
        const gy = Math.min(maps.height - 1, Math.floor(y / height * maps.height));
        rgb = rgb.map((v, c) => v * gap.airT + gap.pixels[(gy * maps.width + gx) * 3 + c]);
      }
    }
    pixels.set([...rgb.map(v => 255 * Math.pow(1 - Math.exp(-v * 1.3), 1 / 2.2)), 255], (y * width + x) * 4);
  }
  return pixels;
}
