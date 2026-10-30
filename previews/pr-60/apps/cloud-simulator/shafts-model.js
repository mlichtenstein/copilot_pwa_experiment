/* Purpose: Three fixed cloud sheets, swept sunlight and perspective air scattering.
 * Consumers: shafts.js and shafts-model.test.js. Dependencies: sunset-model.js; no DOM. */
import { createDensity, phase, sunlight } from "./sunset-model.js";
export const defaults = { sunElevation: 12, sunAzimuth: -18, cloudExtinction: 0.35,
  haze: 0.012, g: 0.6, fov: 58, exposure: 1.3, near: 1, middle: 1, far: 1 };
export const layerNames = ["near", "middle", "far"];
export function createScene(seed = 42) {
  // A padded lighting box encloses every supported camera ray and its sunlight path.
  const nx = 128, ny = 80, nz = 24;
  const layers = layerNames.map((name, i) => {
    const width = [32, 64, 96][i], height = [20, 40, 60][i], cellSize = 4;
    const sourceWidth = Math.max(128, width * 2), sourceHeight = Math.max(80, height * 2);
    const source = createDensity(sourceWidth, sourceHeight, (seed + i * 997) >>> 0).density;
    return { name, z: [5, 12, 19][i], width, height, cellSize,
      density: Float64Array.from({ length: width * height }, (_, index) => {
        const x = Math.floor(index % width / width * sourceWidth);
        const y = Math.floor(Math.floor(index / width) / height * sourceHeight);
        return source[y * sourceWidth + x];
      }) };
  });
  const density = new Float32Array(nx * ny * nz);
  for (const layer of layers) for (let y = 0; y < layer.height; y++) for (let x = 0; x < layer.width; x++) {
    const gx = (nx - layer.width) / 2 + x, gy = (ny - layer.height) / 2 + y;
    density[(layer.z * ny + gy) * nx + gx] = layer.density[(layer.height - 1 - y) * layer.width + x];
  }
  return { nx, ny, nz, dx: 4, dy: 4, dz: 4, layers, density, seed };
}
export function sunDirection(settings) {
  const e = settings.sunElevation * Math.PI / 180, a = settings.sunAzimuth * Math.PI / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}
