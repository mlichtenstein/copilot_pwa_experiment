/* Purpose: Check the host's optional, generic capabilities with a toy experiment: toggles,
 *   radio selects, grouped fieldsets, enabled rules, linked params (adjust), a grid-size
 *   switch that rebuilds the instance, the main seed (common New seed) and the experiment's
 *   own seeds, Step by stepSeconds, its own actions with help beside them, migrate, readouts,
 *   Drift, async loading (ready), decorations, frame-rate gating and old-key tolerance.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, host.js, fake-dom.js,
 *   experiment.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { mountExperiment } from "./host.js";
import { validateExperiment } from "./experiment.js";
import { fakeDocument, fakeCanvas, manualFrames, descendants, controlIds } from "./fake-dom.js";

function toy({ ready } = {}) {
  const log = { created: [], updates: 0, steps: 0, refreshed: 0 };
  const experiment = {
    id: "toy", title: "Toy", app: "cloud-simulator/toy", width: 4, height: 3, sun: false, frameInterval: 100,
    autoplay: true, drift: true, seed: "seed", stepSeconds: params => params.rate / 60,
    migrate: raw => raw?.version === 1 ? { ...raw.params, seed: raw.seed } : raw,
    params: [
      { key: "mode", kind: "select", display: "radio", label: "Mode", options: [["a", "A"], ["b", "B"]], default: "a", help: "Pick one.", group: "Options" },
      { key: "level", kind: "range", min: 0, max: 1, step: 0.1, default: 0.5, group: "Options", enabled: params => params.mode === "b" },
      { key: "resolution", kind: "size", options: [["4x3", "Small"], ["8x6", "Large"]], default: "4x3", group: "Options" },
      { key: "crisp", kind: "toggle", default: true, help: "Crisp edges." },
      { key: "gain", kind: "range", min: 0, max: 10, step: 1, default: 5 },
      { key: "rate", kind: "range", min: 1, max: 60, step: 1, default: 30, drift: false },
      { key: "seed", kind: "seed", default: 1, random: true },
      { key: "layout", kind: "seed", default: 1, hidden: true, next: value => value + 1, newLabel: "New layout" }
    ],
    actions: [{ id: "reset-all", label: "Reset", help: "Defaults, keeping the mode.", run: page => page.resetToDefaults({ keep: ["mode"] }) },
      { id: "louder", label: "Louder", run: page => page.setParams({ gain: 9 }) }],
    readouts: { legend: params => `mode ${params.mode}` },
    stats: (params, frame, instance) => `ticks ${instance.ticks} · layout ${params.layout}`,
    // Switching to the large grid turns crisp edges off, as Convection's resolution does.
    adjust: (next, previous) => next.resolution !== previous.resolution ? { ...next, crisp: next.resolution === "4x3" } : next,
    decorate: ({ doc, controlFor }) => {
      const badge = doc.createElement("span"); badge.id = "badge"; controlFor("mode").append(badge);
      return params => { badge.textContent = params.mode; log.refreshed += 1; };
    },
    create({ width, height, params }) {
      log.created.push(`${width}x${height}`);
      let current = params;
      return {
        ticks: 0, ready,
        update(next) { current = next; log.updates += 1; },
        // Ticks at most once per 0.5 s of clock time, reporting nothing changed in between.
        step(dt) { log.steps += 1; log.lastStep = dt; this.acc = (this.acc ?? 0) + dt; if (this.acc < 0.5) return false; this.acc = 0; this.ticks += 1; return true; },
        tick() { this.ticks += 1; },
        render: () => new Uint8ClampedArray(width * height * 4).fill(current.gain),
        dispose() {}
      };
    }
  };
  return { experiment: validateExperiment(experiment), log };
}

const mount = (experiment, options = {}) => {
  const doc = fakeDocument(["sky", "presets", "playback", "controls", "stats", "status", "legend"]);
  const canvas = fakeCanvas(doc, 4, 3), frames = manualFrames();
  const page = mountExperiment(experiment, { doc, raf: frames.raf, presets: false, serviceWorker: null, ...options });
  return { doc, canvas, page, frame: frames.frame, $: id => doc.getElementById(id) };
};

test("generic controls: groups, radios, toggles, enabled rules, linked params and size switches", () => {
  const { experiment, log } = toy();
  const { page, frame, canvas, $ } = mount(experiment, { playing: false });
  frame();
  const fieldset = $("controls").children.find(child => child.tagName === "FIELDSET");
  assert.equal(fieldset.children[0].textContent, "Options");
  assert.deepEqual(descendants(fieldset).filter(node => node.tagName === "INPUT").map(node => node.id), ["mode-a", "mode-b", "level", "resolution-4x3", "resolution-8x6"]);
  assert.equal($("crisp").type, "checkbox"); assert.equal($("crisp").checked, true);
  assert.equal($("layout"), null, "hidden params get no input");
  assert.equal($("level").disabled, true, "level only matters in mode b");
  assert.equal($("legend").textContent, "mode a"); assert.equal($("badge").textContent, "a");

  $("mode-b").checked = true; $("mode-a").checked = false; $("mode-b").fire("change"); frame();
  assert.equal($("level").disabled, false); assert.equal($("legend").textContent, "mode b"); assert.equal($("badge").textContent, "b");
  $("crisp").checked = false; $("crisp").fire("change"); assert.equal(page.params.crisp, false);

  // A size switch rebuilds at the new grid and adjust links crisp to it.
  $("resolution-8x6").checked = true; $("resolution-4x3").checked = false; $("resolution-8x6").fire("change"); frame();
  assert.deepEqual(log.created, ["4x3", "8x6"]); assert.equal(canvas.width, 8); assert.equal(canvas.pixels().length, 8 * 6 * 4);
  $("resolution-4x3").checked = true; $("resolution-8x6").checked = false; $("resolution-4x3").fire("change");
  assert.equal(page.params.crisp, true); assert.equal($("crisp").checked, true, "the host shows linked changes");

  // Seeds: the main one starts random and the common New seed changes it; the experiment's
  // own hidden seed steps with its own button, in its section.
  assert.ok(Number.isInteger(page.params.seed));
  const seed = page.params.seed; $("new-seed").fire("click"); assert.notEqual(page.params.seed, seed);
  assert.ok($("playback").contains($("new-seed"))); assert.ok($("controls").contains($("new-layout"))); assert.ok(!$("playback").contains($("new-layout")));
  $("new-layout").fire("click"); frame(); assert.equal(page.params.layout, 2); assert.match($("stats").textContent, /layout 2$/);

  // migrate converts an old saved format first.
  page.applyParams({ version: 1, seed: 77, params: { gain: 2 } });
  assert.equal(page.params.seed, 77); assert.equal(page.params.gain, 2);

  // Saved params: old or unknown keys are harmless; drift and the size come back.
  page.applyParams({ mode: "b", resolution: "8x6", crisp: "false", gain: 99, sunAzimuth: 3, drift: true, nonsense: 1 });
  assert.deepEqual(page.getParams(), { mode: "b", level: 0.5, resolution: "8x6", crisp: false, gain: 10, rate: 30, seed: 1, layout: 1, sunPhase: 0.125, drift: true, driftSpeed: 1 });
  assert.equal($("drift").checked, true);
});

test("playback: the common panel, own actions, Step by stepSeconds, frame gating, Drift and reset", () => {
  const { experiment, log } = toy();
  const { page, frame, canvas, $ } = mount(experiment, { playing: true });
  assert.deepEqual(controlIds($("playback")), ["play", "step", "randomize", "new-seed", "drift", "drift-speed", "timeOfDay"]);
  assert.equal($("play").textContent, "Pause");
  // The experiment's own section: heading, stats, then its actions with help beside them.
  assert.equal($("controls").children[0].className, "experiment-heading"); assert.equal($("controls").children[1], $("stats"));
  assert.equal($("controls").children[0].textContent, "Toy settings");
  assert.deepEqual(controlIds($("controls")).slice(0, 3), ["reset-all", "louder", "new-layout"]);
  assert.equal($("reset-all").parentNode.children[1].textContent, "Defaults, keeping the mode.");
  $("louder").fire("click"); assert.equal(page.params.gain, 9); $("gain").value = "5"; $("gain").fire("input");
  frame(); const drawn = canvas.pixels();
  // Steps that change nothing do not redraw; a tick redraws once the frame interval passes.
  for (let i = 0; i < 4; i++) frame(100);
  assert.match($("stats").textContent, /^ticks 0/);
  frame(100); assert.match($("stats").textContent, /^ticks 1/);
  // Step pauses and moves the experiment on by stepSeconds (rate / 60 here: 0.5 s, one tick).
  $("step").fire("click"); frame();
  assert.equal($("play").textContent, "Play"); assert.equal(log.lastStep, 0.5); assert.match($("stats").textContent, /^ticks 2/);

  // Drift moves the driftable sliders (gain, level), never rate, only while playing.
  $("drift").checked = true; $("drift").fire("change");
  const steps = log.steps; frame(1000); assert.equal(log.steps, steps, "paused: no steps, no drift");
  $("play").fire("click");
  for (let i = 0; i < 300; i++) frame(200);
  assert.notEqual(page.params.gain, 5); assert.equal(page.params.rate, 30);
  assert.equal(page.params.gain, Number($("gain").value));

  $("mode-b").checked = true; $("mode-a").checked = false; $("mode-b").fire("change");
  $("reset-all").fire("click");
  assert.equal(page.params.gain, 5); assert.equal(page.params.mode, "b", "reset keeps what the action asks");
  assert.ok(drawn.length === 4 * 3 * 4);
});

test("async loading: playback waits for ready, a failure says so", async () => {
  let resolve; const ready = new Promise(done => { resolve = done; });
  const { frame, $ } = mount(toy({ ready }).experiment, { playing: true });
  assert.equal($("play").disabled, true); assert.equal($("step").disabled, true); assert.equal($("new-layout").disabled, true);
  frame(500); assert.equal($("stats").textContent, "", "nothing reported while loading");
  resolve(); await ready; await null;
  assert.equal($("play").disabled, false); frame(); assert.match($("stats").textContent, /^ticks/);

  const failed = Promise.reject(new Error("offline"));
  const original = console.error; console.error = () => {};
  try {
    const second = mount(toy({ ready: failed }).experiment, { playing: false });
    await failed.catch(() => {}); await null;
    assert.match(second.$("status").textContent, /could not load/);
  } finally { console.error = original; }
});

test("validation names bad optional capabilities", () => {
  const { experiment } = toy();
  assert.throws(() => validateExperiment({ ...experiment, actions: [{ id: "play", label: "x", run() {} }] }), /reserved/);
  assert.throws(() => validateExperiment({ ...experiment, actions: [{ id: "new-thing", label: "x", run() {} }] }), /reserved/);
  assert.throws(() => validateExperiment({ ...experiment, playLabels: ["Play wind", "Pause wind"] }), /Play\/Pause is the same on every page/);
  assert.throws(() => validateExperiment({ ...experiment, seed: "gain" }), /seed must name a seed param/);
  assert.throws(() => validateExperiment({ ...experiment, seed: "layout" }), /keyed "seed"/);
  assert.throws(() => validateExperiment({ ...experiment, stepSeconds: 0 }), /stepSeconds/);
  assert.throws(() => validateExperiment({ ...experiment, migrate: {} }), /migrate/);
  assert.throws(() => validateExperiment({ ...experiment, params: [{ key: "size", kind: "size", options: [["4x3", "x"]], default: "4x3" }] }), /resolution/);
  assert.throws(() => validateExperiment({ ...experiment, params: [{ key: "on", kind: "toggle", default: 1 }] }), /true or false/);
  assert.throws(() => validateExperiment({ ...experiment, readouts: { legend: "text" } }), /readout legend/);
});
