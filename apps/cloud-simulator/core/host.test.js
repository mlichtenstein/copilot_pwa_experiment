/* Purpose: Check the experiment host in a minimal DOM harness with the Sunset module: it
 *   builds the controls from the schema, Play runs the shared clock and moves the sun along
 *   the path, a manual sun position pauses it, Reset sun returns it, and getParams/applyParams
 *   round-trip (the contract the rating bar and ?p= links use).
 * Consumers: Node test runner. Dependencies: node:test, node:assert, host.js, sun-path.js, fake-dom.js and
 *   ../sunset-experiment.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { mountExperiment, DEFAULT_SUN_PHASE } from "./host.js";
import { DEFAULT_SUN_SHAPE, SUN_PATH, SUN_PATH_KEYS, sunAt, sunAtPhase, timeForPhase } from "./sun-path.js";
import { sunset } from "../sunset-experiment.js";
import { fakeDocument } from "./fake-dom.js";

test("Sunset on the host: generated controls, shared sun playback, pause, reset and params round-trip", () => {
  const doc = fakeDocument(["sky", "playback", "controls", "stats", "status"]);
  let pixels, callback, stamp = 0;
  Object.assign(doc.getElementById("sky"), { width: 32, height: 20, getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: image => { pixels = image.data.slice(); } }) });
  const page = mountExperiment(sunset, { doc, raf: fn => { callback = fn; }, presets: false, serviceWorker: null });
  const frame = (dt = 16) => { stamp += dt; callback(stamp); };
  const $ = id => doc.getElementById(id);

  // Controls: View first, then the seed, the shared sun, and the lighting sliders, with tooltips on buttons.
  assert.deepEqual($("controls").children.map(label => label.children.find(child => ["INPUT", "SELECT"].includes(child.tagName))?.id),
    ["drift", "view", "seed", "sunPhase", ...SUN_PATH_KEYS, "extinction", "slabDepth", "albedo", "g", "airOpticalDepth", "ambient", "exposure"]);
  assert.deepEqual($("playback").children.map(button => button.textContent), ["Play sun", "Reset sun", "New density seed"]);
  assert.ok($("playback").children.every(button => button.title));

  frame(); const initial = pixels;
  assert.ok(initial.length === 32 * 20 * 4);
  assert.match($("stats").textContent, /^Seed 42 · density fixed · sun 15° across, 20\.3° up$/);

  // A slider redraws.
  $("extinction").value = "0.3"; $("extinction").fire("input"); frame();
  assert.notDeepEqual(pixels, initial);
  assert.equal(page.getParams().extinction, 0.3);

  // Play runs the clock; the sun moves along the shared path.
  $("play").fire("click"); assert.equal($("play").textContent, "Pause sun");
  const before = page.clock.time;
  for (let i = 0; i < 10; i++) frame(100);
  assert.ok(Math.abs(page.clock.time - before - 1) < 1e-9);
  const sun = sunAt(page.clock.time, DEFAULT_SUN_SHAPE);
  assert.equal($("stats").textContent, `Seed 42 · density fixed · sun ${sun.azimuth.toFixed(0)}° across, ${sun.elevation.toFixed(1)}° up`);

  // Moving the sun by hand stops it there.
  $("sunPhase").value = "0.6"; $("sunPhase").fire("input");
  assert.equal($("play").textContent, "Play sun");
  frame(500); frame(500);
  assert.ok(Math.abs(page.getParams().sunPhase - 0.6) < 1e-9);

  // The shared path's shape settings move the sun without starting or stopping it.
  $("sunPathY").value = "-3"; $("sunPathY").fire("input"); $("sunPathHeight").value = "10"; $("sunPathHeight").fire("input"); frame();
  const moved = sunAtPhase(0.6, { ...DEFAULT_SUN_SHAPE, sunPathY: -3, sunPathHeight: 10 });
  assert.equal($("play").textContent, "Play sun");
  assert.match($("stats").textContent, new RegExp(`sun ${moved.azimuth.toFixed(0)}° across, ${moved.elevation.toFixed(1).replace(".", "\\.")}° up$`));
  assert.equal(page.getParams().sunPathY, -3);

  // Params round-trip, including the sun's place and path shape; untrusted values are cleaned.
  const saved = page.getParams();
  assert.deepEqual(Object.keys(saved).sort(), [...sunset.params.map(param => param.key), "sunPhase", ...SUN_PATH_KEYS, "resolution", "drift"].sort());
  page.applyParams({ ...saved, extinction: 5, view: "nope", seed: "x", sunPhase: 0.25 });
  frame();
  assert.equal($("extinction").value, "0.5");
  assert.equal(page.getParams().view, "light");
  assert.equal(page.getParams().seed, 42);
  assert.ok(Math.abs(page.getParams().sunPhase - 0.25) < 1e-9);
  // Saved before the path had settings: the default shape comes back.
  page.applyParams({ sunPhase: 0.25 }); frame();
  assert.deepEqual(SUN_PATH_KEYS.map(key => page.getParams()[key]), SUN_PATH_KEYS.map(key => DEFAULT_SUN_SHAPE[key]));
  assert.equal($("sunPathY").value, String(DEFAULT_SUN_SHAPE.sunPathY));
  page.applyParams(saved); frame();
  assert.deepEqual(page.getParams(), saved);
  // An old fixed sun (sunAzimuth/sunElevation, sunSpeed) lands at the nearest point on the path.
  page.applyParams({ sunAzimuth: -15, sunElevation: -1.2, sunSpeed: 0.3 }); frame();
  const landed = sunAtPhase(page.getParams().sunPhase);
  assert.ok(Math.hypot(landed.azimuth + 15, landed.elevation + 1.2) < 6, JSON.stringify(landed));
  assert.equal("sunSpeed" in page.getParams(), false);

  // Reset sun returns to the starting point, paused; defaults reproduce the first picture.
  $("play").fire("click"); frame(100); $("reset").fire("click"); frame();
  assert.equal(page.clock.playing, false);
  assert.equal(page.clock.time, timeForPhase(DEFAULT_SUN_PHASE));
  page.applyParams({ sunPhase: DEFAULT_SUN_PHASE }); frame();
  assert.deepEqual(pixels, initial);

  // A new density seed changes the droplets.
  $("new-seed").fire("click"); frame();
  assert.notEqual(page.getParams().seed, 42);
  assert.notDeepEqual(pixels, initial);
  assert.ok(SUN_PATH.period > 0);
  page.dispose();
});
