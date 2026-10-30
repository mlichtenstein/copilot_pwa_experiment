/* Purpose: Check the shared figure-eight sun path: a closed loop that crosses itself once,
 *   stays in its stated range and is the same for the same time.
 * Consumers: Node test runner. Dependencies: node:test, node:assert and sun-path.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { SUN_PATH, sunAt, sunPhase, timeForPhase } from "./sun-path.js";

const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} vs ${b}`);
const samples = (count = 720) => Array.from({ length: count }, (_, i) => sunAt(i * SUN_PATH.period / count));

test("the path is a closed loop: one period later the sun is back where it started", () => {
  for (const time of [0, 7.5, 33, 61.25]) {
    const a = sunAt(time), b = sunAt(time + SUN_PATH.period), c = sunAt(time - 3 * SUN_PATH.period);
    close(a.azimuth, b.azimuth, "azimuth"); close(a.elevation, b.elevation, "elevation");
    close(a.azimuth, c.azimuth, "azimuth, earlier loop"); close(a.elevation, c.elevation, "elevation, earlier loop");
  }
  // Consecutive samples are close, so the loop has no jumps (including across the wrap).
  const points = samples();
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    assert.ok(Math.hypot(a.azimuth - b.azimuth, a.elevation - b.elevation) < 0.5);
  }
});

test("it is a figure-eight: the two lobes cross at the middle, along different directions", () => {
  const start = sunAt(0), half = sunAt(SUN_PATH.period / 2);
  close(start.azimuth, 0, "start azimuth"); close(half.azimuth, 0, "halfway azimuth");
  close(start.elevation, SUN_PATH.elevationMid, "start elevation"); close(half.elevation, SUN_PATH.elevationMid, "halfway elevation");
  // Tangents at the crossing point differ (one pass climbs, the other descends).
  const h = 1e-3, slope = time => {
    const a = sunAt(time - h), b = sunAt(time + h);
    return (b.elevation - a.elevation) / (b.azimuth - a.azimuth);
  };
  assert.ok(slope(0) > 0 && slope(SUN_PATH.period / 2) < 0);
  // One lobe on each side: the first half of the loop is right of center, the second half left.
  const points = samples();
  assert.ok(points.slice(1, 360).every(point => point.azimuth > 0));
  assert.ok(points.slice(361).every(point => point.azimuth < 0));
  // The only place the path passes the center line is that one crossing point.
  const centerCrossings = points.filter((point, i) => Math.sign(point.azimuth) !== Math.sign(points[(i + 1) % points.length].azimuth) || point.azimuth === 0);
  for (const point of centerCrossings) assert.ok(Math.abs(point.elevation - SUN_PATH.elevationMid) < 0.5);
});

test("it spans the stated range, with the sun dipping under the horizon in each lobe", () => {
  const points = samples();
  const azimuths = points.map(point => point.azimuth), elevations = points.map(point => point.elevation);
  close(Math.max(...azimuths), SUN_PATH.azimuthSwing, "rightmost"); close(Math.min(...azimuths), -SUN_PATH.azimuthSwing, "leftmost");
  close(Math.max(...elevations), SUN_PATH.elevationMid + SUN_PATH.elevationSwing, "highest");
  close(Math.min(...elevations), SUN_PATH.elevationMid - SUN_PATH.elevationSwing, "lowest");
  assert.ok(points.slice(0, 360).some(point => point.elevation < 0) && points.slice(360).some(point => point.elevation < 0));
});

test("it is deterministic and phases round-trip", () => {
  assert.deepEqual(sunAt(42.5), sunAt(42.5));
  assert.deepEqual(sunAt(12, { period: 30 }), sunAt(12, { period: 30 }));
  for (const phase of [0, 0.125, 0.5, 0.999]) close(sunPhase(timeForPhase(phase)), phase, "phase");
  close(sunPhase(-SUN_PATH.period / 4), 0.75, "negative time");
  assert.ok(sunAt(0).phase === 0 && sunAt(SUN_PATH.period * 0.25).phase === 0.25);
});
