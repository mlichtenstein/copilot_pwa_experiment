/* Purpose: Check the shared Drift checkbox on every experiment page: it sits in the common
 *   panel with its explanation beside it, moves only the driftable sliders (never the sun, its path
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

// The visible name in the Drift speed label (a <code> before the slider).
const speedLabelCode = input => input.parentNode.children.find(node => node.tagName === "CODE")?.textContent;
import { experiments } from "./registry.js";
import { SUN_PATH_PARAMS } from "./sun-path.js";
import { fakeDocument, fakeCanvas, manualFrames, imageDocument, helpOf } from "./fake-dom.js";

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
  "normal-lighting": ["gradientStart", "gradientEnd", "gradientWarp", "nightBrightness", "nightSaturation", "gradientPosition", "gradientCompression", "gradientStrength", "wrap", "diffusionAmount", "diffusionDistance"],
  weather: ["airDensity", "aerosol", "exposure", "cloudAltitude", "altitudeSpread", "coverage", "textureMix", "wind", "formationSpeed", "cloudOpacity", "cloudSharpness", "haze", "shaftStrength", "edgeFeather", "rainAmount", "storminess", "chargeBias"],
  sunset: ["extinction", "slabDepth", "albedo", "g", "airOpticalDepth", "ambient", "exposure"],
  horizon: ["cloudAltitude", "altitudeSpread", "distanceScale", "airDensity", "aerosol", "exposure"],
  shafts: ["cloudOpacity", "haze", "cloudSharpness", "sourceRadius", "edgeFeather"],
  noise: ["cloudiness", "featureSize", "texture", "changeSpeed", "wind", "layerHeight", "layerThickness", "layerAsymmetry", "persistence", "rainAmount", "fallSpeed"],
  convection: ["inversionHeight", "lclHeight", "buoyancy", "viscosity", "heating", "cooling", "latentHeat", "expansion", "evaporation", "autoconversion", "fallSpeed", "flicker"],
  valley: ["textureBlend", "wind", "formationSpeed", "cloudY", "bandWidth", "coverage", "maskSoftness", "windwardClearance", "leewardClearance", "textureScale", "opacity", "noiseScale", "noiseDrift"],
  lightning: ["fieldBias", "roughness", "branchChance", "leaderSpeed", "flashDuration", "flashStrength", "haze", "chargeRate", "chargeBias", "breakdownGradient"]
};

for (const entry of experiments) {
  test(`Drift on ${entry.title}: in the common panel, moves only its sliders, only while playing`, async () => {
    const experiment = await entry.load();
    assert.deepEqual(driftableParams(experiment).map(param => param.key), EXPECTED[experiment.id], "which sliders drift");
    const doc = pageDocument(), $ = id => doc.getElementById(id);
    fakeCanvas(doc, 32, 20);
    const { raf, frame } = manualFrames();
    const page = mountExperiment(experiment, { doc, raf, presets: false, serviceWorker: null, playing: false });
    await page.instance.ready; await new Promise(resolve => setTimeout(resolve, 0));
    page.setPlaying(false); frame();

    // The checkbox is in the common panel's Drift row, on by default, beside the Drift speed slider; Randomize
    // is in the buttons row. Their explanations are hidden, shown on hold (hold-help.test.js).
    // (common-panel.test.js checks the texts match on every page.)
    const label = $("drift").parentNode, row = label.parentNode;
    assert.equal(label.className, "drift help-host"); assert.equal(row.className, "panel-row drift-row"); assert.equal(row.parentNode, $("playback"));
    assert.equal($("drift").checked, true, "Drift is on on a fresh load");
    assert.equal(page.getParams().drift, true);
    assert.match(helpOf(doc, $("drift")), /On by default.*sliders wander slowly/);
    assert.equal(speedLabelCode($("drift-speed")), "driftSpeed", "the Drift speed label is its code name");
    const speedLabel = $("drift-speed").parentNode, randomizeRow = $("randomize").parentNode.parentNode;
    assert.equal(speedLabel.className, "drift-speed help-host"); assert.equal(speedLabel.parentNode, row);
    assert.equal(randomizeRow.className, "panel-row buttons"); assert.equal(randomizeRow.parentNode, $("playback"));
    assert.match(helpOf(doc, $("drift-speed")), /Scales each drift step|0\.1× to 10×/);
    assert.match(helpOf(doc, $("randomize")), /Randomizes scene settings: sliders/); assert.ok(!$("randomize").title);
    assert.equal(page.getParams().driftSpeed, 1); assert.equal(Number($("drift-speed").value), 0);

    const before = page.getParams();
    for (let i = 0; i < 20; i++) frame(500);
    assert.deepEqual(page.getParams(), before, "paused: nothing drifts, though Drift is on");

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

    // Randomize (randomize.test.js covers it in depth): the Drift sliders jump inside their
    // ranges and show it; Drift and its speed stay.
    const preRandom = page.getParams();
    $("randomize").fire("click"); frame();
    const randomized = page.getParams();
    assert.ok(EXPECTED[experiment.id].filter(key => randomized[key] !== preRandom[key]).length >= 2, "Randomize moved the sliders");
    for (const param of experiment.params) if (drifting.has(param.key)) {
      assert.ok(randomized[param.key] >= param.min && randomized[param.key] <= param.max, `${param.key} randomized in range`);
      assert.equal(randomized[param.key], Number($(param.key).value), `${param.key} shows its random value`);
    }
    for (const key of ["driftSpeed", "drift"]) assert.equal(randomized[key], preRandom[key], `${key} is not randomized`);
    page.applyParams(preRandom); frame();

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

    // Ratings and ?p= links: drift and its speed save and load as saved (on or off); links from
    // before them (no drift or driftSpeed key) load with Drift off, as they were made, at 1×.
    const saved = page.getParams();
    assert.equal(saved.driftSpeed, 10);
    page.applyParams({ ...saved, drift: false, driftSpeed: 0.1 }); frame();
    assert.equal($("drift").checked, false); assert.equal(page.getParams()[key], saved[key]);
    assert.equal(page.getParams().driftSpeed, 0.1); assert.equal(Number($("drift-speed").value), -1);
    const { drift, driftSpeed, ...old } = before;
    page.applyParams({ ...saved, drift: true }); frame();
    assert.equal($("drift").checked, true, "a saved drift: true loads on");
    page.applyParams(old); frame();
    assert.equal($("drift").checked, false, "a look saved before Drift loads with it off");
    assert.deepEqual(page.getParams(), { ...before, drift: false, driftSpeed: 1, sunPhase: page.getParams().sunPhase });
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
  // Randomize gives greyed-out sliders and the select random values too.
  page.setPlaying(false);
  const values = new Set(), levels = new Set(), modes = new Set();
  for (let i = 0; i < 20; i++) { $("randomize").fire("click"); frame(); values.add(page.params.gain); levels.add(page.params.level); modes.add(page.params.mode); }
  assert.ok(values.size >= 5, `Randomize spreads gain over its range: ${[...values]}`);
  assert.ok(levels.size >= 5, "and the greyed-out level"); assert.deepEqual([...modes].sort(), ["a", "b"]);
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
