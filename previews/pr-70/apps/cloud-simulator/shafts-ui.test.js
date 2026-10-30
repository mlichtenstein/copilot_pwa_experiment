/* Purpose: Check Light shafts on the shared host: strategy radios redraw and grey out the
 *   visibility-only sliders, pattern buttons change one cloud picture, Reset experiment
 *   restores lighting and patterns but keeps the strategy, the shared sun plays inside the
 *   scene's limits, and old links with fixed sun angles still load.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, shafts-experiment.js,
 *   core/host.js, core/sun-path.js and core/fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { shafts, sceneSun, SUN_LIMITS } from "./shafts-experiment.js";
import { mountExperiment } from "./core/host.js";
import { DEFAULT_SUN_SHAPE, sunAt } from "./core/sun-path.js";
import { fakeDocument, fakeCanvas, manualFrames } from "./core/fake-dom.js";

test("Light shafts: strategies, patterns, reset keeps the strategy, the shared sun stays in the scene's limits", () => {
  const doc = fakeDocument(["sky", "presets", "playback", "controls", "stats", "status", "patterns", "pattern-buttons"]);
  const canvas = fakeCanvas(doc, 32, 20), { raf, frame } = manualFrames(), $ = id => doc.getElementById(id);
  const page = mountExperiment(shafts, { doc, raf, presets: false, serviceWorker: null });
  const input = (id, value) => { $(id).value = String(value); $(id).fire("input"); frame(); };
  const strategy = name => {
    for (const mode of ["visibility", "layered", "geometric"]) $("strategy-" + mode).checked = mode === name;
    $("strategy-" + name).fire("change"); frame();
  };
  frame();
  const first = canvas.pixels();
  assert.deepEqual($("playback").children.map(button => button.textContent), ["Play sun", "Reset sun", "Reset experiment"]);
  assert.deepEqual($("pattern-buttons").children.map(button => button.textContent), ["Change near", "Change middle", "Change far"]);
  assert.equal($("patterns").textContent, "near: 42 · middle: 1039 · far: 2036");
  assert.match($("stats").textContent, /^3 cloud layers · layered visibility · \d+ ms\/frame$/);
  assert.equal($("strategy-layered").checked, true);

  strategy("geometric"); assert.notDeepEqual(canvas.pixels(), first);
  assert.equal($("sourceRadius").disabled, true); assert.equal($("edgeFeather").disabled, true);
  strategy("visibility"); assert.notDeepEqual(canvas.pixels(), first);
  strategy("layered"); assert.deepEqual(canvas.pixels(), first); assert.equal($("sourceRadius").disabled, false);
  input("edgeFeather", 0); assert.notDeepEqual(canvas.pixels(), first);
  input("edgeFeather", 4); assert.deepEqual(canvas.pixels(), first);

  $("new-nearPattern").fire("click"); frame();
  assert.equal($("patterns").textContent, "near: 43 · middle: 1039 · far: 2036");
  assert.notDeepEqual(canvas.pixels(), first);
  strategy("geometric"); input("haze", 0.8);
  $("reset-experiment").fire("click"); frame();
  assert.equal($("patterns").textContent, "near: 42 · middle: 1039 · far: 2036");
  assert.equal(Number($("haze").value), 0.35); assert.equal($("strategy-geometric").checked, true, "reset keeps the strategy");
  strategy("layered"); assert.deepEqual(canvas.pixels(), first);

  // The shared sun moves; the scene holds it above its horizon and inside its reach.
  $("play").fire("click"); for (let i = 0; i < 20; i++) frame(200);
  assert.ok(page.clock.time > 0); assert.notDeepEqual(canvas.pixels(), first);
  assert.deepEqual(sceneSun({ elevation: -5, azimuth: 60 }), { sunElevation: SUN_LIMITS.elevation[0], sunAzimuth: SUN_LIMITS.azimuth[1] });

  // Old links: the fixed sun angles go to the nearest point on the path; sunSpeed is dropped;
  // the strategy and lighting come back.
  page.applyParams({ sunElevation: 8, sunAzimuth: -8, sunSpeed: 3, haze: 0.5, strategy: "visibility" });
  const sun = sunAt(page.clock.time, DEFAULT_SUN_SHAPE);
  assert.ok(Math.hypot(sun.azimuth + 8, sun.elevation - 8) < 4);
  assert.equal(page.getParams().strategy, "visibility"); assert.equal(page.getParams().haze, 0.5);
  assert.equal($("play").textContent, "Play sun");
});
