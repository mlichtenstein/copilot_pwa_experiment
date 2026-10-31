/* Purpose: Check the Convection study on the shared host: controls in the old order, autoplay
 *   at `speed` ticks a second, Options greying out idle controls, a resolution switch that
 *   rebuilds and links pixelArt, water and New seed restarting the run, the legend, and old
 *   saved runs restoring.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, convection-experiment.js,
 *   core/host.js and core/fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { convection } from "./convection-experiment.js";
import { mountExperiment } from "./core/host.js";
import { fakeDocument, fakeCanvas, manualFrames } from "./core/fake-dom.js";

// Fake radios are not exclusive, so pick one by hand the way a browser would.
const pick = (doc, name, value) => {
  for (const [option] of convection.params.find(param => param.key === name).options) doc.getElementById(`${name}-${option}`).checked = option === value;
  doc.getElementById(`${name}-${value}`).fire("change");
};

test("Convection study: layout, playback, options, resolution, restarts and saved runs", () => {
  const doc = fakeDocument(["sky", "presets", "playback", "controls", "stats", "status", "legend"]);
  const canvas = fakeCanvas(doc, 64, 48), { raf, frame } = manualFrames(), $ = id => doc.getElementById(id);
  const page = mountExperiment(convection, { doc, raf, presets: false, serviceWorker: null, playing: true });
  const tick = () => Number(/^Tick (\d+)/.exec($("stats").textContent)[1]);
  frame();
  assert.deepEqual($("playback").children.map(node => node.textContent), ["Pause", "Step", "Reset", "New seed"]);
  const legends = $("controls").children.filter(node => node.tagName === "FIELDSET").map(node => node.children[0].textContent);
  assert.deepEqual(legends, ["Options · part of the run’s parameters", "Starting fields · changing these resets the run"]);
  assert.equal($("controls").children.at(-1).tagName, "FIELDSET", "water sits last, after the rule sliders");
  assert.match($("stats").textContent, /^Tick 0 · Water\/cell 0\.\d{3} · Fastest flow \d+\.\d\d px\/tick$/);
  assert.match($("legend").textContent, /^Sunset: solid clouds/);
  // LCL by default: its height is live, the inversion's and expansion/evaporation idle.
  assert.equal($("lclHeight").disabled, false); assert.equal($("inversionHeight").disabled, true); assert.equal($("expansion").disabled, true);

  for (let i = 0; i < 10; i++) frame(100);
  assert.equal(tick(), 30, "30 ticks a second by default");
  $("speed").value = "10"; $("speed").fire("input");
  for (let i = 0; i < 10; i++) frame(100);
  assert.equal(tick(), 40);

  pick(doc, "layering", "inversion");
  assert.equal($("inversionHeight").disabled, false); assert.equal($("lclHeight").disabled, true); assert.equal($("expansion").disabled, false);
  pick(doc, "cloudStyle", "raw"); frame(0);
  assert.equal($("feather").disabled, true); assert.equal($("pixelArt").disabled, true);
  assert.match($("legend").textContent, /^Sunset, raw cloud water/);
  assert.equal(tick(), 40, "options keep the run");

  const seed = page.getParams().seed;
  $("step").fire("click"); frame(); assert.equal(tick(), 41); assert.equal($("play").textContent, "Play");
  $("reset").fire("click"); frame(); assert.equal(tick(), 0); assert.equal(page.getParams().seed, seed);
  $("step").fire("click"); $("water").value = "0.2"; $("water").fire("input"); frame();
  assert.equal(tick(), 0, "water restarts the run"); assert.match($("stats").textContent, /Water\/cell 0\.200/);

  // Resolution: rebuild at the new size on the same seed; pixelArt follows (and can be overridden).
  pick(doc, "resolution", "128x96"); frame();
  assert.deepEqual([canvas.width, canvas.height], [128, 96]); assert.equal($("pixelArt").checked, false);
  assert.equal(canvas.pixels().length, 128 * 96 * 4); assert.equal(page.getParams().seed, seed);
  $("pixelArt").checked = true; $("pixelArt").fire("change");
  assert.equal(page.getParams().pixelArt, true);
  pick(doc, "resolution", "64x48"); frame();
  assert.deepEqual([canvas.width, canvas.height], [64, 48]); assert.equal($("pixelArt").checked, true);

  $("new-seed").fire("click"); frame(); assert.notEqual(page.getParams().seed, seed);

  // An old saved run: its rules() plus seed, water and view, including model-only keys
  // (drag, diffusion…) the page never showed; those are dropped harmlessly.
  page.applyParams({ buoyancy: 0.02, drag: 0.004, diffusion: 0.01, layering: "none", cloudStyle: "cumulus", feather: false, pixelArt: true,
    resolution: "128x96", seed: 9, water: 0.15, view: "lamp" });
  frame();
  const saved = page.getParams();
  assert.equal(saved.buoyancy, 0.02); assert.equal(saved.layering, "none"); assert.equal(saved.feather, false); assert.equal(saved.pixelArt, true, "a saved pixelArt is kept");
  assert.equal(saved.seed, 9); assert.equal(saved.water, 0.15); assert.equal(saved.view, "lamp"); assert.equal(saved.drag, undefined);
  assert.deepEqual([canvas.width, canvas.height], [128, 96]); assert.equal(tick(), 0);
  assert.match($("legend").textContent, /^Lava lamp/);
});
