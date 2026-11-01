/* Purpose: Check night on every page: the daylight factor (full above +6°, a smooth monotonic
 *   ramp, none below −12°), the host's night step (a no-op in daylight, dark blue rather than
 *   black at night), that every page really gets dark at midnight with the default sun path
 *   while staying visible, and that a lightning flash still lights its frame at night.
 * Consumers: Node test runner.
 * Dependencies: node:test, node:assert, daylight.js, host.js, registry.js, sun-path.js, fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { NIGHT, TWILIGHT, applyNight, daylight } from "./daylight.js";
import { mountExperiment } from "./host.js";
import { experiments } from "./registry.js";
import { phaseForTimeOfDay } from "./sun-path.js";
import { pageDocument, fakeCanvas, manualFrames } from "./fake-dom.js";

test("daylight: 1 in full day, 0 at night, a smooth monotonic twilight ramp between", () => {
  assert.deepEqual(TWILIGHT, { top: 6, bottom: -12 });
  for (const elevation of [6, 6.01, 20, 90]) assert.equal(daylight(elevation), 1, `${elevation}°`);
  for (const elevation of [-12, -12.01, -18, -90]) assert.equal(daylight(elevation), 0, `${elevation}°`);
  let previous = daylight(-20), previousSlope = 0;
  const step = 0.01;
  for (let elevation = -20 + step; elevation <= 10; elevation += step) {
    const light = daylight(elevation), slope = (light - previous) / step;
    assert.ok(light >= previous, `monotonic at ${elevation.toFixed(2)}°`);
    assert.ok(Math.abs(slope - previousSlope) < 0.002, `no kink at ${elevation.toFixed(2)}°`);
    previous = light; previousSlope = slope;
  }
  // Sun-lit pages start the ramp at the horizon (their models shade their own dusk).
  assert.equal(daylight(0, { top: 0 }), 1); assert.ok(daylight(-3, { top: 0 }) < 1 && daylight(-9, { top: 0 }) > 0);
});

test("the night step: untouched in daylight, a dim blue floor at night", () => {
  const frame = () => new Uint8ClampedArray([200, 180, 160, 255, 0, 0, 0, 255, 90, 120, 150, 255]);
  assert.deepEqual(applyNight(frame(), 1), frame(), "light 1 changes nothing");
  const night = applyNight(frame(), 0);
  assert.deepEqual([...night.slice(4, 8)], [...NIGHT.floor, 255], "black becomes the night floor, not black");
  assert.ok(NIGHT.floor[2] > NIGHT.floor[0] && NIGHT.floor[2] > NIGHT.floor[1], "the floor is blue");
  assert.ok(night[0] > night[8] && night[8] > night[4], "brighter pixels stay brighter: clouds stay visible");
  assert.ok(night[0] < 60, "but they are dim");
  const dusk = applyNight(frame(), 0.5);
  assert.ok(dusk[0] < 200 && dusk[0] > night[0], "twilight lies between");
  assert.equal(night[3], 255, "alpha is kept");
  // Sun-lit pages, already dim from their own dusk, keep more of it.
  assert.ok(NIGHT.sunKeep > NIGHT.keep);
  assert.ok(applyNight(frame(), 0, { keep: NIGHT.sunKeep })[0] > night[0]);
});

// Mounts a page with its raw renders recorded (the instance's buffer before the night step).
async function mount(entry) {
  const experiment = await entry.load();
  const doc = pageDocument(), canvas = fakeCanvas(doc, 64, 40), { raf, frame } = manualFrames();
  const page = mountExperiment(experiment, { doc, raf, presets: false, serviceWorker: null, playing: false });
  await page.instance.ready; await new Promise(resolve => setTimeout(resolve, 0));
  page.setPlaying(false);
  const record = { raw: null }, render = page.instance.render.bind(page.instance);
  page.instance.render = info => { const pixels = render(info); record.raw = pixels && Uint8ClampedArray.from(pixels); return pixels; };
  const at = hours => { page.applyParams({ ...page.getParams(), sunPhase: phaseForTimeOfDay(hours) }); frame(); return canvas.pixels(); };
  return { experiment, doc, page, frame, canvas, record, at };
}
const luma = (pixels, i) => (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
const summary = pixels => {
  let sum = 0, min = Infinity, max = 0, red = 0, blue = 0;
  for (let i = 0; i < pixels.length; i += 4) { const l = luma(pixels, i); sum += l; min = Math.min(min, l); max = Math.max(max, l); red += pixels[i]; blue += pixels[i + 2]; }
  const n = pixels.length / 4;
  return { mean: sum / n, min, max, red: red / n, blue: blue / n };
};

test("every page darkens at midnight to a dim blue, not black, and is untouched at noon", async () => {
  for (const entry of experiments) {
    const { experiment, record, at } = await mount(entry);
    if (experiment.id === "lightning") continue; // its first frame is a flash; checked below
    const noon = at(12);
    assert.deepEqual([...noon], [...record.raw], `${experiment.title}: noon is the experiment's own frame`);
    const day = summary(noon), night = summary(at(0));
    assert.ok(night.mean < 40 && night.mean < day.mean * 0.4, `${experiment.title}: dark at midnight (${night.mean.toFixed(1)} vs ${day.mean.toFixed(1)})`);
    assert.ok(night.min >= 10, `${experiment.title}: not black (${night.min})`);
    assert.ok(night.blue > night.red, `${experiment.title}: night is blue`);
    const dusk = summary(at(19.25));
    assert.ok(dusk.mean < day.mean && dusk.mean > night.mean, `${experiment.title}: dusk lies between`);
  }
});

test("the default path's night is visible: cloudy pages keep faint detail at midnight", async () => {
  for (const id of ["convection", "noise", "valley", "sunset"]) {
    const { experiment, at } = await mount(experiments.find(entry => entry.id === id));
    const night = summary(at(0));
    assert.ok(night.max - night.min >= 5, `${experiment.title}: detail at night (${night.min}..${night.max})`);
  }
});

test("lightning: a flash lights the frame at midnight, and the sky goes dark once it fades", async () => {
  const { doc, frame, canvas, record, page } = await mount(experiments.find(entry => entry.id === "lightning"));
  // A fixed strike (the page picks a random seed on load); its first frame is the flash's peak.
  page.applyParams({ ...page.getParams(), seed: 2, sunPhase: phaseForTimeOfDay(0) }); frame();
  const peak = canvas.pixels();
  assert.equal(page.instance.selfLight(), 1, "the first frame is a flash at its peak");
  assert.deepEqual([...peak], [...record.raw], "at the flash's peak the night step leaves the frame as drawn");
  assert.ok(summary(peak).max > 150, "the channel is bright");
  // Step until the flash has faded (the storm may strike again, so stop at the first dark frame).
  for (let i = 0; i < 400 && page.instance.selfLight() >= 0.05; i++) { doc.getElementById("step").fire("click"); frame(); }
  assert.ok(page.instance.selfLight() < 0.05, "the flash has faded");
  const after = summary(canvas.pixels()), raw = summary(record.raw);
  // The storm is already dark by day, so night takes it down further but not to black.
  assert.ok(after.mean < raw.mean * 0.75 && after.min >= 5, `the storm darkens at night once the flash is gone (${after.mean.toFixed(1)} vs ${raw.mean.toFixed(1)})`);
});
