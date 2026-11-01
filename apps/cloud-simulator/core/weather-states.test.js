/* Purpose: Check the generic named-weather-state capability (experiment.weatherStates):
 *   validation of declared states, weatherStateParams (state values over defaults, fresh
 *   seeds, inspection/playback settings and grid size kept), and the common panel's jump row
 *   (its label, hold help, and a jump that keeps Play/Pause, Drift and its speed, sets the
 *   time of day, and saves the resulting settings through getParams/applyParams).
 * Consumers: Node test runner. Dependencies: node:test, node:assert, experiment.js, host.js,
 *   ../../shared/drift.js and fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { validateExperiment, weatherStateParams, defaultParams } from "./experiment.js";
import { mountExperiment, PANEL_TEXT } from "./host.js";
import { seededRandom } from "../../shared/drift.js";
import { fakeDocument, fakeCanvas, manualFrames, helpOf } from "./fake-dom.js";

const toy = (weatherStates, extra = {}) => ({
  id: "toy", title: "Toy", app: "cloud-simulator/toy", width: 8, height: 4, sun: false, seed: "seed",
  params: [
    { key: "seed", kind: "seed", default: 1 },
    { key: "rain", kind: "range", min: 0, max: 1, step: 0.1, default: 0.2, help: "Rain." },
    { key: "wind", kind: "range", min: 0, max: 1, step: 0.1, default: 0.3, help: "Wind." },
    { key: "view", kind: "select", default: "scene", randomize: false, options: [["scene", "Scene"], ["charge", "Charge"]], help: "View." },
    { key: "speed", kind: "range", min: 1, max: 4, step: 1, default: 1, randomize: false, help: "Playback speed." }
  ],
  weatherStates,
  create: () => ({ update() {}, step() {}, render() {}, dispose() {} }),
  ...extra
});
const storm = { id: "storm", timeOfDay: 18, help: "A storm.", params: { rain: 0.9 } };

test("weatherStates are validated: code-name ids, help, known and valid params, a sane time of day", () => {
  assert.doesNotThrow(() => validateExperiment(toy([storm])));
  for (const [bad, message] of [
    [[{ ...storm, id: "Storm here" }], /camelCase id/],
    [[storm, storm], /storm is already used/],
    [[{ ...storm, id: "rain" }], /rain is already used/],
    [[{ ...storm, id: "randomize" }], /randomize is already used/],
    [[{ ...storm, help: "" }], /needs help/],
    [[{ ...storm, params: { hail: 1 } }], /unknown param hail/],
    [[{ ...storm, params: { rain: 3 } }], /bad rain/],
    [[{ ...storm, timeOfDay: 25 }], /timeOfDay/],
    [{ storm }, /must be an array/]
  ]) assert.throws(() => validateExperiment(toy(bad)), message);
});

test("weatherStateParams: the state's values over defaults, fresh seeds, inspection settings kept", () => {
  const experiment = toy([storm]);
  const current = { seed: 7, rain: 0.5, wind: 0.8, view: "charge", speed: 3 };
  const next = weatherStateParams(experiment, storm, current, seededRandom(3));
  assert.equal(next.rain, 0.9, "the state's own value");
  assert.equal(next.wind, defaultParams(experiment).wind, "unset settings go to their defaults");
  assert.equal(next.view, "charge"); assert.equal(next.speed, 3, "randomize: false settings stay");
  assert.notEqual(next.seed, 7, "a new seed");
  assert.deepEqual(weatherStateParams(experiment, storm, current, seededRandom(3)), next, "seeded: reproducible");
  assert.equal(weatherStateParams(experiment, { ...storm, params: { ...storm.params, view: "scene" } }, current, seededRandom(3)).view, "scene", "a state may set them");
});

test("the common panel's weatherStates row jumps to a state and keeps Play, Drift and its speed", async () => {
  const doc = fakeDocument(), $ = id => doc.getElementById(id);
  fakeCanvas(doc, 8, 4);
  const { raf, frame } = manualFrames();
  const page = mountExperiment(toy([storm]), { doc, raf, presets: false, serviceWorker: null, playing: true, random: seededRandom(5) });
  await page.instance.ready; frame();
  const button = $("storm");
  assert.equal(button.textContent, "storm", "labelled with its code name");
  const row = button.parentNode.parentNode;
  assert.equal(row.className, "panel-row weather-states");
  assert.equal(row.children[0].children[0].textContent, "weatherStates");
  assert.equal(row.children[0].helpText.textContent, PANEL_TEXT.weatherStatesNote);
  assert.equal(helpOf(doc, button), "A storm.");
  $("drift").checked = false; $("drift").fire("change");
  $("drift-speed").value = "0.5"; $("drift-speed").fire("input");
  const before = page.getParams();
  button.fire("click");
  const after = page.getParams();
  assert.equal(after.rain, 0.9); assert.notEqual(after.seed, before.seed);
  assert.equal(page.clock.playing, true, "Play stays");
  assert.equal(after.drift, false); assert.equal(after.driftSpeed, before.driftSpeed);
  assert.ok(Math.abs(after.driftSpeed - 10 ** 0.5) < 1e-9, "Drift and its speed stay");
  frame();
  assert.equal($("timeOfDay").value.slice(0, 2), "18", "its time of day");
  // Saving after a jump saves the resulting settings: they come back through applyParams.
  page.jumpToWeatherState("storm");
  const saved = page.getParams();
  page.applyParams({ ...saved, rain: 0.1 }); page.applyParams(saved);
  assert.deepEqual(page.getParams(), saved);
  page.dispose();
});

test("no weatherStates row without weatherStates", async () => {
  const doc = fakeDocument();
  fakeCanvas(doc, 8, 4);
  const { raf } = manualFrames();
  const page = mountExperiment(toy(undefined), { doc, raf, presets: false, serviceWorker: null, playing: false });
  assert.equal(doc.getElementById("playback").children.some(child => /weather-states/.test(child.className)), false);
  page.dispose();
});
