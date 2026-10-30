/* Purpose: Screen-space visibility polygons and the layered light composition strategy.
 * Consumers: shafts.js and visibility-model.test.js.
 * Dependencies: shafts-model.js for shared fields/settings; sunset-model.js for sun color. */
import { defaults, sharpenDensity, sampleCloud, sunDirection } from "./shafts-model.js";
import { sunlight } from "./sunset-model.js";
export const visibilityDefaults = { sourceRadius: 6 };
const SCALE = Math.tan(58 * Math.PI / 360);
export function projectPoint(x, y, depth, width, height) {
  return [(x / ((depth + 12) * SCALE * width / height) + 1) * width / 2,
    (1 - y / ((depth + 12) * SCALE)) * height / 2];
}
export function projectedSun(settings, width, height) {
  const direction = sunDirection(settings);
  return [(direction[0] / direction[2] / (SCALE * width / height) + 1) * width / 2,
    (1 - direction[1] / direction[2] / SCALE) * height / 2];
}
export function thresholdMask(layer, settings) {
  return Uint8Array.from(layer.density, density => settings.cloudOpacity * sharpenDensity(density, settings.cloudSharpness) >= 0.5 ? 1 : 0);
}
// Only exterior/hole boundary edges survive. Adjacent collinear edges form one segment.
export function silhouetteSegments(layer, mask, width, height) {
  const segments = [], { cellSize, depth } = layer;
  const occupied = (x, y) => x >= 0 && y >= 0 && x < layer.width && y < layer.height && mask[y * layer.width + x] !== 0;
  const point = (x, y) => projectPoint((x - layer.width / 2) * cellSize, (layer.height / 2 - y) * cellSize, depth, width, height);
  for (let y = 0; y <= layer.height; y++) {
    let start = -1;
    for (let x = 0; x <= layer.width; x++) {
      const edge = x < layer.width && occupied(x, y - 1) !== occupied(x, y);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) { segments.push([point(start, y), point(x, y)]); start = -1; }
    }
  }
  for (let x = 0; x <= layer.width; x++) {
    let start = -1;
    for (let y = 0; y <= layer.height; y++) {
      const edge = y < layer.height && occupied(x - 1, y) !== occupied(x, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) { segments.push([point(x, start), point(x, y)]); start = -1; }
    }
  }
  return segments;
}
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
export function raySegmentDistance(origin, direction, segment) {
  const [a, b] = segment, sx = b[0] - a[0], sy = b[1] - a[1];
  const denominator = cross(direction[0], direction[1], sx, sy);
  if (Math.abs(denominator) < 1e-12) return Infinity;
  const ax = a[0] - origin[0], ay = a[1] - origin[1];
  const t = cross(ax, ay, sx, sy) / denominator, u = cross(ax, ay, direction[0], direction[1]) / denominator;
  return t >= 0 && u >= -1e-10 && u <= 1 + 1e-10 ? t : Infinity;
}
// Remove only the portions of an edge inside the sun's pass-through circle.
export function outsideCircleSegments(origin, segment, radius) {
  if (radius <= 0) return [segment];
  const [a, b] = segment, dx = b[0] - a[0], dy = b[1] - a[1];
  const ox = a[0] - origin[0], oy = a[1] - origin[1];
  const aa = dx * dx + dy * dy;
  if (aa === 0) return [];
  const bb = 2 * (ox * dx + oy * dy), cc = ox * ox + oy * oy - radius * radius;
  const discriminant = bb * bb - 4 * aa * cc, cuts = [0, 1];
  if (discriminant > 0) for (const t of [(-bb - Math.sqrt(discriminant)) / (2 * aa), (-bb + Math.sqrt(discriminant)) / (2 * aa)]) if (t > 0 && t < 1) cuts.push(t);
  cuts.sort((x, y) => x - y);
  const result = [], at = t => [a[0] + t * dx, a[1] + t * dy];
  for (let i = 0; i < cuts.length - 1; i++) {
    const middle = at((cuts[i] + cuts[i + 1]) / 2);
    if (Math.hypot(middle[0] - origin[0], middle[1] - origin[1]) >= radius) result.push([at(cuts[i]), at(cuts[i + 1])]);
  }
  return result;
}
// Rays just beside each boundary endpoint capture the visibility changes at corners.
export function visibilityPolygon(origin, obstacles, bounds, radius = 0, isSolid = () => false) {
  const [left, top, right, bottom] = bounds;
  const corners = [[left, top], [right, top], [right, bottom], [left, bottom]];
  const segments = [...obstacles.flatMap(segment => outsideCircleSegments(origin, segment, radius)), ...corners.map((p, i) => [p, corners[(i + 1) % 4]])];
  const angles = new Set();
  if (radius > 0) for (let i = 0; i < 96; i++) angles.add(i * 2 * Math.PI / 96 - Math.PI);
  for (const segment of segments) for (const point of segment) {
    const angle = Math.atan2(point[1] - origin[1], point[0] - origin[0]);
    for (const offset of [-1e-6, 0, 1e-6]) angles.add(angle + offset);
  }
  return [...angles].map(angle => {
    const direction = [Math.cos(angle), Math.sin(angle)];
    const start = [origin[0] + direction[0] * (radius + 1e-7), origin[1] + direction[1] * (radius + 1e-7)];
    let distance = radius > 0 && isSolid(start) ? radius : Infinity;
    if (!Number.isFinite(distance)) for (const segment of segments) {
      const hit = raySegmentDistance(origin, direction, segment);
      if (hit >= radius - 1e-8) distance = Math.min(distance, hit);
    }
    return { angle, point: [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance] };
  }).sort((a, b) => a.angle - b.angle).map(hit => hit.point);
}
export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function buildVisibility(scene, options = {}, width = 128, height = 80) {
  const settings = { ...defaults, ...visibilityDefaults, ...options }, sun = projectedSun(settings, width, height);
  const layers = scene.layers.map(layer => {
    const mask = thresholdMask(layer, settings), segments = silhouetteSegments(layer, mask, width, height);
    const points = segments.flat();
    const bounds = [Math.min(-width, sun[0] - width, ...points.map(p => p[0] - 1)),
      Math.min(-height, sun[1] - height, ...points.map(p => p[1] - 1)),
      Math.max(2 * width, sun[0] + width, ...points.map(p => p[0] + 1)),
      Math.max(2 * height, sun[1] + height, ...points.map(p => p[1] + 1))];
    // Radius is specified in native 128x80 image pixels, independent of output size.
    const radius = settings.sourceRadius * width / 128;
    const isSolid = point => {
      const worldX = (point[0] / width * 2 - 1) * SCALE * width / height * (layer.depth + 12);
      const worldY = (1 - point[1] / height * 2) * SCALE * (layer.depth + 12);
      const mx = Math.floor(worldX / layer.cellSize + layer.width / 2), my = Math.floor(layer.height / 2 - worldY / layer.cellSize);
      return mx >= 0 && my >= 0 && mx < layer.width && my < layer.height && mask[my * layer.width + mx] !== 0;
    };
    const blocked = isSolid(sun);
    const polygon = blocked && radius === 0 ? [] : visibilityPolygon(sun, segments, bounds, radius, isSolid);
    const visible = Uint8Array.from({ length: width * height }, (_, i) => pointInPolygon([i % width + 0.5, Math.floor(i / width) + 0.5], polygon) ? 1 : 0);
    return { polygon, segments, visible, blocked };
  });
  return { settings, width, height, sun, layers, color: sunlight(settings.sunElevation, 0.12) };
}
export function combinedVisibility(layers, first, index) {
  for (let i = first; i < layers.length; i++) if (!layers[i].visible[index]) return false;
  return true;
}
// Each entry is a distinct rendered layer, listed back to front.
export const visibilityOrder = ["sun", "far-cloud", "far-light", "middle-cloud", "middle-far-light", "near-cloud", "all-light"];
export function renderVisibility(scene, visibility) {
  const { settings, width, height, color, sun } = visibility;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const rx = (2 * (x + 0.5) / width - 1) * SCALE * width / height;
    const ry = (1 - 2 * (y + 0.5) / height) * SCALE;
    const disk = Math.hypot(x + 0.5 - sun[0], y + 0.5 - sun[1]) < 1.5 ? 4 : 0;
    let rgb = [0.035, 0.065, 0.14].map((v, c) => v + color[c] * (disk + Math.exp(-Math.abs(ry) * 6) * 0.09));
    for (let i = 2; i >= 0; i--) {
      const layer = scene.layers[i];
      const density = sampleCloud(layer, rx * (layer.depth + 12), ry * (layer.depth + 12));
      const transmission = Math.exp(-settings.cloudOpacity * density);
      const litSurface = combinedVisibility(visibility.layers, i + 1, index) ? 1 : 0;
      rgb = rgb.map((v, c) => v * transmission + (1 - transmission) * (0.025 + color[c] * litSurface * 0.65));
      const span = layer.depth - (i === 0 ? 0 : scene.layers[i - 1].depth);
      const alpha = 1 - Math.exp(-settings.haze * span * 0.04);
      const illuminated = combinedVisibility(visibility.layers, i, index);
      rgb = rgb.map((v, c) => v * (1 - alpha) + (illuminated ? alpha * color[c] : 0));
    }
    pixels.set([...rgb.map(v => 255 * Math.pow(1 - Math.exp(-v * 1.3), 1 / 2.2)), 255], index * 4);
  }
  return pixels;
}
