/* Purpose: Sample a seamlessly edge-blended photographic sky strip or rasterize stable varied cloud-brush stamps.
 * Consumers: valley-model.js and valley-model.test.js. Dependencies: none; scalar texture fields. */
const clamp = v => Math.max(0, Math.min(1, v));
function random(x, y, seed, channel) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177) ^ Math.imul(channel, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function texel(texture, u, v) {
  // No wrap or mirror: samples outside an image are transparent.
  if (u < 0 || u > 1 || v < 0 || v > 1) return { alpha: 0, shade: 0 };
  const i = Math.min(texture.height - 1, Math.floor(v * texture.height)) * texture.width + Math.min(texture.width - 1, Math.floor(u * texture.width));
  const alpha = texture.pixels[i];
  return { alpha, shade: texture.shading ? texture.shading[i] : 1 - alpha };
}
export function photoCoordinates(x, y, time, options, aspect = 1.6, viewAspect = 1.6) {
  const zoom = Math.max(1, options.textureScale), cropU = Math.min(1, viewAspect / aspect) / zoom;
  const cropV = Math.min(1, aspect / viewAspect) / zoom;
  // Back-plane wind rate matches brush layer 0; source coordinates keep moving forever.
  return { u: cropU * (x + 1) / 2 + (1 - cropU) / 2 - time * options.wind / 192 * 0.5 * cropU,
    v: cropV * y + (1 - cropV) / 2 };
}
export function wrappedPhotoTexel(texture, u, v) {
  if (v < 0 || v > 1) return { alpha: 0, shade: 0 };
  // Interpolate premultiplied fields across the last/first pixel as well as ordinary pixels.
  const x = (((u % 1) + 1) % 1) * texture.width - 0.5, left = Math.floor(x), t = x - left;
  const row = Math.min(texture.height - 1, Math.floor(v * texture.height)) * texture.width;
  const a = row + ((left % texture.width) + texture.width) % texture.width, b = row + (left + 1 + texture.width) % texture.width;
  const alphaA = texture.pixels[a], alphaB = texture.pixels[b], alpha = alphaA * (1 - t) + alphaB * t;
  const shadeA = texture.shading?.[a] ?? 1 - alphaA, shadeB = texture.shading?.[b] ?? 1 - alphaB;
  return { alpha, shade: alpha > 0 ? (shadeA * alphaA * (1 - t) + shadeB * alphaB * t) / alpha : 0 };
}
export function brushStamps(time, options, layer, salt = 0) {
  const scale = options.textureScale, cw = 0.8 / scale, ch = 0.42 / scale;
  const drift = time * options.wind / 96 * [0.5, 0.75, 1][layer];
  const seed = (options.brushSeed ?? 1) + layer * 733 + salt;
  const stamps = [];
  for (let row = Math.floor(-ch / ch) - 1; row <= Math.ceil((1 + ch) / ch) + 1; row++) {
    for (let col = Math.floor((-1 - drift) / cw) - 2; col <= Math.ceil((1 - drift) / cw) + 2; col++) {
      const r = channel => random(col, row, seed, channel);
      stamps.push({ id: `${col}:${row}`, x: (col + 0.5 + (r(1) - 0.5) * 0.65) * cw + drift,
        y: (row + 0.5 + (r(2) - 0.5) * 0.65) * ch, width: cw * (0.85 + r(3) * 0.65),
        height: ch * (0.8 + r(4) * 0.65), flipX: r(5) < 0.5, flipY: r(6) < 0.5,
        angle: (r(7) - 0.5) * 0.4, opacity: 0.65 + r(8) * 0.35 });
    }
  }
  return stamps;
}
export function cloudSampler(texture, time, options, layer, width, height) {
  if (texture.kind === "photo") {
    if (layer !== 0) return () => ({ alpha: 0, shade: 0 });
    return (px, py) => {
      const uv = photoCoordinates(2 * (px + 0.5) / width - 1, (py + 0.5) / height, time, options, texture.width / texture.height, width / height);
      return wrappedPhotoTexel(texture, uv.u, uv.v);
    };
  }
  const alpha = new Float32Array(width * height), premultiplied = new Float32Array(width * height);
  for (const stamp of brushStamps(time, options, layer, texture.seed ?? 0)) {
    const cos = Math.cos(stamp.angle), sin = Math.sin(stamp.angle);
    const rx = (Math.abs(cos) * stamp.width + Math.abs(sin) * stamp.height) / 2;
    const ry = (Math.abs(sin) * stamp.width + Math.abs(cos) * stamp.height) / 2;
    const left = Math.max(0, Math.floor((stamp.x - rx + 1) * width / 2)), right = Math.min(width - 1, Math.ceil((stamp.x + rx + 1) * width / 2));
    const top = Math.max(0, Math.floor((stamp.y - ry) * height)), bottom = Math.min(height - 1, Math.ceil((stamp.y + ry) * height));
    for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
      const dx = 2 * (px + 0.5) / width - 1 - stamp.x, dy = (py + 0.5) / height - stamp.y;
      let u = (cos * dx + sin * dy) / stamp.width + 0.5, v = (-sin * dx + cos * dy) / stamp.height + 0.5;
      if (stamp.flipX) u = 1 - u; if (stamp.flipY) v = 1 - v;
      const sample = texel(texture, u, v), a = sample.alpha * stamp.opacity, i = py * width + px;
      // Alpha-over in stable cell order, retaining premultiplied grayscale shading.
      premultiplied[i] = sample.shade * a + premultiplied[i] * (1 - a);
      alpha[i] = a + alpha[i] * (1 - a);
    }
  }
  return (px, py) => { const i = py * width + px; return { alpha: alpha[i], shade: alpha[i] > 0 ? premultiplied[i] / alpha[i] : 0 }; };
}
