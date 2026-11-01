/* Purpose: Check the Weather layers `thunderstorm` weather state does what it promises on
 *   pinned seeds: after a jump, the first strike comes within 10 s of play, and strikes keep
 *   coming at a lively but not constant rate; and the panel button jumps the live page there.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, weather-fields.js,
 *   weather-experiment.js, core/experiment.js, core/host.js, core/fake-dom.js and
 *   ../shared/drift.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createWeather, stepWeather } from "./weather-fields.js";
import { weather } from "./weather-experiment.js";
import { defaultParams, weatherStateParams } from "./core/experiment.js";
import { mountExperiment } from "./core/host.js";
import { pageDocument, fakeCanvas, manualFrames } from "./core/fake-dom.js";
import { seededRandom } from "../shared/drift.js";

const thunderstorm = weather.weatherStates.find(state => state.id === "thunderstorm");
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const strikes = state => state.layers.reduce((sum, layer) => sum + layer.lightning.strikes, 0);

// Play a fresh thunderstorm on one seed for `seconds`: when the first strike came and how many.
function play(seed, seconds) {
  const params = { ...weatherStateParams(weather, thunderstorm, defaultParams(weather), seededRandom(seed)), seed };
  const state = createWeather(seed, params), start = strikes(state);
  let first = null;
  for (let time = 0.25; time <= seconds + 1e-9; time += 0.25) {
    stepWeather(state, 0.25, params);
    if (first === null && strikes(state) > start) first = time;
  }
  return { first, count: strikes(state) - start };
}

test("thunderstorm: lightning within 10 s on every pinned seed, then lively but not constant", () => {
  const runs = SEEDS.map(seed => ({ seed, ...play(seed, 30) }));
  for (const { seed, first, count } of runs) {
    assert.ok(first !== null && first <= 10, `seed ${seed}: first strike at ${first} s`);
    assert.ok(count >= 5, `seed ${seed}: ${count} strikes in 30 s`);
    assert.ok(count <= 40, `seed ${seed}: ${count} strikes in 30 s is near constant`);
  }
});

test("the thunderstorm button jumps the Weather layers page to the state", async () => {
  const doc = pageDocument(), $ = id => doc.getElementById(id);
  fakeCanvas(doc, 32, 20);
  const { raf, frame } = manualFrames();
  const page = mountExperiment(weather, { doc, raf, presets: false, serviceWorker: null, playing: false, random: seededRandom(9) });
  await page.instance.ready; frame();
  const before = page.getParams();
  $("thunderstorm").fire("click");
  const after = page.getParams();
  for (const [key, value] of Object.entries(thunderstorm.params)) assert.equal(after[key], value, key);
  assert.notEqual(after.seed, before.seed);
  assert.equal(page.clock.playing, false, "Play/Pause stays");
  assert.ok(Math.abs(after.sunPhase - before.sunPhase) > 0.01, "the time of day moves to the state's");
  page.dispose();
});