// Bilinear upstream interpolation; outside the box receives unoccluded sunlight.
function planeSample(values, nx, ny, offset, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const at = (u, v) => u < 0 || v < 0 || u >= nx || v >= ny ? 1 : values[offset + v * nx + u];
  return at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy)
    + at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
}
export function sweepSunlight(scene, options = {}) {
  const settings = { ...defaults, ...options }, direction = sunDirection(settings);
  if (direction[2] <= 0) throw new RangeError("Sun must be behind the far boundary (positive z).");
  const { nx, ny, nz, dx, dy, dz } = scene;
  const sigma = new Float32Array(scene.density.length), light = new Float32Array(sigma.length);
  const outgoing = new Float32Array(sigma.length), path = dz / direction[2];
  for (let z = nz - 1; z >= 0; z--) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const i = (z * ny + y) * nx + x;
    const layer = scene.layers.find(layer => layer.z === z);
    sigma[i] = settings.haze + scene.density[i] * settings.cloudExtinction * (layer ? settings[layer.name] : 1);
    const incoming = z === nz - 1 ? 1 : planeSample(outgoing, nx, ny, (z + 1) * nx * ny,
      x + direction[0] * path / dx, y + direction[1] * path / dy);
    light[i] = incoming * Math.exp(-sigma[i] * path / 2);
    outgoing[i] = incoming * Math.exp(-sigma[i] * path);
  }
  return { sigma, light, direction, settings };
}
// Cell-centered trilinear interpolation with clamped edge values inside the box.
export function sampleVolume(scene, values, x, y, z) {
  const { nx, ny, nz, dx, dy, dz } = scene;
  const gx = x / dx + nx / 2 - 0.5, gy = y / dy + ny / 2 - 0.5, gz = z / dz - 0.5;
  if (x < -nx * dx / 2 || x > nx * dx / 2 || y < -ny * dy / 2 || y > ny * dy / 2 || z < 0 || z > nz * dz) return 0;
  const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
  let result = 0;
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const u = Math.max(0, Math.min(nx - 1, ix + i)), v = Math.max(0, Math.min(ny - 1, iy + j)), w = Math.max(0, Math.min(nz - 1, iz + k));
    result += values[(w * ny + v) * nx + u] * (i ? gx - ix : 1 - gx + ix)
      * (j ? gy - iy : 1 - gy + iy) * (k ? gz - iz : 1 - gz + iz);
  }
  return result;
}
export function cameraRay(x, y, width, height, fov) {
  const scale = Math.tan(fov * Math.PI / 360);
  const rx = (2 * (x + 0.5) / width - 1) * scale * width / height;
  const ry = (1 - 2 * (y + 0.5) / height) * scale;
  const length = Math.hypot(rx, ry, 1);
  return [rx / length, ry / length, 1 / length];
}
export function renderShafts(scene, lighting, view = "light", width = 128, height = 80, slice = 12) {
  const { settings, direction, sigma, light } = lighting;
  const sun = sunlight(settings.sunElevation, 0.12), pixels = new Uint8ClampedArray(width * height * 4);
  const display = value => 255 * Math.pow(1 - Math.exp(-Math.max(0, value) * settings.exposure), 1 / 2.2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let rgb = [0, 0, 0];
    if (view === "slice" || layerNames.includes(view)) {
      let v;
      if (view === "slice") {
        const gx = Math.min(scene.nx - 1, Math.floor(x / width * scene.nx));
        const gy = scene.ny - 1 - Math.min(scene.ny - 1, Math.floor(y / height * scene.ny));
        v = light[(slice * scene.ny + gy) * scene.nx + gx];
      } else {
        const layer = scene.layers.find(layer => layer.name === view);
        const gx = Math.min(layer.width - 1, Math.floor(x / width * layer.width));
        const gy = Math.min(layer.height - 1, Math.floor(y / height * layer.height));
        v = layer.density[gy * layer.width + gx] / 2;
      }
      rgb = [v * 255, v * 255, v * 255];
    } else {
      const ray = cameraRay(x, y, width, height, settings.fov);
      const cosine = ray.reduce((sum, v, i) => sum + v * direction[i], 0);
      const airPhase = 4 * Math.PI * phase(cosine, settings.g);
      const cloudPhase = 4 * Math.PI * phase(cosine, 0.45);
      const ds = scene.dz / ray[2];
      let cameraT = 1;
      for (let z = 0; z < scene.nz; z++) {
        const depth = (z + 0.5) * scene.dz, distance = (depth + 12) / ray[2];
        const px = ray[0] * distance, py = ray[1] * distance;
        const extinction = sampleVolume(scene, sigma, px, py, depth);
        if (extinction === 0) continue;
        const sunlightT = sampleVolume(scene, light, px, py, depth);
        const cloudSigma = Math.max(0, extinction - settings.haze);
        const segmentT = Math.exp(-extinction * ds);
        for (let c = 0; c < 3; c++) {
          const scattering = settings.haze * airPhase * [0.65, 0.9, 1.3][c]
            + (view === "air" ? 0 : cloudSigma * 0.95 * cloudPhase);
          rgb[c] += cameraT * (1 - segmentT) * scattering / extinction * sunlightT * sun[c];
        }
        cameraT *= segmentT;
      }
      if (view !== "air") {
        const disk = cosine > Math.cos(0.8 * Math.PI / 180) ? 4 : 0;
        const horizon = Math.exp(-Math.abs(ray[1]) * 6);
        for (let c = 0; c < 3; c++) rgb[c] += cameraT * ([0.035, 0.065, 0.14][c] + sun[c] * (disk + horizon * 0.09));
      }
      rgb = rgb.map(display);
    }
    pixels.set([...rgb, 255], (y * width + x) * 4);
  }
  return pixels;
}
