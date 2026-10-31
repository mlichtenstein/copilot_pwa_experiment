/* Purpose: Check Noise weather on the shared host: it plays on load at 20 ticks a second,
 *   Step and Reset work on the current run, a new seed restarts, the view changes only the
 *   picture, Drift moves the sliders while playing, and saved ratings round-trip.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, noise-experiment.js,
 *   core/host.js and core/fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { noise } from "./noise-experiment.js";
import { mountExperiment } from "./core/host.js";
import { fakeDocument, fakeCanvas, manualFrames } from "./core/fake-dom.js";

test("Noise weather: autoplay ticks, Step, Reset, New seed, views, Drift and saved runs", () => {
  const doc = fakeDocument(["sky", "presets", "playback", "controls", "stats", "status", "legend"]);
  const canvas = fakeCanvas(doc, 32, 24), { raf, frame } = manualFrames(), $ = id => doc.getElementById(id);
  const page = mountExperiment(noise, { doc, raf, presets: false, serviceWorker: null, playing: true });
  const tick = () => Number(/^Tick (\d+)/.exec($("stats").textContent)[1]);
  frame();
  assert.deepEqual($("playback").children.map(node => node.textContent || node.className), ["Pause", "Step", "Reset", "New seed"]);
  assert.deepEqual($("controls").children.map(node => node.tagName === "FIELDSET" ? node.children[0].children[0].textContent : node.className === "drift" ? "drift" : node.children.find(child => child.tagName === "SELECT").id),
    ["drift", "view", "Sky", "Cloud layer", "Rain"]);
  assert.match($("stats").textContent, /^Tick 0 · Cloud \d+% · Rain in air \d+\.\d\d · Puddles \d+\.\d\d$/);
  assert.match($("legend").textContent, /^Sunset:/);

  for (let i = 0; i < 10; i++) frame(100);
  assert.equal(tick(), 20, "20 ticks a second");
  const seed = page.getParams().seed;

  $("view").value = "pressure"; $("view").fire("change"); frame(0);
  assert.equal(tick(), 20, "a view change keeps the run"); assert.match($("legend").textContent, /^Pressure:/);

  $("step").fire("click"); frame(); assert.equal(tick(), 21); assert.equal($("play").textContent, "Play");
  frame(500); assert.equal(tick(), 21, "paused");
  $("view").value = "sunset"; $("view").fire("change");
  $("reset").fire("click"); frame(); assert.equal(tick(), 0); assert.equal(page.getParams().seed, seed);
  const restarted = canvas.pixels();
  $("cloudiness").value = "0.6"; $("cloudiness").fire("input"); frame();
  assert.notDeepEqual(canvas.pixels(), restarted, "paused slider changes show at once");
  $("new-seed").fire("click"); frame(); assert.notEqual(page.getParams().seed, seed); assert.equal(tick(), 0);

  // Drift moves the sliders only while playing.
  $("drift").checked = true; $("drift").fire("change");
  const before = page.getParams();
  frame(1000); assert.deepEqual(page.getParams(), before);
  $("play").fire("click"); for (let i = 0; i < 100; i++) frame(250);
  const drifted = page.getParams();
  assert.ok(["wind", "cloudiness", "featureSize"].some(key => drifted[key] !== before[key]));
  assert.equal(drifted.seed, before.seed);

  // A saved run (old ratings stored sliders, seed, view and drift) restores and restarts.
  page.applyParams({ ...noise.params.reduce((all, param) => ({ ...all, [param.key]: param.default }), {}), seed: 7, view: "water", drift: false, wind: 0.3 });
  frame(0);
  assert.deepEqual(Object.keys(page.getParams()).sort(), [...noise.params.map(param => param.key), "resolution", "drift"].sort());
  assert.equal(page.getParams().seed, 7); assert.equal($("view").value, "water"); assert.equal($("drift").checked, false);
  assert.equal(Number($("wind").value), 0.3); assert.equal(tick(), 0);
});
