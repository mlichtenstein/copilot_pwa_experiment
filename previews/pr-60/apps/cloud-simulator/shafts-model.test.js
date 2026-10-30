/* Purpose: Verify swept transport, geometry, air shafts and fixed cloud fields.
 * Consumers: Node test runner. Dependencies: node:test, node:assert and shafts-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createScene, sweepSunlight, renderShafts, cameraRay } from "./shafts-model.js";
function box() {
  const nx = 20, ny = 8, nz = 4;
  return { nx, ny, nz, dx: 1, dy: 1, dz: 1, layers: [{ name: "far", z: 3 }], density: new Float32Array(nx * ny * nz) };
}
test("uniform haze sweep matches analytic Beer-Lambert transmission", () => {
  const scene = box(), haze = 0.02;
  const { light } = sweepSunlight(scene, { sunElevation: 0, sunAzimuth: 0, haze });
  for (let z = 0; z < scene.nz; z++) {
    const expected = Math.exp(-haze * (scene.nz - z - 0.5));
    assert.ok(Math.abs(light[(z * scene.ny + 3) * scene.nx + 10] - expected) < 1e-6);
  }
});
test("a cloud blocks downstream light and its shadow shifts with sun direction", () => {
  const scene = box();
  for (let y = 0; y < scene.ny; y++) for (let x = 9; x < 12; x++) scene.density[(3 * scene.ny + y) * scene.nx + x] = 1;
  const options = { sunElevation: 0, sunAzimuth: 30, haze: 0, cloudExtinction: 2 };
  const { light } = sweepSunlight(scene, options);
  const centroid = z => {
    let sum = 0, weighted = 0;
    for (let x = 0; x < scene.nx; x++) { const shadow = 1 - light[(z * scene.ny + 4) * scene.nx + x]; sum += shadow; weighted += shadow * x; }
    return weighted / sum;
  };
  assert.ok(centroid(0) < centroid(2));
  assert.ok(light[4 * scene.nx + 8] < light[4 * scene.nx + 17]);
  assert.ok(sweepSunlight(scene, { ...options, far: 0 }).light.every(value => value === 1));
});
test("perspective rays diverge symmetrically and widen with field of view", () => {
  const left = cameraRay(0, 40, 128, 81, 58), right = cameraRay(127, 40, 128, 81, 58);
  assert.equal(left[0], -right[0]); assert.equal(left[1], 0);
  assert.ok(Math.abs(cameraRay(0, 40, 128, 81, 85)[0]) > Math.abs(left[0]));
  assert.ok(Math.abs(left[0] * 60 / left[2]) > Math.abs(left[0] * 20 / left[2]));
});
test("sun movement and lighting parameters never change the three seeded sheets", () => {
  const scene = createScene(42), original = scene.density.slice();
  assert.equal(scene.layers.length, 3);
  assert.deepEqual(scene.density, createScene(42).density);
  assert.notDeepEqual(scene.density, createScene(43).density);
  const a = sweepSunlight(scene), b = sweepSunlight(scene, { sunAzimuth: 20 });
  assert.notDeepEqual(renderShafts(scene, a, "air", 32, 20), renderShafts(scene, b, "air", 32, 20));
  assert.deepEqual(scene.density, original);
  assert.deepEqual(renderShafts(scene, a, "near", 32, 20), renderShafts(scene, b, "near", 32, 20));
  assert.ok(b.light.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
});
test("zero haze removes air scattering; zero cloud extinction removes cloud influence", () => {
  const scene = createScene();
  const air = renderShafts(scene, sweepSunlight(scene, { haze: 0 }), "air", 32, 20);
  assert.ok(air.every((value, i) => value === (i % 4 === 3 ? 255 : 0)));
  const empty = { ...scene, density: new Float32Array(scene.density.length) };
  assert.deepEqual(renderShafts(scene, sweepSunlight(scene, { cloudExtinction: 0 }), "light", 32, 20),
    renderShafts(empty, sweepSunlight(empty, { cloudExtinction: 0 }), "light", 32, 20));
});
test("supported extreme sunlight and opacity settings remain finite", () => {
  const scene = createScene();
  for (const azimuth of [-40, 40]) for (const elevation of [1, 35]) {
    const lighting = sweepSunlight(scene, { sunAzimuth: azimuth, sunElevation: elevation, cloudExtinction: 1.5, haze: 0.04 });
    assert.ok(lighting.light.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
    const image = renderShafts(scene, lighting, "light", 16, 10);
    assert.equal(image.length, 640);
    assert.ok(image.every((v, i) => i % 4 !== 3 || v === 255));
  }
});

test("layer resolution and world coverage grow with distance; view/sun paths stay in padded grid", () => {
  const scene = createScene();
  assert.deepEqual(scene.layers.map(layer => [layer.width, layer.height]), [[32, 20], [64, 40], [96, 60]]);
  for (const x of [0, 127]) for (const y of [0, 79]) {
    const ray = cameraRay(x, y, 128, 80, 85);
    for (const layer of scene.layers) {
      const distance = ((layer.z + 0.5) * scene.dz + 12) / ray[2];
      assert.ok(Math.abs(ray[0] * distance) < layer.width * layer.cellSize / 2);
      assert.ok(Math.abs(ray[1] * distance) < layer.height * layer.cellSize / 2);
    }
    for (const elevation of [1, 35]) for (const azimuth of [-40, 40]) {
      const { direction } = sweepSunlight(scene, { sunElevation: elevation, sunAzimuth: azimuth });
      for (let z = 0; z < scene.nz; z++) {
        const depth = (z + 0.5) * scene.dz, distance = (depth + 12) / ray[2];
        const sunDistance = (scene.nz * scene.dz - depth) / direction[2];
        assert.ok(Math.abs(ray[0] * distance + direction[0] * sunDistance) < scene.nx * scene.dx / 2);
        assert.ok(Math.abs(ray[1] * distance + direction[1] * sunDistance) < scene.ny * scene.dy / 2);
      }
    }
  }
});
test("selected sunlight depth changes the diagnostic image", () => {
  const scene = createScene(), lighting = sweepSunlight(scene);
  assert.notDeepEqual(renderShafts(scene, lighting, "slice", 128, 80, 0), renderShafts(scene, lighting, "slice", 128, 80, 23));
});
