/* Purpose: Fixed droplet fields and single-scattered sunset light, independent of GUI.
 * Consumers: sunset.js and sunset-model.test.js.
 * Dependencies: randomFromSeed in simulation.js; no browser APIs. */
import { randomFromSeed } from "./simulation.js";

export const defaults = { sunAngle: 24, extinction: 0.12, slabDepth: 12,
  albedo: 0.95, g: 0.55, airOpticalDepth: 0.12, ambient: 0.035, exposure: 1.4 };
export const transmittance = tau => Math.exp(-tau);
// cosTheta compares light propagation with the outgoing direction toward camera.
export function phase(cosTheta, g) {
  return (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * cosTheta, 1.5));
}
export function sunlight(sunAngle, airOpticalDepth) {
  const elevation = Math.sin(sunAngle * Math.PI / 180);
  const airMass = 1 / Math.max(0.04, elevation);
  // RGB proxies for wavelength^-4 Rayleigh extinction, not spectral integration.
  const visibility = Math.max(0, Math.min(1, 1 + elevation / 0.08));
  return [0.35, 0.75, 1.6].map(beta => visibility * Math.exp(-airOpticalDepth * beta * airMass));
}
export function createDensity(width = 128, height = 80, seed = 42) {
  const random = randomFromSeed(seed);
  const blobs = Array.from({ length: 32 }, () => ({ x: random() * width,
    y: height * (0.15 + random() * 0.48), rx: 5 + random() * 18, ry: 2 + random() * 6 }));
  const density = Float64Array.from({ length: width * height }, (_, i) => {
    const x = i % width, y = Math.floor(i / width);
    const sum = blobs.reduce((total, b) => total + Math.exp(-2 * (((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2)), 0);
    return Math.min(2, Math.max(0, sum - 0.28));
  });
  return { width, height, density };
}
function sample(field, x, y) {
  const { width, height, density } = field;
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return 0;
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  return density[iy * width + ix] * (1 - fx) * (1 - fy)
    + density[iy * width + ix + 1] * fx * (1 - fy)
    + density[(iy + 1) * width + ix] * (1 - fx) * fy
    + density[(iy + 1) * width + ix + 1] * fx * fy;
}
export function renderSunset(field, options = {}, view = "light") {
  const settings = { ...defaults, ...options };
  const { sunAngle, extinction, slabDepth, albedo, g, airOpticalDepth, ambient, exposure } = settings;
  const { width, height, density } = field;
  const angle = sunAngle * Math.PI / 180;
  // Orthographic camera looks along +z. The distant sun is behind the slab (+z).
  const direction = [Math.cos(angle) * 0.8, -Math.sin(angle) * 0.8, 0.6];
  const direct = sunlight(sunAngle, airOpticalDepth);
  const phaseWeight = phase(direction[2], g) * 4 * Math.PI;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const sunX = width * (0.5 + 0.44 * Math.cos(angle));
  const sunY = height * (0.86 - 0.78 * Math.sin(angle));
  for (let i = 0; i < density.length; i++) {
    const x = i % width, y = Math.floor(i / width);
    const rho = density[i];
    const cameraT = transmittance(rho * extinction * slabDepth);
    let scattered = 0, meanSunT = 0;
    // Midpoint quadrature through an extruded slab: six camera samples, eight sun samples.
    for (let slice = 0; slice < 6; slice++) {
      const z = slabDepth * (slice + 0.5) / 6;
      const sunDistance = (slabDepth - z) / direction[2];
      let tau = 0;
      for (let j = 0; j < 8; j++) {
        const distance = sunDistance * (j + 0.5) / 8;
        tau += sample(field, x + direction[0] * distance, y + direction[1] * distance) * extinction * sunDistance / 8;
      }
      const sunT = transmittance(tau);
      meanSunT += sunT / 6;
      scattered += transmittance(rho * extinction * z) * sunT * rho * extinction * albedo * slabDepth / 6;
    }
    const horizon = y / height;
    const daylight = Math.max(0, Math.sin(angle));
    const disk = Math.hypot(x - sunX, y - sunY) < 2.2 && horizon < 0.86;
    let rgb;
    if (view !== "light") {
      const v = view === "density" ? Math.min(1, rho / 2) : view === "camera" ? cameraT : meanSunT;
      rgb = [v, v, v];
    } else {
      // A deliberately simple clear-sky backdrop; cloud contribution follows transport above.
      const sky = [0.12 + horizon * 0.35, 0.23 + horizon * 0.15, 0.46 - horizon * 0.18];
      rgb = sky.map((channel, c) => {
        const background = horizon >= 0.86 ? 0.008 : channel * (0.16 + daylight * 0.84) + direct[c] * (disk ? 5 : Math.pow(horizon, 5) * 0.35);
        const light = cameraT * background + scattered * direct[c] * phaseWeight + ambient * (1 - cameraT);
        // Exposure, exponential tone mapping, approximate display gamma.
        return Math.pow(1 - Math.exp(-light * exposure), 1 / 2.2);
      });
    }
    pixels.set([...rgb.map(v => v * 255), 255], i * 4);
  }
  return pixels;
}
