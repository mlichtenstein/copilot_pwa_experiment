/* Purpose: Convert decoded source photos into color-free cloud opacity and shading fields.
 * Consumers: valley.js and valley-model.test.js. Dependencies: none; operates on RGBA bytes. */
const clamp = v => Math.max(0, Math.min(1, v));
function feather(low, high, value) {
  const t = clamp((value - low) / (high - low)); return t * t * (3 - 2 * t);
}
export function decodeCloudTexture(rgba, width, height, profile) {
  const pixels = new Float32Array(width * height), shading = profile ? new Float32Array(width * height) : undefined;
  for (let i = 0; i < pixels.length; i++) {
    const r = rgba[i * 4] / 255, g = rgba[i * 4 + 1] / 255, b = rgba[i * 4 + 2] / 255;
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Source-specific soft mattes, not general semantic cloud recognition.
    // Rose: reject blue clear-sky gaps. Embers: keep dark cloud banks, reject red-bright sky.
    const cloud = profile === "rose" ? 1 - feather(0.015, 0.12, b - r)
      : profile === "embers" ? 1 - feather(0.35, 0.7, r) : (r + g + b) / 3;
    pixels[i] = cloud * rgba[i * 4 + 3] / 255;
    if (shading) shading[i] = gray;
  }
  // RGB is deliberately not retained: only scalar opacity and grayscale shading reach the renderer.
  return { width, height, pixels, shading, mirrored: Boolean(profile) };
}
