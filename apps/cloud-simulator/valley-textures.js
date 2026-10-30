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
  return { width, height, pixels, shading, kind: profile ? "photo" : "brush" };
}

export function makeWrappingPhoto(texture, overlapFraction = 0.18) {
  if (texture.width < 3) return { ...texture, kind: "photo", wrapX: true };
  const overlap = Math.max(1, Math.min(Math.floor(texture.width / 3), Math.round(texture.width * overlapFraction)));
  const width = texture.width - overlap, height = texture.height;
  const pixels = new Float32Array(width * height), shading = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = y * texture.width + x + overlap, b = y * texture.width + x - (width - overlap);
    let t = x >= width - overlap ? (x - (width - overlap) + 0.5) / overlap : 0;
    t = t * t * (3 - 2 * t);
    const alphaA = texture.pixels[a], alphaB = t > 0 ? texture.pixels[b] : 0;
    const alpha = alphaA * (1 - t) + alphaB * t, i = y * width + x;
    pixels[i] = alpha;
    shading[i] = alpha > 0 ? ((texture.shading?.[a] ?? 1 - alphaA) * alphaA * (1 - t)
      + (t > 0 ? texture.shading?.[b] ?? 1 - alphaB : 0) * alphaB * t) / alpha : 0;
  }
  return { ...texture, width, pixels, shading, kind: "photo", wrapX: true };
}
