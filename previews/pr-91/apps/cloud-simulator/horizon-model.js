/* Purpose: Six interleaved terrain/cloud layers colored by atmospheric geometry.
 * Consumers: horizon.js and horizon-model.test.js.
 * Dependencies: atmosphere-model.js and fixed horizon-bitmaps.js; no browser APIs. */
import { EARTH_RADIUS, CAMERA_HEIGHT, altitude, sunDirection, directSunlight,
  skyRadiance, viewTransmission, pointAtAltitude } from "./atmosphere-model.js";
import { cloudBitmaps } from "./horizon-bitmaps.js";
export const defaults = { sunElevation: -1.2, sunAzimuth: -15, cloudAltitude: 3,
  altitudeSpread: 2, distanceScale: 1, airDensity: 1, aerosol: 0.15, exposure: 2, sunSpeed: 0.3 };
export const layerPlan = [
  { type: "terrain", distance: 3, height: 0.45, index: 0 },
  { type: "cloud", distance: 8, offset: -0.7, index: 0 },
  { type: "terrain", distance: 18, height: 1.2, index: 1 },
  { type: "cloud", distance: 30, offset: 0, index: 1 },
  { type: "terrain", distance: 65, height: 2.5, index: 2 },
  { type: "cloud", distance: 90, offset: 0.7, index: 2 }
];
export function cloudHeight(layer, settings) {
  return Math.max(0.15, settings.cloudAltitude + layer.offset * settings.altitudeSpread);
}
function viewRay(x, y, width, height) {
  const scale = Math.tan(20 * Math.PI / 180);
  const horizontal = (2 * (x + 0.5) / width - 1) * scale * width / height;
  const elevation = 5 * Math.PI / 180 + Math.atan((1 - 2 * (y + 0.5) / height) * scale);
  const ray = [horizontal, Math.tan(elevation), 1], length = Math.hypot(...ray);
  return ray.map(v => v / length);
}
function bitmapAlpha(bitmap, u, v) {
  const x = Math.floor(u * bitmap.width), y = Math.floor(v * bitmap.height);
  return x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height ? 0 : bitmap.alpha[y * bitmap.width + x] / 255;
}
export function cloudCenters(options = {}) {
  const settings = { ...defaults, ...options }, sun = sunDirection(settings.sunElevation, settings.sunAzimuth);
  return layerPlan.filter(l => l.type === "cloud").map(layer => {
    const distance = layer.distance * settings.distanceScale, height = cloudHeight(layer, settings);
    const color = directSunlight(pointAtAltitude(distance, height), sun, settings);
    return { distance, height, color, lit: color.some(v => v > 0) };
  });
}
export function renderHorizon(options = {}, width = 128, height = 80) {
  const settings = { ...defaults, ...options }, sun = sunDirection(settings.sunElevation, settings.sunAzimuth);
  // A 64×40 sky calculation is upscaled; cloud/terrain geometry is evaluated at display resolution.
  const skyWidth = 64, skyHeight = 40;
  const sky = Array.from({ length: skyWidth * skyHeight }, (_, i) => skyRadiance(viewRay(i % skyWidth, Math.floor(i / skyWidth), skyWidth, skyHeight), sun, settings));
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ray = viewRay(x, y, width, height), rx = ray[0] / ray[2], ry = ray[1] / ray[2];
    const background = sky[Math.min(skyHeight - 1, Math.floor(y / height * skyHeight)) * skyWidth + Math.min(skyWidth - 1, Math.floor(x / width * skyWidth))];
    let color = background.slice();
    for (let i = layerPlan.length - 1; i >= 0; i--) {
      const layer = layerPlan[i], distance = layer.distance * settings.distanceScale;
      const point = [rx * distance, EARTH_RADIUS + CAMERA_HEIGHT + ry * distance, distance];
      const height = altitude(point);
      let alpha = 0, surface;
      if (layer.type === "cloud") {
        if (height < 0) continue;
        const center = cloudHeight(layer, settings), thickness = 0.5 + settings.altitudeSpread * 0.45;
        const bitmap = cloudBitmaps[layer.index];
        for (let instance = 0; instance < 3; instance++) {
          const shift = [-0.3, 0.2, -0.1][instance] * settings.altitudeSpread;
          alpha = Math.max(alpha, bitmapAlpha(bitmap,
            (point[0] - (instance - 1) * distance * 0.65) / (distance * 0.65) + 0.5,
            0.5 - (height - center - shift) / thickness));
        }
        if (alpha === 0) continue;
        const direct = directSunlight(point, sun, settings);
        surface = direct.map((v, c) => [0.012, 0.018, 0.035][c] + v * (0.9 - 0.35 * alpha));
      } else {
        const shape = 0.5 + 0.3 * Math.sin(point[0] / distance * 9 + layer.index * 2)
          + 0.2 * Math.sin(point[0] / distance * 21 + layer.index);
        const ridge = layer.height * shape;
        if (height > ridge) continue;
        alpha = 1;
        const direct = directSunlight(pointAtAltitude(distance, ridge, point[0]), sun, settings);
        surface = direct.map((v, c) => [0.003, 0.005, 0.009][c] + v * [0.025, 0.03, 0.035][c]);
        // Use the ridge's positive altitude for aerial perspective below its silhouette.
        point[1] = pointAtAltitude(distance, Math.max(0.001, ridge), point[0])[1];
      }
      const transmission = viewTransmission(point, settings);
      color = color.map((v, c) => v * (1 - alpha) + alpha * (surface[c] * transmission[c] + background[c] * (1 - transmission[c])));
    }
    pixels.set([...color.map(v => 255 * Math.pow(1 - Math.exp(-Math.max(0, v) * settings.exposure), 1 / 2.2)), 255], (y * width + x) * 4);
  }
  return pixels;
}
