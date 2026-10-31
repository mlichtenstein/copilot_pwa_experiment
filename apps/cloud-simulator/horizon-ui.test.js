/* Purpose: Check Horizon light on the shared host: altitude redraws, Play sunset moves the
 *   shared sun (both angles), a manual sun position pauses, Randomize moves the sliders but
 *   not the sun, the cloud status line follows, and old ratings with fixed sun angles still load.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, horizon-experiment.js,
 *   core/host.js, core/sun-path.js and core/fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { horizon } from "./horizon-experiment.js";
import { mountExperiment } from "./core/host.js";
import { DEFAULT_SUN_SHAPE, SUN_PATH_KEYS, sunAt } from "./core/sun-path.js";
import { fakeDocument, fakeCanvas, manualFrames } from "./core/fake-dom.js";

test("Horizon: altitude redraws, the shared sun plays and pauses, Randomize leaves the sun, old links load", () => {
  const doc = fakeDocument(["sky", "presets", "playback", "controls", "stats", "status", "cloud-status"]);
  const canvas = fakeCanvas(doc, 32, 20), { raf, frame } = manualFrames(), $ = id => doc.getElementById(id);
  const page = mountExperiment(horizon, { doc, raf, presets: false, serviceWorker: null });
  frame();
  assert.deepEqual($("playback").children.map(button => button.textContent), ["Play sunset", "Reset sun"]);
  assert.deepEqual($("controls").children.map(label => label.children.find(child => child.tagName === "INPUT" || child.tagName === "BUTTON").id),
    ["drift", "drift-speed", "randomize", "sunPhase", ...SUN_PATH_KEYS, "cloudAltitude", "altitudeSpread", "distanceScale", "airDensity", "aerosol", "exposure"]);
  assert.match($("stats").textContent, /^Fixed bitmaps · six layers · \d+ ms\/frame$/);
  assert.match($("cloud-status").textContent, /^Near cloud: .* km high, .* km away, (sunlit|Earth shadow) · Middle cloud: .* · Far cloud: /);
  const first = canvas.pixels();

  $("cloudAltitude").value = "6"; $("cloudAltitude").fire("input"); frame();
  assert.notDeepEqual(canvas.pixels(), first);

  $("play").fire("click"); assert.equal($("play").textContent, "Pause sunset");
  const start = sunAt(page.clock.time, DEFAULT_SUN_SHAPE);
  for (let i = 0; i < 30; i++) frame(100);
  const later = sunAt(page.clock.time, DEFAULT_SUN_SHAPE);
  assert.notEqual(later.azimuth, start.azimuth); assert.notEqual(later.elevation, start.elevation);

  $("sunPhase").value = "0.7"; $("sunPhase").fire("input"); assert.equal($("play").textContent, "Play sunset");

  const before = page.getParams();
  $("randomize").fire("click"); frame();
  const after = page.getParams();
  assert.ok(["cloudAltitude", "altitudeSpread", "distanceScale", "airDensity", "aerosol", "exposure"].some(key => after[key] !== before[key]), "Randomize moved the sliders");
  assert.equal(after.sunPhase, before.sunPhase); assert.equal(after.sunPathWidth, before.sunPathWidth);
  assert.equal($("play").textContent, "Play sunset");

  // A rating saved before the shared sun (its old default angles): they land on the nearest point of the path; sunSpeed drops.
  page.applyParams({ sunElevation: -1.2, sunAzimuth: -15, sunSpeed: 0.3, cloudAltitude: 4, resolution: "128x80" });
  const sun = sunAt(page.clock.time, DEFAULT_SUN_SHAPE);
  assert.ok(Math.hypot(sun.azimuth + 15, sun.elevation + 1.2) < 3);
  assert.equal(page.getParams().cloudAltitude, 4); assert.equal("sunSpeed" in page.getParams(), false);
});
