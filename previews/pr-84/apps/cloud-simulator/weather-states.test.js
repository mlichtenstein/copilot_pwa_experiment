/* Purpose: Check the Weather layers weather states do what they promise on pinned seeds:
 *   after a `thunderstorm` jump the first strike comes within 10 s of play and strikes keep
 *   coming at a lively but not constant rate; `clearDay`, `overcast` and `gentleClouds` give
 *   no strikes in 60 s, and their cloud water ranks clearDay < gentleClouds < overcast; and
 *   the panel buttons jump the live page there.
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

const stateById = id => weather.weatherStates.find(state => state.id === id);
const thunderstorm = stateById("thunderstorm");
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const strikes = state => state.layers.reduce((sum, layer) => sum + layer.lightning.strikes, 0);

// Play a fresh weather state on one seed for `seconds`: when the first strike came, how
// many, and the mean cloud water over every layer's cells, sampled once a second.
function play(seed, seconds, weatherState = thunderstorm) {
  const params = { ...weatherStateParams(weather, weatherState, defaultParams(weather), seededRandom(seed)), seed };
  const state = createWeather(seed, params), start = strikes(state);
  let first = null, water = 0, samples = 0;
  for (let time = 0.25; time <= seconds + 1e-9; time += 0.25) {
    stepWeather(state, 0.25, params);
    if (first === null && strikes(state) > start) first = time;
    if (Number.isInteger(time)) for (const layer of state.layers) {
      const cells = layer.fields.cloudWater;
      water += cells.reduce((sum, value) => sum + value, 0) / cells.length; samples++;
    }
  }
  return { first, count: strikes(state) - start, water: water / samples };
}

test("thunderstorm: lightning within 10 s on every pinned seed, then lively but not constant", () => {
  const runs = SEEDS.map(seed => ({ seed, ...play(seed, 30) }));
  for (const { seed, first, count } of runs) {
    assert.ok(first !== null && first <= 10, `seed ${seed}: first strike at ${first} s`);
    assert.ok(count >= 5, `seed ${seed}: ${count} strikes in 30 s`);
    assert.ok(count <= 40, `seed ${seed}: ${count} strikes in 30 s is near constant`);
  }
});

test("clearDay, overcast and gentleClouds: no lightning in 60 s, and cloud ranks clearDay < gentleClouds < overcast", () => {
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const water = {};
  for (const id of ["clearDay", "gentleClouds", "overcast"]) {
    const runs = SEEDS.map(seed => ({ seed, ...play(seed, 60, stateById(id)) }));
    for (const { seed, count } of runs) assert.equal(count, 0, `${id} seed ${seed}: ${count} strikes in 60 s`);
    water[id] = mean(runs.map(run => run.water));
  }
  // Measured: clearDay about .003, gentleClouds .04, overcast .07 (defaults .033).
  assert.ok(water.clearDay < 0.01, `clearDay is nearly cloudless (${water.clearDay})`);
  assert.ok(water.gentleClouds > 3 * water.clearDay, `gentleClouds (${water.gentleClouds}) clearly cloudier than clearDay (${water.clearDay})`);
  assert.ok(water.overcast > 1.4 * water.gentleClouds, `overcast (${water.overcast}) clearly cloudier than gentleClouds (${water.gentleClouds})`);
});

test("the weather state buttons jump the Weather layers page to each state", async () => {
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
  for (const id of ["clearDay", "overcast", "gentleClouds"]) {
    $(id).fire("click");
    const jumped = page.getParams();
    for (const [key, value] of Object.entries(stateById(id).params)) assert.equal(jumped[key], value, `${id}: ${key}`);
    assert.equal(jumped.storminess, 0, `${id}: no lightning`);
  }
  page.dispose();
});
