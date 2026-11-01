/* Purpose: Check Randomize on every page with a fixed random source: each press moves the time
 *   of day, the sun path's shape (sun pages), scene menus and radios, toggles, seeds and sliders
 *   (greyed-out ones too); every value it picks is valid for its setting; and the playback
 *   controls (Play/Pause, Drift, its speed, the grid size, playback speeds, Lightning's start), inspection views and layer visibility
 *   stay as they were. The same random source gives the same results.
 * Consumers: Node test runner.
 * Dependencies: node:test, node:assert, host.js, experiment.js, registry.js, sun-path.js,
 *   fake-dom.js and shared/drift.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { mountExperiment } from "./host.js";
import { cleanParam, randomizableParams } from "./experiment.js";
import { experiments } from "./registry.js";
import { SUN_PATH_KEYS, SUN_PATH_PARAMS } from "./sun-path.js";
import { pageDocument, fakeCanvas, manualFrames } from "./fake-dom.js";
import { seededRandom } from "../../shared/drift.js";

const PRESSES = 12;
// Settings Randomize must leave alone, by page (besides drift and driftSpeed everywhere).
const KEPT = { sunset: ["view"], noise: ["view"], convection: ["resolution", "speed", "view"], weather: ["view", "inspectLayer", "near", "middle", "far", "lightingMode"], lightning: ["start"] };

async function mount(entry, seed) {
  const experiment = await entry.load();
  const doc = pageDocument(), $ = id => doc.getElementById(id);
  fakeCanvas(doc, 32, 20);
  const { raf, frame } = manualFrames();
  const page = mountExperiment(experiment, { doc, raf, presets: false, serviceWorker: null, playing: false, random: seededRandom(seed) });
  await page.instance.ready; await new Promise(resolve => setTimeout(resolve, 0));
  page.setPlaying(false); frame();
  return { experiment, $, page, frame };
}

// Is `value` a value `param` can hold: the clean value, on a slider's step grid?
function valid(param, value) {
  if (cleanParam(param, value, Symbol("invalid")) !== value) return false;
  if (param.kind !== "range") return true;
  const steps = (value - param.min) / param.step;
  return value >= param.min && value <= param.max && Math.abs(steps - Math.round(steps)) < 1e-6;
}

test("Randomize moves every setting on every page and keeps the playback controls", async () => {
  for (const entry of experiments) {
    const { experiment, $, page, frame } = await mount(entry, 7);
    $("drift").checked = true; $("drift").fire("change");
    const start = page.getParams(), kept = ["drift", "driftSpeed", ...(KEPT[experiment.id] ?? [])];
    const seen = new Map(), phases = new Set(), shapes = new Set();
    for (let press = 0; press < PRESSES; press++) {
      $("randomize").fire("click"); frame();
      const params = page.getParams();
      assert.equal($("play").textContent, "Play", `${experiment.title}: still paused`);
      for (const key of kept) assert.deepEqual(params[key], start[key], `${experiment.title}: ${key} kept`);
      for (const param of randomizableParams(experiment)) {
        assert.ok(valid(param, params[param.key]), `${experiment.title}: ${param.key} = ${params[param.key]} is valid`);
        (seen.get(param.key) ?? seen.set(param.key, new Set()).get(param.key)).add(params[param.key]);
        // The control shows the new value (sliders, menus and toggles; radios through their buttons).
        const control = $(param.key);
        if (control && param.kind === "range") assert.equal(Number(control.value), params[param.key], `${experiment.title}: ${param.key} slider`);
        if (control && param.kind === "toggle") assert.equal(control.checked, params[param.key], `${experiment.title}: ${param.key} toggle`);
        if (control && param.kind === "select" && control.tagName === "SELECT") assert.equal(control.value, params[param.key], `${experiment.title}: ${param.key} menu`);
        const radio = $(`${param.key}-${params[param.key]}`);
        if (param.kind === "select" && radio?.type === "radio") assert.equal(radio.checked, true, `${experiment.title}: ${param.key} radio`);
      }
      phases.add(params.sunPhase);
      if (experiment.sun) {
        for (const param of SUN_PATH_PARAMS) assert.ok(valid(param, params[param.key]), `${experiment.title}: ${param.key} = ${params[param.key]}`);
        shapes.add(SUN_PATH_KEYS.map(key => params[key]).join());
      }
    }
    // Everything randomizable took more than one value over the presses (a toggle or a two-way
    // menu could repeat by chance, but not twelve times in a row with this seed).
    for (const param of randomizableParams(experiment)) {
      assert.ok(seen.get(param.key).size > 1, `${experiment.title}: ${param.key} changes (${[...seen.get(param.key)]})`);
      if (param.kind === "select") assert.ok(seen.get(param.key).size >= Math.min(2, param.options.length), `${experiment.title}: ${param.key} options`);
    }
    assert.equal(phases.size, PRESSES, `${experiment.title}: a new time of day each press`);
    if (experiment.sun) assert.equal(shapes.size, PRESSES, `${experiment.title}: a new sun path each press`);
    page.dispose();
  }
});

test("Randomize covers menus, radios and seeds on every page that has them", async () => {
  const kinds = new Set();
  for (const entry of experiments) {
    const experiment = await entry.load();
    for (const param of randomizableParams(experiment)) kinds.add(param.kind);
    assert.ok(randomizableParams(experiment).some(param => param.kind === "range"), `${experiment.title}: sliders`);
  }
  assert.deepEqual([...kinds].sort(), ["range", "seed", "select", "toggle"]);
});

test("the same random source gives the same Randomize results", async () => {
  for (const entry of experiments) {
    const runs = [];
    for (let run = 0; run < 2; run++) {
      const { $, page, frame } = await mount(entry, 99);
      const results = [];
      for (let press = 0; press < 3; press++) { $("randomize").fire("click"); frame(); results.push(page.getParams()); }
      runs.push(results); page.dispose();
    }
    assert.deepEqual(runs[0], runs[1], entry.title);
  }
});


test("Randomize preserves a chosen composition pass and field-layer visibility", async () => {
  const entry=experiments.find(e=>e.id==="weather"),{page,$,frame}=await mount(entry,37);
  page.applyParams({...page.getParams(),view:"pass-3",inspectLayer:"far",near:false,middle:true,far:false});frame();
  const before=page.getParams();$("randomize").fire("click");frame();const after=page.getParams();
  for(const key of KEPT.weather)assert.equal(after[key],before[key],`${key} stays chosen`);
  assert.notEqual(after.seed,before.seed);assert.notEqual(after.sunPhase,before.sunPhase);
  page.applyParams({...after,view:"cloudWater",inspectLayer:"middle"});frame();$("randomize").fire("click");frame();
  assert.equal(page.getParams().view,"cloudWater");assert.equal(page.getParams().inspectLayer,"middle");page.dispose();
});
