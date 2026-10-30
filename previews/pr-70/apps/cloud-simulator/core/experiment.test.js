/* Purpose: Check the experiment contract: every registered experiment module describes
 *   valid controls, creates an instance with update/step/render/dispose, draws a full
 *   opaque frame, is deterministic and follows the shared sun; and the params helpers clean
 *   untrusted params.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, experiment.js,
 *   registry.js, sun-path.js, clock.js and fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { validateExperiment, validateInstance, defaultParams, cleanParams, cleanParam, driftableParams, parseSize } from "./experiment.js";
import { imageDocument } from "./fake-dom.js";
import { experiments, findExperiment } from "./registry.js";
import { sunAt, SUN_PATH } from "./sun-path.js";
import { createClock, startLoop, MAX_FRAME_MS } from "./clock.js";

for (const entry of experiments) {
  test(`${entry.id}: meets the experiment contract`, async () => {
    const experiment = validateExperiment(await entry.load());
    assert.equal(experiment.id, entry.id);
    assert.equal(entry.href, `${experiment.id}.html`);
    assert.equal(experiment.app, `cloud-simulator/${experiment.id}`);
    const params = defaultParams(experiment);
    assert.deepEqual(cleanParams(experiment, params), params);
    // Small grid keeps the test quick; experiments must honour the size they are given.
    // doc stands in for the page's document (experiments that load images use it).
    const make = async (size = { width: 32, height: 20 }) => {
      const instance = validateInstance(experiment.create({ ...size, params, doc: imageDocument() }));
      await instance.ready;
      return instance;
    };
    const instance = await make(), frame = { time: 0, sun: sunAt(0) };
    instance.step(0.1, frame);
    const pixels = instance.render(frame);
    assert.ok(pixels instanceof Uint8ClampedArray);
    assert.equal(pixels.length, 32 * 20 * 4);
    assert.ok(pixels.every((value, index) => index % 4 !== 3 || value === 255), "every pixel is opaque");
    const again = await make();
    again.step(0.1, frame);
    assert.deepEqual(again.render(frame), pixels, "same params, same frame, same picture");
    again.dispose();
    if (experiment.sun) {
      const later = { time: SUN_PATH.period / 4, sun: sunAt(SUN_PATH.period / 4) };
      assert.notDeepEqual(instance.render(later), pixels, "the shared sun moves the picture");
    }
    // Every control's extremes render.
    for (const param of experiment.params) {
      if (param.kind === "size") {
        // The host rebuilds at each offered size; the instance must fill it.
        for (const [value] of param.options) {
          const size = parseSize(value), sized = await make(size);
          assert.equal(sized.render(frame).length, size.width * size.height * 4, `resolution ${value}`);
          sized.dispose();
        }
        continue;
      }
      const values = param.kind === "range" ? [param.min, param.max] : param.kind === "select" ? param.options.map(([value]) => value)
        : param.kind === "toggle" ? [false, true] : [0, 4294967295];
      for (const value of values) {
        instance.update({ ...params, [param.key]: value });
        assert.equal(instance.render(frame).length, 32 * 20 * 4, `${param.key} = ${value}`);
      }
    }
    instance.dispose();
  });
}

test("the registry finds experiments by id", () => {
  assert.equal(findExperiment("sunset")?.title, "Sunset study");
  assert.equal(findExperiment("nope"), null);
  assert.equal(new Set(experiments.map(entry => entry.id)).size, experiments.length);
});

const sample = {
  id: "sample", title: "Sample", app: "cloud-simulator/sample", width: 4, height: 2, sun: false,
  params: [
    { key: "speed", kind: "range", min: 0, max: 10, step: 1, default: 5, drift: false },
    { key: "gain", kind: "range", min: -1, max: 1, step: 0.1, default: 0 },
    { key: "view", kind: "select", label: "View", options: [["a", "A"], ["b", "B"]], default: "a" },
    { key: "seed", kind: "seed", default: 7 }
  ],
  create: () => ({ update() {}, step() {}, render: () => new Uint8ClampedArray(32), dispose() {} })
};

test("validation rejects broken experiment descriptions and instances", () => {
  assert.equal(validateExperiment(sample), sample);
  assert.throws(() => validateExperiment({ ...sample, id: "" }), /id must be/);
  assert.throws(() => validateExperiment({ ...sample, params: [...sample.params, sample.params[0]] }), /duplicate param speed/);
  assert.throws(() => validateExperiment({ ...sample, params: [{ key: "x", kind: "range", min: 1, max: 0, step: 1, default: 0 }] }), /min < max/);
  assert.throws(() => validateExperiment({ ...sample, params: [{ key: "v", kind: "select", options: [["a", "A"]], default: "z" }] }), /not an option/);
  assert.throws(() => validateExperiment({ ...sample, params: [{ key: "sunPhase", kind: "seed", default: 1 }] }), /reserved/);
  assert.throws(() => validateExperiment({ ...sample, sun: "yes" }), /sun must be/);
  assert.throws(() => validateInstance({ update() {}, render() {} }), /missing step, dispose/);
});

test("untrusted params are cleaned against the schema", () => {
  assert.deepEqual(defaultParams(sample), { speed: 5, gain: 0, view: "a", seed: 7 });
  assert.deepEqual(cleanParams(sample, { speed: 99, gain: "0.5", view: "zzz", seed: -1, extra: 1 }), { speed: 10, gain: 0.5, view: "a", seed: 7 });
  assert.deepEqual(cleanParams(sample, null), defaultParams(sample));
  assert.deepEqual(cleanParams(sample, { gain: NaN }, { speed: 1, gain: 0.3, view: "b", seed: 9 }), { speed: 1, gain: 0.3, view: "b", seed: 9 });
  assert.equal(cleanParam(sample.params[3], "", null), null);
  assert.equal(cleanParam(sample.params[3], "12"), 12);
  assert.deepEqual(driftableParams(sample).map(param => param.key), ["gain"]);
});

test("the shared clock only runs while playing and caps long frames", () => {
  const clock = createClock();
  assert.equal(clock.advance(1), 0);
  clock.play();
  assert.equal(clock.advance(0.1), 0.1);
  assert.equal(clock.advance(5), MAX_FRAME_MS / 1000);
  clock.set(3); clock.play(false);
  assert.equal(clock.time, 3);
  const frames = [];
  let callback, onVisibility;
  const doc = { hidden: false, addEventListener(name, fn) { if (name === "visibilitychange") onVisibility = fn; }, removeEventListener() {} };
  const stop = startLoop(dt => frames.push(dt), { raf: fn => { callback = fn; }, doc });
  // First frame, a normal frame, a stalled frame, then the tab is hidden and comes back.
  callback(1000); callback(1016); callback(5000);
  doc.hidden = true; onVisibility(); callback(5016); doc.hidden = false; onVisibility(); callback(9000); callback(9016);
  assert.deepEqual(frames.map(dt => Math.round(dt * 1000)), [0, 16, MAX_FRAME_MS, 0, 16]);
  stop();
});
