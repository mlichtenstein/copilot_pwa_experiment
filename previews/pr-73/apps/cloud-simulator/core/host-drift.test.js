/* Purpose: Check the shared Drift checkbox on every experiment page: it heads the controls
 *   with its explanation beside it, moves only the driftable sliders (never the sun, its path
 *   sliders, playback speeds, restarting sliders, seeds, choices or toggles), only while
 *   playing, gives a dragged slider to the person, holds greyed-out sliders, saves as `drift`
 *   without breaking old links, and an experiment can opt out with drift: false; the Drift
 *   speed slider (0.1× to 10×, saved as `driftSpeed`, old links at 1×) and Randomize (the same
 *   sliders to random values in range, nothing else) sit beside it.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, host.js, experiment.js,
 *   registry.js, sun-path.js and fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { mountExperiment } from "./host.js";
import { driftableParams, validateExperiment } from "./experiment.js";
import { experiments } from "./registry.js";
import { SUN_PATH_PARAMS } from "./sun-path.js";
import { fakeDocument, fakeCanvas, manualFrames, imageDocument } from "./fake-dom.js";

// Every page's containers, with canvases that can decode Valley's bitmaps.
function pageDocument() {
  const doc = fakeDocument(["sky", "presets", "playback", "controls", "stats", "status", "legend", "cloud-status", "patterns", "pattern-buttons"]);
  const images = imageDocument(), make = doc.createElement;
  doc.createElement = tag => {
    const node = make(tag);
    if (tag === "canvas") {
      const decoder = images.createElement("canvas").getContext("2d");
      node.getContext = () => ({ ...decoder, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} });
    }
    return node;
  };
  return doc;
}

const EXPECTED = {
  sunset: ["extinction", "slabDepth", "albedo", "g", "airOpticalDepth", "ambient", "exposure"],
  horizon: ["cloudAltitude", "altitudeSpread", "distanceScale", "airDensity", "aerosol", "exposure"],
  shafts: ["cloudOpacity", "haze", "cloudSharpness", "sourceRadius", "edgeFeather"],
  noise: ["cloudiness", "featureSize", "texture", "changeSpeed", "wind", "layerHeight", "layerThickness", "layerAsymmetry", "persistence", "rainAmount", "fallSpeed"],
  convection: ["inversionHeight", "lclHeight", "buoyancy", "viscosity", "heating", "cooling", "latentHeat", "expansion", "evaporation", "autoconversion", "fallSpeed", "flicker"],
  valley: ["textureBlend", "wind", "formationSpeed", "cloudY", "bandWidth", "coverage", "maskSoftness", "windwardClearance", "leewardClearance", "textureScale", "opacity", "noiseScale", "noiseDrift"]
};

for (const entry of experiments) {
  test(`Drift on ${entry.title}: heads the controls, moves only its sliders, only while playing`, async () => {
    const experiment = await entry.load();
    assert.deepEqual(driftableParams(experiment).map(param => param.key), EXPECTED[experiment.id], "which sliders drift");
    const doc = pageDocument(), $ = id => doc.getElementById(id);
    fakeCanvas(doc, 32, 20);
    const { raf, frame } = manualFrames();
    const page = mountExperiment(experiment, { doc, raf, presets: false, serviceWorker: null, playing: false });
    await page.instance.ready; await new Promise(resolve => setTimeout(resolve, 0));
    page.setPlaying(false); frame();

    // The checkbox is the first thing in the controls, off, with its explanation beside it.
    const label = $("controls").children[0];
    assert.equal(label.className, "drift"); assert.equal(label.children[0], $("drift")); assert.equal($("drift").checked, false);
    assert.match(label.children.at(-1).textContent, /every slider below wanders slowly/);
    assert.equal(/sun and its path sliders stay put/.test(label.children.at(-1).textContent), experiment.sun);
    assert.ok(!$("playback").children.includes(label));
    // Next come the Drift speed slider and Randomize, each with its explanation beside it.
    const [speedLabel, randomizeRow] = $("controls").children.slice(1, 3);
    assert.equal(speedLabel.className, "drift drift-speed"); assert.ok(speedLabel.children.includes($("drift-speed")));
    assert.match(speedLabel.children.at(-1).textContent, /Scales each drift step/); assert.match(speedLabel.title, /0\.1× to 10×/);
    assert.equal(randomizeRow.children[0], $("randomize")); assert.match(randomizeRow.children.at(-1).textContent, /random value in its range/);
    assert.match($("randomize").title, /random value in its range/);
    assert.equal(page.getParams().driftSpeed, 1); assert.equal(Number($("drift-speed").value), 0);

    const before = page.getParams();
    $("drift").checked = true; $("drift").fire("change");
    for (let i = 0; i < 20; i++) frame(500);
    assert.deepEqual(page.getParams(), { ...before, drift: true }, "paused: nothing drifts");

    page.setPlaying(true);
    const time = page.clock.time;
    for (let i = 0; i < 120; i++) frame(500);
    page.setPlaying(false); frame();
    const after = page.getParams(), drifting = new Set(EXPECTED[experiment.id]);
    assert.ok(EXPECTED[experiment.id].filter(key => after[key] !== before[key]).length >= 2, "sliders wandered");
    for (const param of experiment.params) {
      if (param.kind === "range" && drifting.has(param.key)) {
        assert.ok(after[param.key] >= param.min && after[param.key] <= param.max, `${param.key} stays in range`);
        assert.equal(after[param.key], Number($(param.key).value), `${param.key} shows its value`);
      } else if (param.key !== "resolution") assert.deepEqual(after[param.key], before[param.key], `${param.key} does not drift`);
    }
    if (experiment.sun) {
      for (const param of SUN_PATH_PARAMS) assert.equal(after[param.key], before[param.key], `${param.key} does not drift`);
      assert.ok(page.clock.time > time, "the sun kept moving on its own clock");
    }

    // Randomize: only the sliders Drift moves jump, each to a value inside its range; the sun,
    // its path, seeds, choices, toggles and the speed slider stay.
    const preRandom = page.getParams();
    $("randomize").fire("click"); frame();
    const randomized = page.getParams();
    assert.ok(EXPECTED[experiment.id].filter(key => randomized[key] !== preRandom[key]).length >= 2, "Randomize moved the sliders");
    for (const param of experiment.params) {
      if (drifting.has(param.key)) {
        assert.ok(randomized[param.key] >= param.min && randomized[param.key] <= param.max, `${param.key} randomized in range`);
        assert.equal(randomized[param.key], Number($(param.key).value), `${param.key} shows its random value`);
      } else if (param.key !== "resolution") assert.deepEqual(randomized[param.key], preRandom[param.key], `${param.key} is not randomized`);
    }
    for (const key of ["driftSpeed", "drift", "sunPhase", ...SUN_PATH_PARAMS.map(param => param.key)]) assert.equal(randomized[key], preRandom[key], `${key} is not randomized`);

    // The speed slider: log scale, 1× in the middle, 10× at the right.
    $("drift-speed").value = "1"; $("drift-speed").fire("input");
    assert.equal(page.getParams().driftSpeed, 10); assert.equal($("drift-speed").nextSibling?.textContent ?? speedLabel.children.find(node => node.tagName === "OUTPUT" || node.tagName === "output")?.textContent, "10.0×");

    // A slider someone is holding is theirs.
    const key = EXPECTED[experiment.id][0], held = $(key);
    held.fire("pointerdown"); held.value = String(experiment.params.find(param => param.key === key).min); held.fire("input");
    page.setPlaying(true);
    for (let i = 0; i < 40; i++) frame(500);
    assert.equal(page.getParams()[key], Number(held.value)); assert.equal(Number(held.value), experiment.params.find(param => param.key === key).min);
    page.setPlaying(false);

    // Ratings and ?p= links: drift and its speed save; links from before them (no drift or
    // driftSpeed key) still load, at 1×.
    const saved = page.getParams();
    assert.equal(saved.driftSpeed, 10);
    page.applyParams({ ...saved, drift: false, driftSpeed: 0.1 }); frame();
    assert.equal($("drift").checked, false); assert.equal(page.getParams()[key], saved[key]);
    assert.equal(page.getParams().driftSpeed, 0.1); assert.equal(Number($("drift-speed").value), -1);
    const { drift, driftSpeed, ...old } = before;
    page.applyParams(old); frame();
    assert.deepEqual(page.getParams(), { ...before, drift: false, driftSpeed: 1, ...(experiment.sun ? { sunPhase: page.getParams().sunPhase } : {}) });
    page.dispose();
  });
}

test("Drift: an experiment can opt out, and greyed-out sliders hold still", () => {
  const toy = (extra = {}) => validateExperiment({
    id: "toy", title: "Toy", app: "cloud-simulator/toy", width: 4, height: 3, sun: false,
    params: [
      { key: "mode", kind: "select", options: [["a", "A"], ["b", "B"]], default: "a" },
      { key: "gain", kind: "range", min: 0, max: 10, step: 1, default: 5 },
      { key: "level", kind: "range", min: 0, max: 10, step: 1, default: 5, enabled: params => params.mode === "b" }
    ],
    create: ({ width, height }) => ({ update() {}, step() {}, render: () => new Uint8ClampedArray(width * height * 4), dispose() {} }),
    ...extra
  });
  const mount = experiment => {
    const doc = fakeDocument(), { raf, frame } = manualFrames();
    fakeCanvas(doc, 4, 3);
    return { page: mountExperiment(experiment, { doc, raf, presets: false, serviceWorker: null }), frame, $: id => doc.getElementById(id) };
  };
  const off = mount(toy({ drift: false }));
  assert.equal(off.$("drift"), null); assert.equal("drift" in off.page.getParams(), false);

  const { page, frame, $ } = mount(toy());
  assert.equal($("level").disabled, true);
  $("drift").checked = true; $("drift").fire("change"); page.setPlaying(true);
  for (let i = 0; i < 200; i++) frame(500);
  assert.notEqual(page.params.gain, 5); assert.equal(page.params.level, 5, "disabled: holds still");
  // Randomize also leaves greyed-out sliders alone, and the select.
  page.setPlaying(false);
  const values = new Set();
  for (let i = 0; i < 20; i++) { $("randomize").fire("click"); frame(); values.add(page.params.gain); assert.equal(page.params.level, 5); assert.equal(page.params.mode, "a"); }
  assert.ok(values.size >= 5, `Randomize spreads gain over its range: ${[...values]}`);
});

test("Drift: its slider changes redraw at the experiment's frame rate, not every frame", () => {
  let renders = 0;
  const experiment = validateExperiment({
    id: "slow", title: "Slow", app: "cloud-simulator/slow", width: 4, height: 3, sun: false, frameInterval: 1000,
    params: [{ key: "gain", kind: "range", min: 0, max: 10, step: 0.01, default: 5 }],
    create: ({ width, height }) => ({ update() {}, step: () => false, render: () => { renders += 1; return new Uint8ClampedArray(width * height * 4); }, dispose() {} })
  });
  const doc = fakeDocument(), { raf, frame } = manualFrames(), $ = id => doc.getElementById(id);
  fakeCanvas(doc, 4, 3);
  const page = mountExperiment(experiment, { doc, raf, presets: false, serviceWorker: null });
  frame(); renders = 0;
  $("drift").checked = true; $("drift").fire("change"); page.setPlaying(true);
  for (let i = 0; i < 300; i++) frame(20);
  assert.notEqual(page.params.gain, 5);
  assert.ok(renders >= 5 && renders <= 7, `about one redraw a second over 6 s, got ${renders}`);
  // A person's own change still redraws at once.
  page.setPlaying(false); renders = 0; $("gain").value = "1"; $("gain").fire("input"); frame(20);
  assert.equal(renders, 1);
});
