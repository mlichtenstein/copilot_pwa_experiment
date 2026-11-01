/* Purpose: Verify spectral extinction and curved-Earth sunlight visibility.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, atmosphere-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { EARTH_RADIUS, directSunlight, sunDirection, pointAtAltitude, earthBlocks, viewTransmission } from "./atmosphere-model.js";
const air = { airDensity: 1, aerosol: 0.15 };
test("low sunlight reddens more than high sunlight; higher clouds retain more blue", () => {
  const point = pointAtAltitude(0, 1);
  const high = directSunlight(point, sunDirection(60, 0), air);
  const low = directSunlight(point, sunDirection(1, 0), air);
  assert.ok(low[2] / low[0] < high[2] / high[0]);
  const elevated = directSunlight(pointAtAltitude(0, 8), sunDirection(1, 0), air);
  assert.ok(elevated[2] / elevated[0] > low[2] / low[0]);
  assert.ok(high[0] > high[1] && high[1] > high[2]);
});
test("curved Earth shadows low points while higher and more distant clouds stay lit", () => {
  const sun = sunDirection(-1.5, 0);
  assert.ok(earthBlocks(pointAtAltitude(0, 0.15), sun));
  assert.ok(!earthBlocks(pointAtAltitude(0, 5), sun));
  const later = sunDirection(-2.5, 0);
  assert.ok(earthBlocks(pointAtAltitude(8, 1.6), later));
  assert.ok(!earthBlocks(pointAtAltitude(90, 4.4), later));
});
test("zero atmosphere transmits white direct light and unit camera transmission", () => {
  const point = [0, EARTH_RADIUS + 2, 0], vacuum = { airDensity: 0, aerosol: 0 };
  assert.deepEqual(directSunlight(point, sunDirection(30, 0), vacuum), [1, 1, 1]);
  assert.deepEqual(viewTransmission(pointAtAltitude(30, 3), vacuum), [1, 1, 1]);
  const thin = directSunlight(point, sunDirection(3, 0), air);
  const thick = directSunlight(point, sunDirection(3, 0), { ...air, airDensity: 2 });
  assert.ok(thick.every((v, i) => v < thin[i]));
});
