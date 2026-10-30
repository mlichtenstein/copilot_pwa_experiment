/* Purpose: Verify narrative rainfall behavior and conservation.
 * Consumers: Node's test runner. Dependencies: node:test, node:assert and simulation.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation, step } from "./simulation.js";

function column(water, temperature = water.map(() => 0)) {
  return { width: 1, height: water.length, water: Float64Array.from(water),
    temperature: Float64Array.from(temperature), tick: 0, drained: 0 };
}

test("a wet pulse falls one row each tick, then drains through the bottom", () => {
  const sky = column([2, 0, 0]);
  const rules = { transfer: 1, baseThreshold: 0.4 };
  step(sky, rules);
  assert.deepEqual([...sky.water], [0, 2, 0]);
  step(sky, rules);
  assert.deepEqual([...sky.water], [0, 0, 2]);
  step(sky, rules);
  assert.deepEqual([...sky.water], [0, 0, 0]);
  assert.equal(sky.drained, 2);
  assert.equal(sky.tick, 3);
});

test("warm lower air arrests a pulse that exceeds the cold-air threshold", () => {
  const sky = column([0.4, 0, 0], [0, 1, 1]);
  step(sky, { transfer: 1, baseThreshold: 0.5 });
  step(sky, { transfer: 1, baseThreshold: 0.5 });
  assert.deepEqual([...sky.water], [0, 0.4, 0]);
});

test("zero transfer and cells at the threshold leave water stationary", () => {
  const sky = column([2, 0.55]);
  step(sky, { transfer: 0, baseThreshold: 1 });
  assert.deepEqual([...sky.water], [2, 0.55]);
  const dry = column([0.55, 0]);
  step(dry, { transfer: 1, baseThreshold: 1 });
  assert.deepEqual([...dry.water], [0.55, 0]);
});

test("repeatable noisy fields conserve water and remain nonnegative over a long run", () => {
  const sky = createSimulation({ seed: 42 });
  assert.deepEqual(sky, createSimulation({ seed: 42 }));
  assert.notDeepEqual(sky.water, createSimulation({ seed: 43 }).water);
  const total = values => values.reduce((sum, value) => sum + value, 0);
  const initial = total(sky.water);
  const originalTemperature = sky.temperature.slice();
  for (let tick = 0; tick < 500; tick++) step(sky);
  assert.ok(sky.water.every(value => Number.isFinite(value) && value >= 0));
  assert.ok(Math.abs(total(sky.water) + sky.drained - initial) < 1e-8);
  assert.deepEqual(sky.temperature, originalTemperature);
  assert.ok(sky.drained > 0);
});
