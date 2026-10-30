/* Purpose: Check layered shadows, zero controls and fixed image composition.
 * Consumers: Node test runner. Dependencies: node:test, node:assert and shafts-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { defaults, createScene, createLayer, buildLightMaps, renderShafts, lightAt, sampleCloud, sharpenDensity, shadowInterval, mergeIntervals, illuminatedAir, cloudPrisms } from "./shafts-model.js";
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

test("shadow smoothing blends cells while nearest sampling preserves a hard boundary", () => {
  const layer = { width: 2, height: 1, cellSize: 1, density: Float64Array.of(0, 1) };
  assert.equal(sampleCloud(layer, -0.25, 0, true), 0.25);
  assert.equal(sampleCloud(layer, -0.25, 0, false), 0);
  assert.equal(sampleCloud(layer, 0.25, 0, false), 1);
  assert.equal(sharpenDensity(0.2, 1), 0.2);
  assert.equal(sharpenDensity(0.2, 8), 0);
  assert.ok(sharpenDensity(0.5, 8) > sharpenDensity(0.5, 1));
});
test("sharper shadows change the light maps without changing cloud fields", () => {
  const scene = createScene(), copy = scene.layers.map(l => l.density.slice());
  const original = buildLightMaps(scene), sharp = buildLightMaps(scene, { cloudSharpness: 8 });
  assert.notDeepEqual(original.gaps[0].pixels, sharp.gaps[0].pixels);
  scene.layers.forEach((layer, i) => assert.deepEqual(layer.density, copy[i]));
});

test("extruded cloud cell intersects perspective rays over a continuous depth interval", () => {
  const prism = { x0: -1, x1: 1, y0: -1, y1: 1, depth: 10 };
  assert.deepEqual(shadowInterval(prism, 0, 0, [0, 0, 1], 0, 10), [0, 10]);
  const interval = shadowInterval(prism, 0.05, 0, [0, 0, 1], 0, 10);
  assert.ok(Math.abs(interval[0]) < 1e-10 && Math.abs(interval[1] - 8) < 1e-10);
  assert.equal(shadowInterval(prism, 0.2, 0, [0, 0, 1], 0, 10), null);
  assert.deepEqual(shadowInterval(prism, 0, 0, [0.5, 0, 1], 0, 10), [8, 10]);
});
test("overlapping extrusions are unioned so air is not shadowed twice", () => {
  assert.deepEqual(mergeIntervals([[3, 6], [2, 4], [8, 9]]), [[2, 6], [8, 9]]);
  const rate = 0.5 * 0.04;
  const expected = 1 - Math.exp(-rate * 2) + Math.exp(-rate * 6) - Math.exp(-rate * 10);
  assert.ok(Math.abs(illuminatedAir([[2, 4], [3, 6]], 0, 10, 0.5) - expected) < 1e-10);
  assert.equal(illuminatedAir([[0, 10]], 0, 10, 0.5), 0);
  assert.equal(illuminatedAir([], 0, 10, 0), 0);
});
test("partial shadow length gives partial air light rather than a midpoint on/off cutout", () => {
  const full = illuminatedAir([], 0, 10, 0.5);
  const partial = illuminatedAir([[0, 8]], 0, 10, 0.5);
  assert.ok(partial > 0 && partial < full);
  const scene = createScene();
  assert.equal(cloudPrisms(scene, { ...defaults, cloudOpacity: 0 }, 22).length, 0);
});
