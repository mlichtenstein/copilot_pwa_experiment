/* Purpose: Check the drift walk: it stays inside each slider's range, really moves over a
 *   minute but calmly, roams far beyond a fifth of its range with no pull back, does not stick
 *   at a limit, picks up from a value a person sets, and repeats exactly for the same seed.
 * Consumers: Node's test runner. Dependencies: node:test, node:assert and drift.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createDrift, DRIFT } from "./drift.js";

const ranges = { a: { min: 0, max: 1 }, b: { min: -0.5, max: 0.5 }, c: { min: 8, max: 96 }, edge: { min: 0, max: 0.015 } };
const start = { a: 0.45, b: 0.1, c: 32, edge: 0.015 };
const run = (seed, seconds, dt = 0.05) => {
  const drift = createDrift(ranges, start, { seed }), trail = [];
  for (let t = 0; t < seconds; t += dt) trail.push(drift.step(dt));
  return trail;
};

test("drift stays in range and moves meaningfully within a minute", () => {
  for (const seed of [1, 2, 3, 12345]) {
    const trail = run(seed, 600);
    for (const values of trail) for (const [id, { min, max }] of Object.entries(ranges)) {
      assert.ok(values[id] >= min && values[id] <= max, `seed ${seed}: ${id} = ${values[id]}`);
    }
    // After a minute (1200 ticks at 20 per second) the values have moved: on average more
    // than 5% of their range, and by much less than one tick would suggest jumping.
    let moved = 0, jump = 0;
    for (const [id, { min, max }] of Object.entries(ranges)) {
      moved += Math.abs(trail[1199][id] - start[id]) / (max - min) / 4;
      for (let k = 1; k < trail.length; k++) jump = Math.max(jump, Math.abs(trail[k][id] - trail[k - 1][id]) / (max - min));
    }
    assert.ok(moved > 0.05, `seed ${seed}: moved ${moved.toFixed(3)} of the range in a minute`);
    assert.ok(jump < 0.1, `seed ${seed}: largest step ${jump.toFixed(3)} of the range`);
  }
});

test("drift does not stick at the ends: a value starting at its limit wanders away", () => {
  let away = 0, samples = 0;
  for (const seed of [4, 5, 6, 7, 8]) for (const values of run(seed, 300)) { samples++; if (values.edge < 0.015 * 0.98) away++; }
  assert.ok(away > 0.8 * samples, `away from the top ${(100 * away / samples).toFixed(0)}% of the time`);
});

test("drift roams free: well beyond a fifth of the range, over minutes, always within min and max", () => {
  // No pull back toward the start: over 20 minutes each walk reaches far from where it began,
  // and every walk visits both outer quarters of its range.
  for (const seed of [11, 12, 13]) {
    const trail = run(seed, 1200, 0.1);
    for (const [id, { min, max }] of Object.entries(ranges)) {
      const units = trail.map(values => (values[id] - min) / (max - min));
      assert.ok(units.every(u => u >= 0 && u <= 1), `seed ${seed}: ${id} stays within min and max`);
      const farthest = Math.max(...units.map(u => Math.abs(u - (start[id] - min) / (max - min))));
      assert.ok(farthest > 0.4, `seed ${seed}: ${id} travelled ${(100 * farthest).toFixed(0)}% of its range from its start`);
      assert.ok(Math.min(...units) < 0.25 && Math.max(...units) > 0.75, `seed ${seed}: ${id} roamed ${Math.min(...units).toFixed(2)} to ${Math.max(...units).toFixed(2)}`);
    }
  }
  // Calm: crossing a whole range takes minutes, not seconds (rate · sqrt(t) = 1 at t = 1 / rate²).
  assert.ok(DRIFT.rate > 0 && 1 / DRIFT.rate ** 2 >= 120, `full range in about ${(1 / DRIFT.rate ** 2).toFixed(0)} s`);
  const typical = Object.keys(ranges).reduce((sum, id) => sum + Math.abs((run(21, 10).at(-1)[id] - start[id]) / (ranges[id].max - ranges[id].min)), 0) / 4;
  assert.ok(typical < 0.3, `moved ${(100 * typical).toFixed(0)}% of the range in 10 s`);
});

test("drift speed scales the step: 10× moves about ten times as far, clamped to 0.1× to 10×", () => {
  const spread = speed => {
    const drift = createDrift({ x: { min: 0, max: 1 } }, { x: 0.5 }, { seed: 31 });
    drift.setSpeed(speed);
    let total = 0;
    for (let k = 0; k < 400; k++) { const from = drift.value("x"); drift.step(0.01); total += Math.abs(drift.value("x") - from); }
    return total;
  };
  const ratio = spread(10) / spread(1);
  assert.ok(ratio > 8 && ratio < 12, `10× moved ${ratio.toFixed(1)} times as far`);
  const drift = createDrift({ x: { min: 0, max: 1 } });
  drift.setSpeed(50); assert.equal(drift.speed, DRIFT.speed.max); drift.setSpeed(0.001); assert.equal(drift.speed, DRIFT.speed.min);
  drift.setSpeed(undefined); assert.equal(drift.speed, 1);
});

test("drift repeats for the same seed, differs across seeds, and continues from a set value", () => {
  assert.deepEqual(run(42, 30), run(42, 30));
  assert.notDeepEqual(run(42, 30).at(-1), run(43, 30).at(-1));
  const drift = createDrift(ranges, start, { seed: 7 });
  for (let k = 0; k < 100; k++) drift.step(0.05);
  drift.set("c", 80);
  assert.equal(drift.value("c"), 80);
  const next = drift.step(0.05).c;
  assert.ok(Math.abs(next - 80) < 0.05 * 88, `continues from 80 (now ${next.toFixed(2)})`);
  // Its own random numbers: Math.random is never used.
  const original = Math.random;
  Math.random = () => { throw new Error("drift used Math.random"); };
  try { run(1, 5); } finally { Math.random = original; }
});
