/* Purpose: Screen-space visibility polygons and the layered light composition strategy.
 * Consumers: shafts.js and visibility-model.test.js.
 * Dependencies: shafts-model.js for shared fields/settings; sunset-model.js for sun color. */
import { defaults, sharpenDensity, sampleCloud, sunDirection } from "./shafts-model.js";
import { sunlight } from "./sunset-model.js";
export const visibilityDefaults = { sourceRadius: 6, edgeFeather: 4 };
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
  return Uint8Array.from(layer.density, density => settings.cloudOpacity * sharpenDensity(density, settings.cloudSharpness) >= (settings.cloudThreshold ?? 0.5) ? 1 : 0);
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
// Radial polygon edges are shaft sides; every other visible boundary is a cap.
export function capEdges(polygon, sun) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const ax = a[0] - sun[0], ay = a[1] - sun[1], bx = b[0] - sun[0], by = b[1] - sun[1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-7) continue;
    const radii = Math.hypot(ax, ay) * Math.hypot(bx, by);
    const radial = radii > 0 && ax * bx + ay * by > 0 && Math.abs(cross(ax, ay, bx, by)) / radii < 1e-5;
    if (!radial) result.push([a, b]);
  }
  return result;
}
function segmentDistance(point, segment) {
  const [a, b] = segment, dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}
export function capCoverage(point, visible, caps, feather) {
  if (!visible) return 0;
  if (feather <= 0) return 1;
  let distance = feather;
  for (const segment of caps) distance = Math.min(distance, segmentDistance(point, segment));
  const t = Math.min(1, distance / feather);
  return t * t * (3 - 2 * t);
}
function rasterizeCapCoverage(visible, caps, width, height, feather) {
  const coverage = Float32Array.from(visible);
  if (feather <= 0) return coverage;
  // Only visit pixels in a narrow strip around each cap, not every cap at every pixel.
  for (const segment of caps) {
    const [a, b] = segment;
    const left = Math.max(0, Math.ceil(Math.min(a[0], b[0]) - feather - 0.5));
    const right = Math.min(width - 1, Math.floor(Math.max(a[0], b[0]) + feather - 0.5));
    const top = Math.max(0, Math.ceil(Math.min(a[1], b[1]) - feather - 0.5));
    const bottom = Math.min(height - 1, Math.floor(Math.max(a[1], b[1]) + feather - 0.5));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const i = y * width + x;
      if (coverage[i] === 0) continue;
      const t = Math.min(1, segmentDistance([x + 0.5, y + 0.5], segment) / feather);
      coverage[i] = Math.min(coverage[i], t * t * (3 - 2 * t));
    }
  }
  return coverage;
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
    const caps = capEdges(polygon, sun), feather = settings.edgeFeather * width / 128;
    const coverage = rasterizeCapCoverage(visible, caps, width, height, feather);
    return { polygon, segments, visible, coverage, blocked };
  });
  return { settings, width, height, sun, layers, color: sunlight(settings.sunElevation, 0.12) };
}
export function combinedVisibility(layers, first, index) {
  for (let i = first; i < layers.length; i++) if (!layers[i].visible[index]) return false;
  return true;
}
export function combinedCoverage(layers, first, index) {
  let coverage = 1;
  for (let i = first; i < layers.length; i++) {
    if (!layers[i].visible[index]) return 0;
    coverage *= layers[i].coverage ? layers[i].coverage[index] : 1;
  }
  return coverage;
}
// Bright light pierces denser clouds and starts farther from the projected sun.
export const visibilityBands = [
  { name: "bright", threshold: 1, radiusScale: 1.8, weight: 0.25, brightness: 1.2 },
  { name: "middle", threshold: 0.5, radiusScale: 1, weight: 0.35, brightness: 1 },
  { name: "soft", threshold: 0.25, radiusScale: 0.6, weight: 0.4, brightness: 0.8 }
];
export function buildLayeredVisibility(scene, options = {}, width = 128, height = 80) {
  const radius = options.sourceRadius ?? visibilityDefaults.sourceRadius;
  const bands = visibilityBands.map(band => ({ ...buildVisibility(scene, { ...options,
    cloudThreshold: band.threshold, sourceRadius: radius * band.radiusScale }, width, height), ...band }));
  return { ...bands[1], bands };
}
// All light veils precede the cloud-body pass, so even far clouds cover every veil.
export const visibilityOrder = ["sun", "far-light", "middle-far-light", "all-light", "far-cloud", "middle-cloud", "near-cloud"];
export function renderVisibility(scene, visibility) {
  const { settings, width, height, color, sun } = visibility;
  const bands = visibility.bands ?? [{ ...visibility, weight: 1, brightness: 1 }];
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const rx = (2 * (x + 0.5) / width - 1) * SCALE * width / height;
    const ry = (1 - 2 * (y + 0.5) / height) * SCALE;
    const disk = Math.hypot(x + 0.5 - sun[0], y + 0.5 - sun[1]) < 1.5 ? 4 : 0;
    let rgb = [0.035, 0.065, 0.14].map((v, c) => v + color[c] * (disk + Math.exp(-Math.abs(ry) * 6) * 0.09));
    for (let i = 2; i >= 0; i--) {
      const layer = scene.layers[i];
      const span = layer.depth - (i === 0 ? 0 : scene.layers[i - 1].depth);
      // First pass: collect the light veils without painting over any cloud bodies.
      const alpha = (1 - Math.exp(-settings.haze * span * 0.04)) * 0.55;
      for (const band of bands) {
        const opacity = alpha * band.weight * combinedCoverage(band.layers, i, index);
        rgb = rgb.map((v, c) => v * (1 - opacity) + opacity * color[c] * band.brightness);
      }
    }
    // Second pass: clouds retain their depth order but cover every light/shadow veil.
    for (let i = 2; i >= 0; i--) {
      const layer = scene.layers[i];
      const density = sampleCloud(layer, rx * (layer.depth + 12), ry * (layer.depth + 12));
      const transmission = Math.exp(-settings.cloudOpacity * density);
      let litSurface = 0;
      for (const band of bands) litSurface += band.weight * band.brightness * combinedCoverage(band.layers, i + 1, index);
      // Neutral-blue body fill preserves clouds in shadow; sunlight gives their warm face.
      rgb = rgb.map((v, c) => v * transmission + (1 - transmission) * ([0.045, 0.055, 0.075][c] + color[c] * litSurface * 0.42));
    }
    pixels.set([...rgb.map(v => 255 * Math.pow(1 - Math.exp(-v * 1.3), 1 / 2.2)), 255], index * 4);
  }
  return pixels;
}
