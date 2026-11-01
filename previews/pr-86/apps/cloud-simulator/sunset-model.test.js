/* Purpose: Check light-transport limits and fixed-field behavior.
 * Consumers: Node test runner. Dependencies: node:test, node:assert and sunset-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createDensity, renderSunset, transmittance, phase, sunlight } from "./sunset-model.js";

test("optical depth attenuates light; isotropic scattering has no angular preference", () => {
  assert.equal(transmittance(0), 1);
  assert.ok(transmittance(2) < transmittance(1));
  assert.equal(phase(1, 0), phase(-1, 0));
  assert.ok(phase(1, 0.6) > phase(-1, 0.6));
});
test("low sunlight loses more blue relative to red; sun fades below horizon", () => {
  const high = sunlight(70, 0.12), low = sunlight(3, 0.12);
  assert.ok(low[2] / low[0] < high[2] / high[0]);
  assert.deepEqual(sunlight(-8, 0.12), [0, 0, 0]);
  assert.deepEqual(sunlight(30, 0), [1, 1, 1]);
});
test("moving sun changes camera light but leaves seeded droplet field unchanged", () => {
  const field = createDensity(32, 20, 42), copy = field.density.slice();
  assert.deepEqual(field, createDensity(32, 20, 42));
  assert.notDeepEqual(field.density, createDensity(32, 20, 43).density);
  assert.notDeepEqual(renderSunset(field, { sunAngle: 70 }), renderSunset(field, { sunAngle: 3 }));
  assert.deepEqual(field.density, copy);
  assert.deepEqual(renderSunset(field, { sunAngle: 70 }, "density"), renderSunset(field, { sunAngle: 3 }, "density"));
});
test("zero extinction transmits the background and removes all cloud influence", () => {
  const field = createDensity(32, 20), empty = { ...field, density: new Float64Array(640) };
  assert.deepEqual(renderSunset(field, { extinction: 0 }), renderSunset(empty, { extinction: 0 }));
  const camera = renderSunset(field, { extinction: 0 }, "camera");
  assert.ok(camera.every(value => value === 255));
});
test("denser slab reduces camera transmission, all supported control extremes render", () => {
  const field = createDensity(32, 20);
  const mean = a => a.reduce((sum, value) => sum + value, 0);
  assert.ok(mean(renderSunset(field, { extinction: 0.5 }, "camera")) < mean(renderSunset(field, { extinction: 0.01 }, "camera")));
  for (const sunAngle of [-8, 0, 90, 170]) {
    const pixels = renderSunset(field, { sunAngle, extinction: 0.5, slabDepth: 30, g: 0.9, albedo: 0 });
    assert.equal(pixels.length, 32 * 20 * 4);
    assert.ok(pixels.every((value, index) => index % 4 !== 3 || value === 255));
  }
});
