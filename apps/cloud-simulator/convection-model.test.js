/* Purpose: Check the convection study's water budget, repeatability, sustained motion and rain.
 * Consumers: Node's test runner. Dependencies: node:test, node:assert and convection-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createConvection, step, totalWater, saturation, renderConvection, RAIN_SCALE,
  cloudCover, billows, haze, facing, HAZE_OPACITY, rainOpacity, sunsetSky, cloudColor } from "./convection-model.js";

const allFinite = simulation => ["temperature", "vapor", "liquid", "rain", "vorticity"]
  .every(name => simulation[name].every(Number.isFinite));
const nonNegative = simulation => ["vapor", "liquid", "rain", "pool"].every(name => simulation[name].every(value => value >= 0));

test("capacity grows with temperature and shrinks with altitude", () => {
  assert.ok(saturation(0.8, 0.5) > saturation(0.4, 0.5));
  assert.ok(saturation(0.6, 0.9) < saturation(0.6, 0.1));
});

test("vapor, cloud, rain and puddles together conserve water", () => {
  const simulation = createConvection({ seed: 42 });
  const start = totalWater(simulation);
  assert.ok(Math.abs(start / simulation.temperature.length - 0.11) < 1e-12);
  for (let tick = 0; tick < 1500; tick++) step(simulation);
  assert.ok(Math.abs(totalWater(simulation) - start) / start < 1e-9);
  assert.ok(nonNegative(simulation) && allFinite(simulation));
  assert.ok(simulation.liquid.some(value => value > 0.005), "clouds form");
  assert.ok(simulation.rain.some(value => value > RAIN_SCALE), "rain falls");
});

test("the same seed repeats exactly; another seed differs", () => {
  const run = seed => {
    const simulation = createConvection({ seed });
    for (let tick = 0; tick < 300; tick++) step(simulation, { flicker: 0.8 });
    return simulation;
  };
  assert.deepEqual(run(7), run(7));
  assert.notDeepEqual([...run(7).temperature], [...run(8).temperature]);
});

// Mean |ΔT| per tick in the interior rows, away from the flickering floor and the lid,
// so the score measures air moving rather than boundary noise.
function interiorActivity(simulation, ticks, options) {
  const { width, height } = simulation;
  let activity = 0;
  for (let tick = 0; tick < ticks; tick++) {
    const before = simulation.temperature.slice();
    step(simulation, options);
    let change = 0;
    for (let i = 2 * width; i < (height - 2) * width; i++) change += Math.abs(simulation.temperature[i] - before[i]);
    activity += change / ((height - 4) * width) / ticks;
  }
  return activity;
}
// Defaults sit around 1-3e-4 for thousands of ticks; still air with no buoyancy is about 2e-6.
const ACTIVITY_FLOOR = 6e-5;

// Specific seeds are not meant to matter, so each run draws fresh random seeds and names
// them in any failure. Reproduce one with CONVECTION_SEEDS=123,456 node --test ...
const randomSeeds = process.env.CONVECTION_SEEDS
  ? process.env.CONVECTION_SEEDS.split(",").map(Number)
  : [...crypto.getRandomValues(new Uint32Array(4))];

test(`blobs keep rising and falling and rain keeps falling on random seeds ${randomSeeds.join(", ")}`, () => {
  for (const seed of randomSeeds) {
    const simulation = createConvection({ seed });
    const start = totalWater(simulation);
    // Rain comes in showers, so count how often a visible shaft (20+ pixels at half the
    // fixed rain color scale) is falling, sampled every 100 ticks after the spin-up.
    let rainy = 0, samples = 0;
    for (let window = 0; window < 8; window++) {
      let activity = 0;
      for (let part = 0; part < 5; part++) {
        activity += interiorActivity(simulation, 100) / 5;
        if (window > 0) { samples++; if (simulation.rain.filter(value => value > RAIN_SCALE / 2).length > 20) rainy++; }
      }
      assert.ok(activity > ACTIVITY_FLOOR, `seed ${seed}, ticks ${window * 500}-${window * 500 + 499}: mean |ΔT| ${activity}`);
    }
    assert.ok(rainy >= samples / 2, `seed ${seed}: rain shafts visible in ${rainy} of ${samples} samples`);
    assert.ok(nonNegative(simulation) && allFinite(simulation), `seed ${seed} stays finite and non-negative`);
    assert.ok(Math.abs(totalWater(simulation) - start) / start < 1e-9, `seed ${seed} conserves water`);
  }
});

test("without buoyancy the air settles below the activity floor", () => {
  const simulation = createConvection({ seed: 42 });
  interiorActivity(simulation, 1500, { buoyancy: 0 });
  assert.ok(interiorActivity(simulation, 500, { buoyancy: 0 }) < ACTIVITY_FLOOR);
});

test("every view renders opaque pixels without changing the state", () => {
  const simulation = createConvection({ width: 16, height: 12, seed: 3 });
  for (let tick = 0; tick < 50; tick++) step(simulation);
  const snapshot = structuredClone(simulation);
  for (const view of ["sunset", "lamp", "water", "temperature", "buoyancy", "humidity"]) {
    const pixels = renderConvection(simulation, view);
    assert.equal(pixels.length, 16 * 12 * 4);
    for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 255);
  }
  assert.deepEqual(simulation, snapshot);
});

test("sunset cloud: buoyant cloudy masses turn solid, thin streamers and still cloud do not", () => {
  const width = 128, height = 96, size = width * height;
  const disc = (cx, cy, r) => Float64Array.from({ length: size }, (_, i) => ((i % width - cx) ** 2 + (Math.floor(i / width) - cy) ** 2 <= r * r ? 0.005 : 0));
  const warm = new Float64Array(size).fill(0.1), still = new Float64Array(size);
  const puff = cloudCover(disc(64, 48, 15), warm, width, height);
  assert.ok(puff[48 * width + 64] > 0.99, "a warm cloudy mass is opaque inside");
  assert.equal(puff[48 * width + 100], 0, "clear air outside it");
  assert.ok(Math.max(...cloudCover(disc(64, 48, 15), still, width, height)) === 0, "non-buoyant cloud water stays a veil");
  const streamer = Float64Array.from({ length: size }, (_, i) => (i % width === 64 ? 0.005 : 0));
  assert.ok(Math.max(...cloudCover(streamer, warm, width, height)) < 0.05, "a one-pixel streamer fades");
  const lobes = billows(width, height);
  assert.ok(Math.min(...lobes) >= -1 && Math.max(...lobes) <= 1 && lobes === billows(width, height));
  // A surface sloping toward the low sun at the lower right is brighter than one facing away.
  assert.ok(facing(-0.1, -0.05) > facing(0, 0) && facing(0, 0) > facing(0.1, 0.05));
});

test("sunset colors: haze near saturation only, see-through rain, gold floor, indigo lid", () => {
  assert.equal(haze(0.5), 0);
  assert.equal(haze(0.9), 0);
  assert.ok(haze(0.97) > 0 && haze(0.97) < haze(1) && haze(1.2) <= HAZE_OPACITY);
  assert.equal(rainOpacity(0), 0);
  assert.ok(rainOpacity(RAIN_SCALE / 2) < rainOpacity(RAIN_SCALE));
  assert.equal(rainOpacity(10 * RAIN_SCALE), rainOpacity(RAIN_SCALE));
  assert.ok(rainOpacity(10 * RAIN_SCALE) <= 0.5);
  const [floor, lid] = [sunsetSky(0), sunsetSky(1)];
  assert.ok(floor[0] > floor[2] && lid[2] > lid[0]);
  const brightness = rgb => rgb[0] + rgb[1] + rgb[2];
  assert.ok(brightness(cloudColor(1, 0.5)) > brightness(cloudColor(0, 0.5)));
});
