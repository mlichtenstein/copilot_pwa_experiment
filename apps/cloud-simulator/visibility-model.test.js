/* Purpose: Verify visibility geometry, grouped masks and foreground composition.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, visibility-model.js and shafts-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createScene, defaults } from "./shafts-model.js";
import { silhouetteSegments, visibilityPolygon, pointInPolygon, buildVisibility,
  renderVisibility, combinedVisibility, visibilityOrder, outsideCircleSegments, buildLayeredVisibility, visibilityBands, thresholdMask, capEdges, capCoverage } from "./visibility-model.js";
test("unobstructed visibility covers the bounds; a wall blocks points behind it", () => {
  const empty = visibilityPolygon([1, 5], [], [0, 0, 10, 10]);
  assert.ok(pointInPolygon([9, 5], empty));
  const wall = visibilityPolygon([1, 5], [[[5, 0], [5, 10]]], [0, 0, 10, 10]);
  assert.ok(pointInPolygon([3, 5], wall));
  assert.ok(!pointInPolygon([9, 5], wall));
  assert.ok(wall.every(p => p.every(Number.isFinite)));
});
test("rays through a gap form a visible wedge with blocked regions beside it", () => {
  const polygon = visibilityPolygon([1, 5], [[[5, 0], [5, 4]], [[5, 6], [5, 10]]], [0, 0, 10, 10]);
  assert.ok(pointInPolygon([9, 5], polygon));
  assert.ok(!pointInPolygon([9, 2], polygon));
  assert.ok(!pointInPolygon([9, 8], polygon));
});
test("silhouette extraction removes internal cell edges and preserves holes", () => {
  const layer = { width: 2, height: 1, cellSize: 1, depth: 22 };
  assert.equal(silhouetteSegments(layer, Uint8Array.of(1, 1), 128, 80).length, 4);
  const hole = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1]);
  assert.equal(silhouetteSegments({ ...layer, width: 3, height: 3 }, hole, 128, 80).length, 8);
});
test("layer-group visibility is intersection in the requested composition order", () => {
  const layers = [0, 1, 2].map(() => ({ visible: Uint8Array.of(1) }));
  assert.equal(combinedVisibility(layers, 0, 0), true);
  layers[0].visible[0] = 0;
  assert.equal(combinedVisibility(layers, 0, 0), false);
  assert.equal(combinedVisibility(layers, 1, 0), true);
  layers[1].visible[0] = 0;
  assert.equal(combinedVisibility(layers, 1, 0), false);
  assert.equal(combinedVisibility(layers, 2, 0), true);
  assert.deepEqual(visibilityOrder, ["sun", "far-light", "middle-far-light", "all-light", "far-cloud", "middle-cloud", "near-cloud"]);
});
test("every opaque cloud body covers all light veils in both visibility modes", () => {
  for (const cloudIndex of [0, 1, 2]) for (const build of [buildVisibility, buildLayeredVisibility]) {
    const scene = createScene();
    for (const layer of scene.layers) layer.density.fill(0);
    scene.layers[cloudIndex].density.fill(100);
    const view = build(scene, { sunAzimuth: 20, cloudOpacity: 3, haze: 1 }, 16, 10);
    const bands = view.bands ?? [view];
    for (const band of bands) for (const layer of band.layers) layer.visible.fill(1);
    const lit = renderVisibility(scene, view);
    for (const band of bands) band.layers[0].visible.fill(0);
    const unlit = renderVisibility(scene, view);
    // The all-layer veil changes, but no cloud's surface lighting does.
    // Even an opaque far cloud must cover that foreground veil.
    assert.deepEqual(lit, unlit);
  }
});

test("zero opacity clears polygons; moving sun preserves fields; opaque source containment is explicit", () => {
  const scene = createScene(), original = scene.layers.map(l => l.density.slice());
  const clear = buildVisibility(scene, { cloudOpacity: 0 }, 32, 20);
  assert.ok(clear.layers.every(l => l.segments.length === 0 && l.visible.every(v => v === 1)));
  const first = buildVisibility(scene, {}, 32, 20), second = buildVisibility(scene, { sunAzimuth: 20 }, 32, 20);
  assert.notDeepEqual(renderVisibility(scene, first), renderVisibility(scene, second));
  scene.layers.forEach((layer, i) => assert.deepEqual(layer.density, original[i]));
  for (const layer of scene.layers) layer.density.fill(2);
  const blocked = buildVisibility(scene, { sourceRadius: 0 }, 32, 20);
  assert.ok(blocked.layers.every(l => l.blocked && l.polygon.length === 0 && l.visible.every(v => v === 0)));
});

test("source radius lets light escape a nearby silhouette but a distant wall still blocks", () => {
  const box = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]];
  const isSolid = p => Math.abs(p[0]) < 1 && Math.abs(p[1]) < 1;
  const polygon = visibilityPolygon([0, 0], [...box, [[5, -5], [5, 5]]], [-10, -10, 10, 10], 2, isSolid);
  assert.ok(pointInPolygon([4, 0], polygon));
  assert.ok(!pointInPolygon([7, 0], polygon));
  assert.ok(pointInPolygon([-7, 0], polygon));
});
test("a thick cloud limits the glow to the reach radius", () => {
  const polygon = visibilityPolygon([0, 0], [], [-10, -10, 10, 10], 2, () => true);
  assert.ok(pointInPolygon([1, 0], polygon));
  assert.ok(!pointInPolygon([3, 0], polygon));
});
test("circle clipping preserves only distant portions of crossing edges", () => {
  const clipped = outsideCircleSegments([0, 0], [[-5, 0], [5, 0]], 2);
  assert.equal(clipped.length, 2);
  assert.ok(Math.abs(clipped[0][1][0] + 2) < 1e-10);
  assert.ok(Math.abs(clipped[1][0][0] - 2) < 1e-10);
  assert.deepEqual(outsideCircleSegments([0, 0], [[-1, 0], [1, 0]], 2), []);
});

test("bright band penetrates denser material and has the largest pass-through radius", () => {
  const layer = { density: Float64Array.of(0.4, 0.7, 1.2) };
  const masks = visibilityBands.map(b => thresholdMask(layer, { ...defaults, cloudOpacity: 1, cloudThreshold: b.threshold }));
  assert.deepEqual([...masks[0]], [0, 0, 1]);
  assert.deepEqual([...masks[1]], [0, 1, 1]);
  assert.deepEqual([...masks[2]], [1, 1, 1]);
  const scene = createScene(), copy = scene.layers.map(l => l.density.slice());
  const view = buildLayeredVisibility(scene, { sourceRadius: 6 }, 32, 20);
  assert.equal(view.bands.length, 3);
  assert.ok(view.bands.every(b => b.layers.length === 3 && b.weight > 0 && b.weight < 1));
  assert.ok(view.bands[0].settings.sourceRadius > view.bands[1].settings.sourceRadius);
  assert.ok(view.bands[1].settings.sourceRadius > view.bands[2].settings.sourceRadius);
  assert.ok(Math.abs(view.bands.reduce((sum, b) => sum + b.weight, 0) - 1) < 1e-10);
  scene.layers.forEach((layer, i) => assert.deepEqual(layer.density, copy[i]));
});
test("layered visibility adds distinct blended bands and zero radius propagates to all of them", () => {
  const scene = createScene();
  const single = buildVisibility(scene, {}, 32, 20), multiple = buildLayeredVisibility(scene, {}, 32, 20);
  assert.notDeepEqual(renderVisibility(scene, single), renderVisibility(scene, multiple));
  const zero = buildLayeredVisibility(scene, { sourceRadius: 0, cloudOpacity: 0 }, 32, 20);
  assert.ok(zero.bands.every(b => b.settings.sourceRadius === 0 && b.layers.every(l => l.visible.every(v => v === 1))));
  assert.ok(renderVisibility(scene, zero).every((v, i) => i % 4 !== 3 || v === 255));
});

test("feathering softens cloud-facing caps while shaft sides stay binary", () => {
  const sun = [0, 0], polygon = [[2, -1], [10, -5], [10, 5], [2, 1]];
  const caps = capEdges(polygon, sun);
  assert.equal(caps.length, 2);
  const sample = p => capCoverage(p, pointInPolygon(p, polygon), caps, 1);
  assert.ok(sample([2.2, 0]) > 0 && sample([2.2, 0]) < 1);
  assert.equal(sample([5, 2.49]), 1);
  assert.equal(sample([5, 2.51]), 0);
  assert.equal(capCoverage([2.2, 0], true, caps, 0), 1);
});
test("radius arcs feather inward, without adding light beyond the polygon", () => {
  const sun = [0, 0];
  const polygon = Array.from({ length: 96 }, (_, i) => [3 * Math.cos(i * Math.PI / 48), 3 * Math.sin(i * Math.PI / 48)]);
  const caps = capEdges(polygon, sun);
  assert.equal(caps.length, 96);
  assert.equal(capCoverage([0, 0], true, caps, 1), 1);
  const inside = capCoverage([2.8, 0], true, caps, 1);
  assert.ok(inside > 0 && inside < 1);
  assert.equal(capCoverage([3.2, 0], false, caps, 1), 0);
});
test("zero feather keeps binary coverage and positive feather leaves polygon geometry intact", () => {
  const scene = createScene();
  const hard = buildVisibility(scene, { edgeFeather: 0 }, 32, 20);
  const soft = buildVisibility(scene, { edgeFeather: 2 }, 32, 20);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(hard.layers[i].polygon, soft.layers[i].polygon);
    assert.deepEqual([...hard.layers[i].coverage], [...hard.layers[i].visible]);
    assert.ok(soft.layers[i].coverage.every((value, index) => value >= 0 && value <= soft.layers[i].visible[index]));
  }
  assert.ok(soft.layers.some(l => l.coverage.some(v => v > 0 && v < 1)));
});
