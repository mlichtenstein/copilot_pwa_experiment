/* Purpose: Check Lightning on the shared core host: the common panel (no Play of its own),
 *   its two own start buttons with their help beside them, Step as one 1/60-second scene
 *   step, Play driving the scene from the shared clock, sliders changing the running scene,
 *   New seed, and ratings and links saved by its old host ({ version: 1, seed, params, start })
 *   still loading.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, lightning-experiment.js,
 *   lightning-model.js, core/host.js and core/fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { lightning } from "./lightning-experiment.js";
import { lightningScene } from "./lightning-model.js";
import { mountExperiment } from "./core/host.js";
import { fakeDocument, fakeCanvas, manualFrames, controlIds } from "./core/fake-dom.js";

test("Lightning on the core host: common panel, own start buttons, Step, Play, old ratings", () => {
  const doc = fakeDocument(), canvas = fakeCanvas(doc, 160, 100), { raf, frame } = manualFrames(), $ = id => doc.getElementById(id);
  const page = mountExperiment(lightning, { doc, raf, presets: false, serviceWorker: null });
  frame();
  const session = () => page.instance.session;
  assert.deepEqual(controlIds($("playback")), ["play", "step", "randomize", "new-seed", "drift", "drift-speed", "timeOfDay"]);
  assert.equal($("play").textContent, "Play", "starts paused on a prepared strike");
  assert.equal($("controls").children[0].textContent, "Lightning settings");
  assert.deepEqual(controlIds($("controls")).slice(0, 2), ["next-shape", "before-strike"]);
  assert.deepEqual(["next-shape", "before-strike"].map(id => $(id).textContent), ["Next shape", "Before strike"]);
  assert.match($("next-shape").parentNode.children[1].textContent, /paused at peak/);
  assert.match($("before-strike").parentNode.children[1].textContent, /just before growth/);
  assert.equal($("seed"), null, "the seed stays internal"); assert.equal($("start"), null);
  assert.equal(canvas.pixels().length, 160 * 100 * 4);
  assert.match($("stats").textContent, /t 0\.00 s · [\d.]+ ms\/render$/);

  // Step: one fixed scene step, paused.
  const t0 = session().state.time;
  $("step").fire("click"); frame();
  assert.ok(Math.abs(session().state.time - t0 - lightningScene.dt) < 1e-9); assert.equal($("play").textContent, "Play");

  // Play advances the scene from the shared clock; Pause stops it.
  $("play").fire("click"); for (let i = 0; i < 30; i++) frame(1000 / 60);
  $("play").fire("click"); frame();
  const t1 = session().state.time;
  assert.ok(t1 > t0 + 0.4, `played about half a second, got ${t1 - t0}`);
  for (let i = 0; i < 10; i++) frame(100);
  assert.equal(session().state.time, t1, "paused: the scene holds");

  // Sliders change the running scene (snapped to their steps) without restarting it.
  $("haze").value = "0.35"; $("haze").fire("input"); frame();
  assert.equal(session().params.haze, 0.35); assert.equal(page.getParams().haze, 0.35); assert.equal(session().state.time, t1);

  // Its own buttons: a fresh strike on a new seed, paused at the chosen moment.
  let seed = page.getParams().seed;
  $("play").fire("click"); $("before-strike").fire("click"); frame();
  assert.equal($("play").textContent, "Play"); assert.equal(page.getParams().start, "before"); assert.equal(session().start, "before");
  assert.notEqual(page.getParams().seed, seed); assert.equal(session().seed, page.getParams().seed); assert.equal(session().state.time, 0);
  seed = page.getParams().seed;
  $("next-shape").fire("click"); frame();
  assert.equal(session().start, "peak"); assert.notEqual(session().seed, seed);
  // The common New seed: a fresh strike in the current starting mode.
  seed = page.getParams().seed;
  $("new-seed").fire("click"); frame();
  assert.notEqual(session().seed, seed); assert.equal(session().start, "peak");

  // Ratings and ?p= links from Lightning's own host still load.
  const old = { version: 1, seed: 7, params: { haze: 0.2, chargeRate: 1.5 }, start: "before" };
  page.applyParams(old); frame();
  const loaded = page.getParams();
  assert.equal(loaded.seed, 7); assert.equal(loaded.start, "before"); assert.equal(loaded.haze, 0.2);
  assert.equal(session().seed, 7); assert.equal(session().start, "before"); assert.equal(session().params.haze, 0.2);
  // Same strike as the old host made for that rating.
  const reference = mountExperiment(lightning, { doc: (() => { const d = fakeDocument(); fakeCanvas(d, 160, 100); return d; })(), raf: () => {}, presets: false, serviceWorker: null });
  reference.applyParams(loaded);
  assert.deepEqual(reference.instance.session.state, session().state);
  // Old ratings without a start, and the new flat format, both round-trip.
  page.applyParams({ version: 1, seed: 9, params: {} }); assert.equal(page.getParams().start, "peak"); assert.equal(page.getParams().seed, 9);
  page.applyParams(loaded); assert.deepEqual(page.getParams(), loaded);
  page.dispose(); reference.dispose();
});
