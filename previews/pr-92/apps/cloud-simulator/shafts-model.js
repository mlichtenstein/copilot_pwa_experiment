/* Purpose: Cloud silhouette extrusions and analytic illuminated-air lengths, with no volume grid.
 * Consumers: shafts.js and shafts-model.test.js. Dependencies: sunset-model.js; no browser APIs. */
import { createDensity, sunlight } from "./sunset-model.js";
export const defaults = { sunElevation: 8, sunAzimuth: -18, cloudOpacity: 1.2, haze: 0.35,
  cloudSharpness: 1 };
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
// Contrast around a fixed density edge; 1 preserves the original cloud mask.
export function sharpenDensity(density, cloudSharpness) {
  return Math.max(0, Math.min(2, (density - 0.35) * cloudSharpness + 0.35));
}
export function sampleCloud(layer, x, y, smoothing = true) {
  const u = x / layer.cellSize + layer.width / 2 - 0.5;
  const v = layer.height / 2 - y / layer.cellSize - 0.5;
  const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
  const at = (a, b) => a < 0 || b < 0 || a >= layer.width || b >= layer.height ? 0 : layer.density[b * layer.width + a];
  if (!smoothing) return at(Math.floor(u + 0.5), Math.floor(v + 0.5));
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
    const density = sharpenDensity(sampleCloud(layer, x + direction[0] * distance, y + direction[1] * distance,
      false), settings.cloudSharpness);
    transmission *= Math.exp(-settings.cloudOpacity * density / direction[2]);
  }
  return transmission;
}
function screenPosition(x, y, width, height, depth) {
  const scale = Math.tan(58 * Math.PI / 360), distance = depth + 12;
  return [(2 * (x + 0.5) / width - 1) * scale * width / height * distance,
    (1 - 2 * (y + 0.5) / height) * scale * distance];
}
// Intersect a camera ray with one rectangular cloud cell extruded away from the sun.
// Coordinates use z as the ray parameter; no samples along depth are needed.
export function shadowInterval(prism, rx, ry, direction, nearDepth, farDepth) {
  let enter = nearDepth, exit = Math.min(farDepth, prism.depth);
  for (const [r, slope, low, high] of [[rx, direction[0] / direction[2], prism.x0, prism.x1],
    [ry, direction[1] / direction[2], prism.y0, prism.y1]]) {
    const a = r - slope, b = 12 * r + slope * prism.depth;
    if (Math.abs(a) < 1e-10) { if (b < low || b > high) return null; }
    else {
      const first = (low - b) / a, last = (high - b) / a;
      enter = Math.max(enter, Math.min(first, last)); exit = Math.min(exit, Math.max(first, last));
    }
  }
  return exit > enter ? [enter, exit] : null;
}
export function mergeIntervals(intervals) {
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push(interval.slice());
  }
  return merged;
}
// Integrate illuminated haze analytically between the geometric shadow intervals.
export function illuminatedAir(intervals, nearDepth, farDepth, haze) {
  const rate = haze * 0.04;
  if (rate === 0) return 0;
  const contribution = (a, b) => Math.exp(-rate * (a - nearDepth)) - Math.exp(-rate * (b - nearDepth));
  let cursor = nearDepth, light = 0;
  for (const [enter, exit] of mergeIntervals(intervals)) {
    if (enter > cursor) light += contribution(cursor, enter);
    cursor = Math.max(cursor, exit);
  }
  if (cursor < farDepth) light += contribution(cursor, farDepth);
  return light;
}
export function cloudPrisms(scene, settings, nearDepth) {
  const prisms = [];
  for (const layer of scene.layers) if (layer.depth > nearDepth) {
    for (let y = 0; y < layer.height; y++) for (let x = 0; x < layer.width; x++) {
      if (settings.cloudOpacity * sharpenDensity(layer.density[y * layer.width + x], settings.cloudSharpness) < 0.5) continue;
      const x0 = (x - layer.width / 2) * layer.cellSize;
      const y1 = (layer.height / 2 - y) * layer.cellSize;
      prisms.push({ x0, x1: x0 + layer.cellSize, y0: y1 - layer.cellSize, y1, depth: layer.depth });
    }
  }
  return prisms;
}
export function buildLightMaps(scene, options = {}) {
  const settings = { ...defaults, ...options }, width = 64, height = 40;
  const color = sunlight(settings.sunElevation, 0.12), direction = sunDirection(settings);
  const scale = Math.tan(58 * Math.PI / 360);
  const gaps = [0, 1].map(i => {
    const nearDepth = scene.layers[i].depth, farDepth = scene.layers[i + 1].depth;
    const airT = Math.exp(-settings.haze * (farDepth - nearDepth) * 0.04);
    const pixels = new Float32Array(width * height * 3);
    const prisms = cloudPrisms(scene, settings, nearDepth);
    // Bin projected extrusions by screen pixel, rather than testing all cells for every ray.
    const bins = Array.from({ length: width * height }, () => []);
    for (const prism of prisms) {
      let minX = width, maxX = -1, minY = height, maxY = -1;
      for (const z of [nearDepth, farDepth]) for (const x of [prism.x0, prism.x1]) for (const y of [prism.y0, prism.y1]) {
        const distance = (prism.depth - z) / direction[2];
        const sx = ((x - direction[0] * distance) / (z + 12) / (scale * width / height) + 1) * width / 2;
        const sy = (1 - (y - direction[1] * distance) / (z + 12) / scale) * height / 2;
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(height - 1, Math.floor(maxY)); y++)
        for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(width - 1, Math.floor(maxX)); x++) bins[y * width + x].push(prism);
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const [rx, ry] = screenPosition(x, y, width, height, -11);
      const intervals = [];
      for (const prism of bins[y * width + x]) {
        const interval = shadowInterval(prism, rx, ry, direction, nearDepth, farDepth);
        if (interval) intervals.push(interval);
      }
      const illumination = illuminatedAir(intervals, nearDepth, farDepth, settings.haze);
      for (let c = 0; c < 3; c++) pixels[(y * width + x) * 3 + c] = illumination * color[c];
    }
    return { nearDepth, farDepth, airT, pixels, prismCount: prisms.length };
  });
  return { settings, width, height, color, gaps };
}
export function renderShafts(scene, maps, width = 128, height = 80) {
  const { settings, color } = maps, direction = sunDirection(settings);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [rx, ry] = screenPosition(x, y, width, height, -11); // unit camera-plane distance
    const cosine = (rx * direction[0] + ry * direction[1] + direction[2]) / Math.hypot(rx, ry, 1);
    // The sun disc sets behind the horizon (ry = 0); sunlight() fades its colour and the shafts.
    const disk = ry > 0 && cosine > Math.cos(0.8 * Math.PI / 180) ? 4 : 0;
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
