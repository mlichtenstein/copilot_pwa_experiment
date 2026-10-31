/* Purpose: Check the shared vertical figure-eight sun path: a closed loop whose top and
 *   bottom lobes cross once in the middle, that dips below the horizon with the defaults,
 *   that the four shared path settings scale and offset as stated, and that it is the same
 *   for the same time.
 * Consumers: Node test runner. Dependencies: node:test, node:assert and sun-path.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SUN_SHAPE, SUN_PATH, SUN_PATH_PARAMS, nearestPhase, sunAt, sunAtPhase, sunPhase, timeForPhase } from "./sun-path.js";

const close = (a, b, message, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${message}: ${a} vs ${b}`);
const samples = (shape = {}, count = 720) => Array.from({ length: count }, (_, i) => sunAt(i * SUN_PATH.period / count, shape));
const range = values => [Math.min(...values), Math.max(...values)];

test("the path is a closed loop: one period later the sun is back where it started", () => {
  for (const shape of [{}, { sunPathWidth: 70, sunPathHeight: 12, sunPathX: -20, sunPathY: 3 }]) {
    for (const time of [0, 7.5, 33, 61.25]) {
      const a = sunAt(time, shape), b = sunAt(time + SUN_PATH.period, shape), c = sunAt(time - 3 * SUN_PATH.period, shape);
      close(a.azimuth, b.azimuth, "azimuth"); close(a.elevation, b.elevation, "elevation");
      close(a.azimuth, c.azimuth, "azimuth, earlier loop"); close(a.elevation, c.elevation, "elevation, earlier loop");
    }
    // Consecutive samples are close, so the loop has no jumps (including across the wrap).
    const points = samples(shape);
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      assert.ok(Math.hypot(a.azimuth - b.azimuth, a.elevation - b.elevation) < 1);
    }
  }
});

test("it is a vertical figure-eight: a top and a bottom lobe that cross in the middle", () => {
  const { sunPathX: x, sunPathY: y } = DEFAULT_SUN_SHAPE;
  const start = sunAt(0), half = sunAt(SUN_PATH.period / 2);
  close(start.azimuth, x, "start azimuth"); close(half.azimuth, x, "halfway azimuth");
  close(start.elevation, y, "start elevation"); close(half.elevation, y, "halfway elevation");
  // The two passes through the crossing point go in different directions: first up and to
  // the right, then down and to the right (so it really crosses itself, not touches).
  const h = 1e-3, slope = time => {
    const a = sunAt(time - h), b = sunAt(time + h);
    return (b.elevation - a.elevation) / (b.azimuth - a.azimuth);
  };
  assert.ok(slope(0) > 0 && slope(SUN_PATH.period / 2) < 0);
  // One lobe above the crossing (first half of the loop), one below (second half).
  const points = samples();
  assert.ok(points.slice(1, 360).every(point => point.elevation > y));
  assert.ok(points.slice(361).every(point => point.elevation < y));
  // Each lobe swings both sides of center, so the motion is mostly up and down.
  for (const lobe of [points.slice(1, 360), points.slice(361)]) {
    assert.ok(lobe.some(point => point.azimuth > x + 1) && lobe.some(point => point.azimuth < x - 1));
  }
  // The only place the path passes the crossing height is that one crossing point.
  const levelCrossings = points.filter((point, i) => Math.sign(point.elevation - y) !== Math.sign(points[(i + 1) % points.length].elevation - y));
  assert.ok(levelCrossings.length >= 2);
  for (const point of levelCrossings) assert.ok(Math.abs(point.azimuth - x) < 0.5);
  // Taller than wide with the defaults.
  assert.ok(DEFAULT_SUN_SHAPE.sunPathHeight > DEFAULT_SUN_SHAPE.sunPathWidth);
});

test("with the defaults the sun crosses the horizon: daylight on top, dusk in the bottom lobe", () => {
  const points = samples(), [lowest, highest] = range(points.map(point => point.elevation));
  assert.ok(lowest < 0 && highest > 15, `${lowest}..${highest}`);
  assert.ok(points.slice(0, 360).every(point => point.elevation > 0));
  assert.ok(points.slice(360).some(point => point.elevation < 0));
});

test("width and height scale the path and X and Y offset it", () => {
  const span = shape => {
    const points = samples(shape, 1440);
    return { azimuth: range(points.map(point => point.azimuth)), elevation: range(points.map(point => point.elevation)) };
  };
  for (const shape of [DEFAULT_SUN_SHAPE, { sunPathWidth: 60, sunPathHeight: 10, sunPathX: 12, sunPathY: -4 }, { sunPathWidth: 0, sunPathHeight: 40, sunPathX: -30, sunPathY: 20 }]) {
    const { azimuth, elevation } = span(shape), { sunPathWidth: w, sunPathHeight: h, sunPathX: x, sunPathY: y } = { ...DEFAULT_SUN_SHAPE, ...shape };
    close(azimuth[0], x - w / 2, "leftmost", 1e-3); close(azimuth[1], x + w / 2, "rightmost", 1e-3);
    close(elevation[0], y - h / 2, "lowest", 1e-9); close(elevation[1], y + h / 2, "highest", 1e-9);
  }
  // Point by point: doubling the size doubles each offset from the crossing; moving the
  // center moves every point by the same amount.
  const base = { sunPathWidth: 20, sunPathHeight: 30, sunPathX: 0, sunPathY: 0 };
  for (const phase of [0.1, 0.3, 0.6, 0.85]) {
    const a = sunAtPhase(phase, base), big = sunAtPhase(phase, { ...base, sunPathWidth: 40, sunPathHeight: 60 });
    const moved = sunAtPhase(phase, { ...base, sunPathX: -7, sunPathY: 5.5 });
    close(big.azimuth, 2 * a.azimuth, "scaled azimuth"); close(big.elevation, 2 * a.elevation, "scaled elevation");
    close(moved.azimuth, a.azimuth - 7, "offset azimuth"); close(moved.elevation, a.elevation + 5.5, "offset elevation");
  }
  // Missing keys use the defaults, and the slider defaults are the stated shape.
  assert.deepEqual(sunAtPhase(0.3, {}), sunAtPhase(0.3, DEFAULT_SUN_SHAPE));
  for (const param of SUN_PATH_PARAMS) assert.ok(param.min <= param.default && param.default <= param.max, param.key);
});

test("it is deterministic and phases round-trip", () => {
  assert.deepEqual(sunAt(42.5), sunAt(42.5));
  assert.deepEqual(sunAt(12, {}, { period: 30 }), sunAt(12, {}, { period: 30 }));
  for (const phase of [0, 0.125, 0.5, 0.999]) close(sunPhase(timeForPhase(phase)), phase, "phase");
  close(sunPhase(-SUN_PATH.period / 4), 0.75, "negative time");
  assert.ok(sunAt(0).phase === 0 && sunAt(SUN_PATH.period * 0.25).phase === 0.25);
});

test("nearestPhase finds the point on the path closest to an old fixed sun position", () => {
  for (const phase of [0.05, 0.3, 0.62, 0.9]) {
    const sun = sunAtPhase(phase);
    close(nearestPhase(sun.azimuth, sun.elevation), phase, "on-path point", 1e-3);
  }
  // Off the path: the result is at least as close as any sampled phase.
  const target = [-15, -1.2], phase = nearestPhase(...target), sun = sunAtPhase(phase);
  const distance = Math.hypot(sun.azimuth - target[0], sun.elevation - target[1]);
  assert.ok(samples().every(point => Math.hypot(point.azimuth - target[0], point.elevation - target[1]) >= distance - 1e-9));
});
