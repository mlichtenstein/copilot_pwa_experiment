/* Purpose: Check the convection study's water budget, repeatability and sustained motion.
 * Consumers: Node's test runner. Dependencies: node:test, node:assert and convection-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createConvection, step, totalWater, saturation, renderConvection } from "./convection-model.js";

const allFinite = simulation => ["temperature", "vapor", "liquid", "vorticity"]
  .every(name => simulation[name].every(Number.isFinite));
const nonNegative = simulation => ["vapor", "liquid", "pool"].every(name => simulation[name].every(value => value >= 0));

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
  assert.ok(simulation.liquid.some(value => value > 0.01), "clouds form");
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

test("blobs keep rising and falling instead of settling", () => {
  for (const seed of [42, 7, 2026]) {
    const simulation = createConvection({ seed });
    const start = totalWater(simulation);
    for (let window = 0; window < 8; window++) {
      const activity = interiorActivity(simulation, 500);
      assert.ok(activity > ACTIVITY_FLOOR, `seed ${seed}, ticks ${window * 500}-${window * 500 + 499}: mean |ΔT| ${activity}`);
    }
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
  for (const view of ["lamp", "water", "temperature", "buoyancy", "humidity"]) {
    const pixels = renderConvection(simulation, view);
    assert.equal(pixels.length, 16 * 12 * 4);
    for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 255);
  }
  assert.deepEqual(simulation, snapshot);
});
