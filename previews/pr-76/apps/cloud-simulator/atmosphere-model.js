/* Purpose: Coarse spherical-atmosphere optical paths and single-scattered sky color.
 * Consumers: horizon-model.js and atmosphere-model.test.js. Dependencies: none; distances in km. */
export const EARTH_RADIUS = 6371, ATMOSPHERE_RADIUS = 6471, CAMERA_HEIGHT = 0.15;
const RAYLEIGH = [0.0058, 0.0135, 0.0331];
export const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const at = (point, direction, distance) => point.map((v, i) => v + direction[i] * distance);
export function altitude(point) { return Math.hypot(...point) - EARTH_RADIUS; }
export function sunDirection(elevation, azimuth) {
  const e = elevation * Math.PI / 180, a = azimuth * Math.PI / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}
export function earthBlocks(point, direction) {
  const b = dot(point, direction);
  return b < 0 && dot(point, point) - b * b < EARTH_RADIUS * EARTH_RADIUS;
}
function shellExit(point, direction) {
  const b = dot(point, direction);
  return -b + Math.sqrt(Math.max(0, b * b + ATMOSPHERE_RADIUS ** 2 - dot(point, point)));
}
export function opticalDepth(point, direction, distance, settings, samples = 16) {
  let molecules = 0, aerosols = 0;
  // More samples near the start resolve low-altitude density without a fine 3D grid.
  for (let i = 0; i < samples; i++) {
    const a = distance * (i / samples) ** 2, b = distance * ((i + 1) / samples) ** 2;
    const h = Math.max(0, altitude(at(point, direction, (a + b) / 2)));
    molecules += Math.exp(-h / 8) * (b - a);
    aerosols += Math.exp(-h / 1.2) * (b - a);
  }
  return RAYLEIGH.map(beta => settings.airDensity * (beta * molecules + settings.aerosol * 0.02 * aerosols));
}
export function directSunlight(point, direction, settings) {
  if (earthBlocks(point, direction)) return [0, 0, 0];
  return opticalDepth(point, direction, shellExit(point, direction), settings).map(tau => Math.exp(-tau));
}
export function pointAtAltitude(distance, height, lateral = 0) {
  return [lateral, Math.sqrt((EARTH_RADIUS + height) ** 2 - distance ** 2 - lateral ** 2), distance];
}
export function viewTransmission(point, settings) {
  const camera = [0, EARTH_RADIUS + CAMERA_HEIGHT, 0];
  const delta = point.map((v, i) => v - camera[i]), distance = Math.hypot(...delta);
  return opticalDepth(camera, delta.map(v => v / distance), distance, settings).map(tau => Math.exp(-tau));
}
export function skyRadiance(ray, sun, settings) {
  const camera = [0, EARTH_RADIUS + CAMERA_HEIGHT, 0];
  if (earthBlocks(camera, ray)) return [0.002, 0.003, 0.005];
  const distance = shellExit(camera, ray), color = [0.001, 0.002, 0.006], tau = [0, 0, 0];
  const cosine = dot(ray, sun), rayleighPhase = 3 / (16 * Math.PI) * (1 + cosine * cosine);
  const miePhase = (1 - 0.7 ** 2) / (4 * Math.PI * (1 + 0.7 ** 2 - 1.4 * cosine) ** 1.5);
  for (let i = 0; i < 12; i++) {
    const a = distance * (i / 12) ** 2, b = distance * ((i + 1) / 12) ** 2, ds = b - a;
    const point = at(camera, ray, (a + b) / 2), h = Math.max(0, altitude(point));
    const density = Math.exp(-h / 8), haze = settings.aerosol * 0.02 * Math.exp(-h / 1.2);
    const direct = directSunlight(point, sun, settings);
    for (let c = 0; c < 3; c++) {
      const extinction = settings.airDensity * (RAYLEIGH[c] * density + haze);
      color[c] += Math.exp(-tau[c] - extinction * ds / 2) * direct[c]
        * settings.airDensity * (RAYLEIGH[c] * density * rayleighPhase + haze * miePhase) * ds * 18;
      tau[c] += extinction * ds;
    }
  }
  if (cosine > Math.cos(0.55 * Math.PI / 180)) {
    const direct = directSunlight(camera, sun, settings);
    for (let c = 0; c < 3; c++) color[c] += direct[c] * 5;
  }
  return color;
}
