/*
 * Purpose: Check the shared moon's path and that the host puts it on every frame.
 * Consumers: the cloud simulator test suite (node --test).
 * Dependencies: node:test, moon-path.js, sun-path.js, host.js, fake-dom.js, ../sunset-experiment.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { moonAt, moonAtPhase } from "./moon-path.js";
import { SUN_PATH, phaseForTimeOfDay, timeForPhase } from "./sun-path.js";
import { mountExperiment } from "./host.js";
import { fakeDocument } from "./fake-dom.js";
import { sunset } from "../sunset-experiment.js";

test("the shared moon keeps the fixed ellipse: highest after midnight, below the horizon at noon", () => {
  assert.ok(Math.abs(moonAtPhase(0.57).azimuth + 22) < 1e-10);
  assert.ok(Math.abs(moonAtPhase(0.82).elevation - 24) < 1e-10);
  assert.ok(Math.abs(moonAtPhase(0.57).azimuth - moonAtPhase(1.57).azimuth) < 1e-10);
  assert.ok(moonAtPhase(phaseForTimeOfDay(1.7)).elevation > 23);
  assert.ok(moonAtPhase(phaseForTimeOfDay(12)).elevation < 0);
});

test("moonAt follows the shared clock: the same moon one loop later", () => {
  const time = timeForPhase(0.8);
  assert.deepEqual(moonAt(time + SUN_PATH.period), { ...moonAt(time), phase: moonAt(time + SUN_PATH.period).phase });
  assert.ok(Math.abs(moonAt(time).elevation - moonAtPhase(0.8).elevation) < 1e-9);
});

test("the host puts the shared moon on every frame it steps and renders", () => {
  const doc = fakeDocument(["sky", "playback", "controls", "stats", "status"]);
  let callback, stamp = 0;
  Object.assign(doc.getElementById("sky"), { width: 32, height: 20, getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) });
  const frames = [];
  const spy = { ...sunset, create(options) {
    const instance = sunset.create(options);
    return { ...instance, step: (dt, frame) => { frames.push(frame); return instance.step(dt, frame); }, render: frame => { frames.push(frame); return instance.render(frame); } };
  } };
  const page = mountExperiment(spy, { doc, raf: fn => { callback = fn; }, presets: false, serviceWorker: null });
  doc.getElementById("play").fire("click");
  for (let i = 0; i < 4; i++) { stamp += 100; callback(stamp); }
  assert.ok(frames.length > 0);
  for (const frame of frames) assert.deepEqual(frame.moon, moonAt(frame.time));
  assert.ok(frames.every(frame => frame.sun && Math.abs(frame.sun.phase - frame.moon.phase) < 1e-12), "sun and moon share the clock");
  page.dispose?.();
});
