/* Purpose: Deterministic continuous 3D gradient (Perlin) noise for evolving reveal fields.
 * Consumers: valley-model.js and tests. Dependencies: none. */
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a, b, t) => a + (b - a) * t;
function hash(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0;
}
function gradient(h, x, y, z) {
  h &= 15;
  const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
export function perlin3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  x -= ix; y -= iy; z -= iz;
  const u = fade(x), v = fade(y), w = fade(z), planes = [];
  for (let dz = 0; dz < 2; dz++) {
    const rows = [];
    for (let dy = 0; dy < 2; dy++) rows.push(mix(
      gradient(hash(ix, iy + dy, iz + dz, seed), x, y - dy, z - dz),
      gradient(hash(ix + 1, iy + dy, iz + dz, seed), x - 1, y - dy, z - dz), u));
    planes.push(mix(rows[0], rows[1], v));
  }
  return Math.max(0, Math.min(1, 0.5 + 0.5 * mix(planes[0], planes[1], w)));
}
