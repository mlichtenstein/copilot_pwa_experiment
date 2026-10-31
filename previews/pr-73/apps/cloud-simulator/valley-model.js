/* Purpose: Animate fixed cloud texture sampling and soft reveal fields over a valley.
 * Consumers: valley.js and valley-model.test.js. Dependencies: valley-noise.js, valley-sampling.js; no DOM or image decoding. */
import { cloudSampler } from "./valley-sampling.js";
import { perlin3 } from "./valley-noise.js";
export const defaults = { wind: 4, formationSpeed: 0.3, cloudY: 0.46,
  bandWidth: 0.32, coverage: 0.55, maskSoftness: 0.16, windwardClearance: 0.025, leewardClearance: 0.09, textureScale: 1.1, opacity: 1.4, textureBlend: 0, noiseScale: 3, noiseDrift: 0.2 };
export const textureOptions = [
  { id: "rose", name: "Sculpted bank · photo mask", file: "textures/sunset-rose.jpg", profile: "rose" },
  { id: "embers", name: "Layered wisps · photo mask", file: "textures/sunset-embers.jpg", profile: "embers" },
  { id: "billow", name: "Billowy bank", file: "textures/FX_CloudAlpha03.jpg" },
  { id: "cloudlets", name: "Scattered cloudlets", file: "textures/FX_CloudAlpha05.jpg" },
  { id: "curls", name: "Wispy curls", file: "textures/FX_CloudAlpha09.jpg" },
  { id: "bank", name: "Soft bank", file: "textures/FX_CloudAlpha01.jpg" },
  { id: "broken", name: "Broken puffs", file: "textures/FX_CloudAlpha06.jpg" },
  { id: "veil", name: "Thin veil", file: "textures/FX_CloudAlpha08.jpg" }
];
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export function smoothstep(low, high, value) {
  const t = high === low ? (value >= high ? 1 : 0) : clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
}
export function mountainRidge(x, layer, horizon = "valley") {
  if (horizon === "open") return 0.92 + layer * 0.018;
  if (horizon === "hills") return 0.78 + layer * 0.055 + 0.035 * Math.sin(x * 4 + layer) + 0.015 * Math.cos(x * 11 - layer);
  const width = [0.58, 0.48, 0.4][layer];
  return [0.36, 0.31, 0.27][layer] + [0.45, 0.57, 0.7][layer] * Math.exp(-((x / width) ** 2))
    + 0.025 * Math.sin(x * 11 + layer * 2) + 0.012 * Math.sin(x * 27 - layer);
}
function visibleRidge(x, horizon) {
  return Math.min(...[0, 1, 2].map(layer => mountainRidge(x, layer, horizon)));
}
export function terrainProfile(x, options = {}) {
  const s = { ...defaults, ...options }, ridge = visibleRidge(x, s.horizon);
  const layer = [0, 1, 2].find(i => mountainRidge(x, i, s.horizon) === ridge);
  // Classify the broad hillside, not small decorative ridge ripples that produce spikes.
  const hillWidth = [0.58, 0.48, 0.4][layer], height = [0.45, 0.57, 0.7][layer];
  const rise = s.horizon === "open" ? 0 : s.horizon === "hills" ? -0.14 * Math.cos(x * 4 + layer)
    : 2 * x * height / (hillWidth * hillWidth) * Math.exp(-((x / hillWidth) ** 2));
  // All clouds use the visible terrain envelope: hidden ridges cannot punch floating holes.
  const facing = rise * Math.sign(s.wind);
  const windward = smoothstep(0, 0.15, facing), leeward = smoothstep(0, 0.15, -facing);
  const width = windward * s.windwardClearance + leeward * s.leewardClearance;
  return { ridge, width, windward, leeward };
}
export function revealFields(x, y, time, options = {}, shape = "combined", layer = 0, noiseValue, terrain) {
  const s = { ...defaults, ...options };
  const { ridge, width } = terrain ?? terrainProfile(x, s, layer);
  const clearance = y >= ridge ? 0 : width > 0 ? smoothstep(0, width, ridge - y) : 1;
  const center = layerCenter(s, layer);
  const band = s.placement === "full" ? 1 : Math.exp(-Math.pow((y - center) / Math.max(0.03, s.bandWidth), 4));
  const phase = time * s.formationSpeed;
  // These broad gradients control visibility only; fine cloud detail comes from the bitmap.
  const ribbon = 0.5 + 0.28 * Math.sin(x * 2.8 - phase * 0.13 + layer)
    + 0.22 * Math.cos(y * 5 + phase * 0.09);
  const cx = 0.48 * Math.sin(phase * 0.12 + layer), cy = center + 0.1 * Math.sin(phase * 0.17);
  const pockets = Math.exp(-(((x - cx) / 0.65) ** 2) - ((y - cy) / 0.32) ** 2);
  const field = shape === "noise" ? (noiseValue ?? noiseProduct(x, y, time, s, layer)) : shape === "ribbon" ? ribbon : shape === "pockets" ? pockets : (ribbon + pockets) / 2;
  const threshold = (1 - s.coverage) * (shape === "noise" ? 0.5 : 1);
  const formation = s.coverage <= 0 ? 0 : s.coverage >= 1 ? 1 : smoothstep(threshold - s.maskSoftness, threshold + s.maskSoftness, field);
  return { clearance, band, formation, mask: clearance * band * formation };
}
function noiseProduct(x, y, time, s, layer) {
  const phase = time * s.formationSpeed;
  const a = perlin3(x * s.noiseScale - phase * s.noiseDrift, y * s.noiseScale, phase * 0.17 + layer * 2.31, 73);
  const b = perlin3(x * s.noiseScale * 1.7 + phase * s.noiseDrift, y * s.noiseScale * 1.7 + 13.7, -phase * 0.11 + layer * 3.17, 911);
  return a * b;
}
// Evaluate the broad reveal field on a small grid, then interpolate; bitmap detail stays native.
function noiseGrid(time, s, layer) {
  const width = 33, height = 21, values = new Float32Array(width * height);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) values[j * width + i] = noiseProduct(2 * i / (width - 1) - 1, j / (height - 1), time, s, layer);
  return (x, y) => {
    const u = clamp((x + 1) / 2) * (width - 1), v = clamp(y) * (height - 1);
    const i = Math.min(width - 2, Math.floor(u)), j = Math.min(height - 2, Math.floor(v)), fx = u - i, fy = v - j;
    return (values[j * width + i] * (1 - fx) + values[j * width + i + 1] * fx) * (1 - fy)
      + (values[(j + 1) * width + i] * (1 - fx) + values[(j + 1) * width + i + 1] * fx) * fy;
  };
}
function layerCenter(s, layer) {
  const base = s.placement === "high" ? 0.2 : s.placement === "low" ? 0.72 : s.cloudY;
  return s.placement === "spread" ? [0.18, 0.43, 0.7][layer] + s.cloudY - defaults.cloudY : base + layer * 0.045;
}
export function mixCloudSamples(a, b, amount) {
  const t = clamp(amount), alpha = a.alpha * (1 - t) + b.alpha * t;
  return { alpha, shade: alpha > 0 ? (a.shade * a.alpha * (1 - t) + b.shade * b.alpha * t) / alpha : 0 };
}
export function renderValley(texture, time = 0, options = {}, shape = "combined", width = 192, height = 120, textureB = texture) {
  const s = { ...defaults, ...options }, pixels = new Uint8ClampedArray(width * height * 4);
  const grids = shape === "noise" ? [0, 1, 2].map(layer => noiseGrid(time, s, layer)) : [];
  const terrain = Array.from({ length: width }, (_, px) => terrainProfile(2 * (px + 0.5) / width - 1, s));
  const samplersA = [0, 1, 2].map(layer => cloudSampler(texture, time, s, layer, width, height));
  const samplersB = s.textureBlend > 0 && textureB !== texture ? [0, 1, 2].map(layer => cloudSampler(textureB, time, s, layer, width, height)) : samplersA;
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const x = 2 * (px + 0.5) / width - 1, y = (py + 0.5) / height;
    const horizon = Math.pow(y, 1.8);
    let color = [0.19 + 0.62 * horizon, 0.26 + 0.32 * horizon, 0.43 - 0.07 * horizon];
    const sun = Math.exp(-(((x + 0.18) / 0.1) ** 2) - ((y - 0.6) / 0.065) ** 2);
    color = color.map((v, c) => v + sun * [0.35, 0.23, 0.08][c]);
    for (let layer = 0; layer < 3; layer++) {
      const fields = revealFields(x, y, time, s, shape, layer, grids[layer]?.(x, y), terrain[px]);
      if (fields.mask < 0.001) continue;
      const a = samplersA[layer](px, py);
      const mixed = s.textureBlend <= 0 || textureB === texture ? a : mixCloudSamples(a, samplersB[layer](px, py), s.textureBlend);
      const alpha = clamp(mixed.alpha * s.opacity * fields.mask), shade = mixed.shade;
      // Existing renderer palette owns color; photographs supply only scalar shading/opacity.
      const tint = [0.64 + shade * 0.28, 0.5 + shade * 0.3, 0.5 + shade * 0.22];
      color = color.map((value, c) => value * (1 - alpha) + tint[c] * alpha);
    }
    // Terrain is the final silhouette; clouds and their clearance share this same boundary.
    for (let layer = 0; layer < 3; layer++) {
      const ridge = mountainRidge(x, layer, s.horizon);
      if (y >= ridge) {
        const slope = mountainRidge(x + 0.015, layer, s.horizon) - ridge;
        const light = clamp(0.5 + slope * 12);
        color = [[0.22, 0.25, 0.34], [0.13, 0.17, 0.24], [0.055, 0.095, 0.14]][layer].map(v => v * (0.8 + light * 0.35));
        // A narrow reflected river threads the central valley floor.
        if (s.horizon !== "open" && layer === 2 && Math.abs(x - 0.015 * Math.sin(y * 25)) < 0.006 + Math.max(0, y - 0.8) * 0.02 && y > 0.8) color = [0.46, 0.45, 0.4];
      }
    }
    pixels.set([...color.map(v => clamp(v) * 255), 255], (py * width + px) * 4);
  }
  return pixels;
}
