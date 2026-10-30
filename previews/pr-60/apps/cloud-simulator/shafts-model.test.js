/* Purpose: Check layered shadows, zero controls and fixed image composition.
 * Consumers: Node test runner. Dependencies: node:test, node:assert and shafts-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { defaults, createScene, createLayer, buildLightMaps, renderShafts, lightAt } from "./shafts-model.js";
test("three repeatable pictures grow with distance and produce only two air maps", () => {
  const scene = createScene();
  assert.deepEqual(scene, createScene());
  assert.deepEqual(scene.layers.map(l => [l.width, l.height]), [[32, 20], [64, 40], [96, 60]]);
  const maps = buildLightMaps(scene);
  assert.equal(maps.gaps.length, 2);
  assert.ok(maps.gaps.every(gap => gap.pixels.length === 64 * 40 * 3));
  assert.ok(!("density" in scene));
});
test("zero haze removes both air pictures; zero opacity removes all cloud influence", () => {
  const scene = createScene(), clear = buildLightMaps(scene, { haze: 0 });
  assert.ok(clear.gaps.every(gap => gap.airT === 1 && gap.pixels.every(v => v === 0)));
  const other = createScene(987);
  assert.deepEqual(renderShafts(scene, buildLightMaps(scene, { cloudOpacity: 0 })), renderShafts(other, buildLightMaps(other, { cloudOpacity: 0 })));
});
test("a farther cloud blocks projected sunlight; a nearer cloud cannot shadow air behind it", () => {
  const layer = { width: 8, height: 8, cellSize: 4, density: new Float64Array(64).fill(1), depth: 78 };
  const scene = { layers: [layer] }, settings = { ...defaults, sunElevation: 0, sunAzimuth: 0 };
  assert.ok(Math.abs(lightAt(scene, 0, 0, 64, settings) - Math.exp(-defaults.cloudOpacity)) < 1e-10);
  assert.equal(lightAt(scene, 0, 0, 90, settings), 1);
  assert.equal(lightAt(scene, 1000, 0, 64, settings), 1);
});
test("sun movement changes lighting without mutating clouds; patterns can change independently", () => {
  const scene = createScene(), copies = scene.layers.map(l => l.density.slice());
  const first = renderShafts(scene, buildLightMaps(scene));
  assert.notDeepEqual(first, renderShafts(scene, buildLightMaps(scene, { sunAzimuth: 20 })));
  scene.layers.forEach((layer, i) => assert.deepEqual(layer.density, copies[i]));
  scene.layers[0] = createLayer(0, 43);
  assert.notDeepEqual(scene.layers[0].density, copies[0]);
  assert.deepEqual(scene.layers[1].density, copies[1]);
});
test("control extremes produce finite nonnegative air colors and opaque display pixels", () => {
  const scene = createScene();
  for (const sunElevation of [1, 35]) for (const sunAzimuth of [-40, 40]) {
    const maps = buildLightMaps(scene, { sunElevation, sunAzimuth, haze: 1, cloudOpacity: 3 });
    assert.ok(maps.gaps.every(gap => gap.pixels.every(v => Number.isFinite(v) && v >= 0)));
    const pixels = renderShafts(scene, maps, 32, 20);
    assert.equal(pixels.length, 2560);
    assert.ok(pixels.every((v, i) => i % 4 !== 3 || v === 255));
  }
});
