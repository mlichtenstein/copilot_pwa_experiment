/* Purpose: Animate fixed cloud texture sampling and soft reveal fields over a valley.
 * Consumers: valley.js and valley-model.test.js. Dependencies: none; no DOM or image decoding. */
export const defaults = { wind: 4, formationSpeed: 0.3, cloudY: 0.46,
  bandWidth: 0.32, coverage: 0.7, maskSoftness: 0.16, mountainClearance: 0.06, textureScale: 1.1, opacity: 1.4 };
export const textureOptions = [
  { id: "bank", name: "Soft bank", file: "textures/FX_CloudAlpha01.jpg" },
  { id: "broken", name: "Broken puffs", file: "textures/FX_CloudAlpha06.jpg" },
  { id: "veil", name: "Thin veil", file: "textures/FX_CloudAlpha08.jpg" }
];
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export function smoothstep(low, high, value) {
  const t = high === low ? (value >= high ? 1 : 0) : clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
}
export function mountainRidge(x, layer) {
  const width = [0.58, 0.48, 0.4][layer];
  return [0.36, 0.31, 0.27][layer] + [0.45, 0.57, 0.7][layer] * Math.exp(-((x / width) ** 2))
    + 0.025 * Math.sin(x * 11 + layer * 2) + 0.012 * Math.sin(x * 27 - layer);
}
export function sampleTexture(texture, u, v) {
  if (v < 0 || v > 1) return 0;
  u = ((u % 1) + 1) % 1;
  const x = Math.min(texture.width - 1, Math.floor(u * texture.width));
  const y = Math.min(texture.height - 1, Math.floor(v * texture.height));
  return texture.pixels[y * texture.width + x];
}
export function revealFields(x, y, time, options = {}, shape = "combined", layer = 0) {
  const s = { ...defaults, ...options }, ridge = mountainRidge(x, layer);
  const clearance = smoothstep(0, s.mountainClearance, ridge - y);
  const center = s.cloudY + layer * 0.045;
  const band = Math.exp(-Math.pow((y - center) / Math.max(0.03, s.bandWidth), 4));
  const phase = time * s.formationSpeed;
  // These broad gradients control visibility only; fine cloud detail comes from the bitmap.
  const ribbon = 0.5 + 0.28 * Math.sin(x * 2.8 - phase * 0.13 + layer)
    + 0.22 * Math.cos(y * 5 + phase * 0.09);
  const cx = 0.48 * Math.sin(phase * 0.12 + layer), cy = center + 0.1 * Math.sin(phase * 0.17);
  const pockets = Math.exp(-(((x - cx) / 0.65) ** 2) - ((y - cy) / 0.32) ** 2);
  const field = shape === "ribbon" ? ribbon : shape === "pockets" ? pockets : (ribbon + pockets) / 2;
  const threshold = 1 - s.coverage;
  const formation = s.coverage <= 0 ? 0 : s.coverage >= 1 ? 1 : smoothstep(threshold - s.maskSoftness, threshold + s.maskSoftness, field);
  return { clearance, band, formation, mask: clearance * band * formation };
}
export function renderValley(texture, time = 0, options = {}, shape = "combined", width = 192, height = 120) {
  const s = { ...defaults, ...options }, pixels = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const x = 2 * (px + 0.5) / width - 1, y = (py + 0.5) / height;
    const horizon = Math.pow(y, 1.8);
    let color = [0.19 + 0.62 * horizon, 0.26 + 0.32 * horizon, 0.43 - 0.07 * horizon];
    const sun = Math.exp(-(((x + 0.18) / 0.1) ** 2) - ((y - 0.6) / 0.065) ** 2);
    color = color.map((v, c) => v + sun * [0.35, 0.23, 0.08][c]);
    for (let layer = 0; layer < 3; layer++) {
      const ridge = mountainRidge(x, layer);
      if (y >= ridge) {
        const slope = mountainRidge(x + 0.015, layer) - ridge;
        const light = clamp(0.5 + slope * 12);
        color = [[0.22, 0.25, 0.34], [0.13, 0.17, 0.24], [0.055, 0.095, 0.14]][layer].map(v => v * (0.8 + light * 0.35));
        // A narrow reflected river threads the central valley floor.
        if (layer === 2 && Math.abs(x - 0.015 * Math.sin(y * 25)) < 0.006 + Math.max(0, y - 0.8) * 0.02 && y > 0.8) color = [0.46, 0.45, 0.4];
      }
      const fields = revealFields(x, y, time, s, shape, layer);
      if (fields.mask < 0.001) continue;
      const u = (x + 1) * 0.5 * s.textureScale - time * s.wind / 192 * [0.5, 0.75, 1][layer] + layer * 0.27;
      const v = (y - s.cloudY - layer * 0.045) / (0.55 / s.textureScale) + 0.5;
      const detail = sampleTexture(texture, u, v);
      const alpha = clamp(detail * s.opacity * fields.mask);
      const tint = [0.92 - detail * 0.28, 0.8 - detail * 0.3, 0.72 - detail * 0.22];
      color = color.map((value, c) => value * (1 - alpha) + tint[c] * alpha);
    }
    pixels.set([...color.map(v => clamp(v) * 255), 255], (py * width + px) * 4);
  }
  return pixels;
}
