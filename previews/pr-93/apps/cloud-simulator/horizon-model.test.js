/* Purpose: Verify fixed cloud imagery, scene layers and altitude-dependent illumination.
 * Consumers: Node test runner. Dependencies: node:test, node:assert and horizon model/data. */
import test from "node:test";
import assert from "node:assert/strict";
import { defaults, layerPlan, renderHorizon, cloudCenters } from "./horizon-model.js";
import { cloudBitmaps } from "./horizon-bitmaps.js";
test("six alternating layers and three literal grayscale bitmaps stay fixed across lighting changes", () => {
  assert.deepEqual(layerPlan.map(l => l.type), ["terrain", "cloud", "terrain", "cloud", "terrain", "cloud"]);
  assert.equal(cloudBitmaps.length, 3);
  for (const bitmap of cloudBitmaps) assert.equal(bitmap.alpha.length, bitmap.width * bitmap.height);
  const before = JSON.stringify(cloudBitmaps);
  assert.notDeepEqual(renderHorizon({ sunElevation: 6 }, 32, 20), renderHorizon({ sunElevation: -2.5 }, 32, 20));
  assert.equal(JSON.stringify(cloudBitmaps), before);
});
test("altitude/spread/distance controls change geometry and center illumination", () => {
  const flat = cloudCenters({ altitudeSpread: 0 });
  assert.ok(flat.every(l => l.height === defaults.cloudAltitude));
  const spread = cloudCenters();
  assert.ok(spread[0].height < spread[1].height && spread[1].height < spread[2].height);
  assert.deepEqual(cloudCenters({ distanceScale: 2 }).map(l => l.distance), spread.map(l => l.distance * 2));
  const sunset = cloudCenters({ sunElevation: -2.5 });
  assert.equal(sunset[0].lit, false); assert.equal(sunset[2].lit, true);
  assert.notDeepEqual(cloudCenters({ cloudAltitude: 7 })[0].color, spread[0].color);
});
test("supported extreme controls render opaque finite images", () => {
  for (const sunElevation of [-8, 15]) {
    const pixels = renderHorizon({ sunElevation, altitudeSpread: 5, cloudAltitude: 0.3, distanceScale: 2 }, 32, 20);
    assert.equal(pixels.length, 2560);
    assert.ok(pixels.every((v, i) => i % 4 !== 3 || v === 255));
  }
});
