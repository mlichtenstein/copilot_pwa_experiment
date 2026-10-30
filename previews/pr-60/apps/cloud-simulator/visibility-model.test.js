/* Purpose: Verify visibility geometry, grouped masks and foreground composition.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, visibility-model.js and shafts-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createScene, defaults } from "./shafts-model.js";
import { silhouetteSegments, visibilityPolygon, pointInPolygon, buildVisibility,
  renderVisibility, combinedVisibility, visibilityOrder, outsideCircleSegments } from "./visibility-model.js";
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
  assert.deepEqual(visibilityOrder, ["sun", "far-cloud", "far-light", "middle-cloud", "middle-far-light", "near-cloud", "all-light"]);
});
test("foreground all-layer light is composed after an opaque near cloud", () => {
  const scene = createScene(); scene.layers[0].density.fill(2);
  const settings = { ...defaults, sunAzimuth: 20, cloudOpacity: 3, haze: 0.5 };
  const base = buildVisibility(scene, settings, 16, 10);
  for (const layer of base.layers) layer.visible.fill(1);
  const lit = renderVisibility(scene, base);
  base.layers[0].visible.fill(0);
  const unlit = renderVisibility(scene, base);
  // Only the all-layer foreground overlay changes. Near-cloud opacity cannot hide it.
  const inverseDisplay = value => -Math.log(1 - Math.pow(value / 255, 2.2)) / 1.3;
  const expected = (1 - Math.exp(-settings.haze * 22 * 0.04)) * base.color[0];
  const red = 4 * (5 * 16 + 8);
  assert.ok(Math.abs((inverseDisplay(lit[red]) - inverseDisplay(unlit[red])) - expected) < 0.015);
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
