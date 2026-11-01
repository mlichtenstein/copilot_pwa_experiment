/* Purpose: Check the shared sun's light for the flat pictures (core/sun-light.js): its side,
 *   height, dusk fade and daylight colours; that Convection's and Noise's Sunset views and
 *   Valley follow it (and draw their old fixed light without one); and that the host loads
 *   their old links on the default sun path and keeps autoplaying pages playing.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, core/sun-light.js,
 *   core/sun-path.js, the three models and experiments, core/host.js, core/fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { sunLight, fixedLight } from "./sun-light.js";
import { DEFAULT_SUN_SHAPE, sunAtPhase, phaseForTimeOfDay } from "./sun-path.js";
import { createConvection, renderConvection, BAKED_LIGHT as CONVECTION_LIGHT } from "../convection-model.js";
import { createWeather, renderWeather, BAKED_LIGHT as NOISE_LIGHT } from "../noise-model.js";
import { renderValley } from "../valley-model.js";
import { noise } from "../noise-experiment.js";
import { convection } from "../convection-experiment.js";
import { mountExperiment } from "./host.js";
import { fakeDocument, fakeCanvas, manualFrames } from "./fake-dom.js";

const at = hours => sunLight(sunAtPhase(phaseForTimeOfDay(hours), DEFAULT_SUN_SHAPE));
const differs = (a, b) => !isDeepStrictEqual(a, b);

test("sunLight: side from azimuth, height from elevation, dusk fade and daylight", () => {
  const right = sunLight({ azimuth: 30, elevation: 10 }), left = sunLight({ azimuth: -30, elevation: 10 });
  assert.equal(right.across, 1); assert.equal(left.across, -1);
  assert.ok(right.direction[0] > 0 && left.direction[0] < 0);
  assert.ok(right.direction[1] > 0, "a low sun lights from below (y down)");
  assert.ok(sunLight({ azimuth: 0, elevation: 60 }).direction[1] < 0, "a high sun lights from above");
  const ahead = sunLight({ azimuth: 0, elevation: 30 });
  assert.equal(ahead.march, null, "straight ahead: no side to march toward");
  assert.ok(ahead.relief < 0.05);
  for (const light of [right, left, ahead]) assert.ok(Math.abs(Math.hypot(...light.direction) - 1) < 1e-12);
  assert.equal(sunLight({ elevation: 10 }).strength, 1);
  assert.equal(sunLight({ elevation: -10 }).strength, 0);
  assert.ok(sunLight({ elevation: 0 }).strength > 0 && sunLight({ elevation: 0 }).strength < 1);
  assert.equal(sunLight({ elevation: 28 }).day, 0, "the default path stays warm all day");
  assert.equal(sunLight({ elevation: 70 }).day, 1);
  const bad = sunLight({ azimuth: NaN, elevation: undefined });
  assert.ok(bad.direction.every(Number.isFinite));
  // The default path: morning from the right, noon from the front, afternoon from the left.
  assert.ok(at(9).across > 0.9 && Math.abs(at(12).across) < 1e-9 && at(15).across < -0.9);
  assert.equal(at(0).strength, 0);
  // fixedLight reproduces the models' old fixed suns.
  assert.deepEqual(CONVECTION_LIGHT.march, { x: 1, y: 0.5 });
  assert.deepEqual(NOISE_LIGHT.march, { x: 1, y: 1 });
  assert.equal(fixedLight(1, 1, 0.35).strength, 1);
});

// A small convection box with a round cloud in it, warm enough to puff.
function cloudyBox() {
  const simulation = createConvection({ width: 32, height: 24, seed: 3 });
  for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) {
    const i = y * 32 + x, d = Math.hypot(x - 16, y - 10);
    if (d < 6) { simulation.liquid[i] = 0.01 * (1 - d / 6) + 0.002; simulation.temperature[i] += 0.2; }
  }
  return simulation;
}

test("Convection: the Sunset view follows the shared sun; without one it keeps its old light", () => {
  for (const options of [{}, { cloudStyle: "raw" }]) {
    const simulation = cloudyBox(), draw = light => renderConvection(simulation, "sunset", options, light);
    assert.deepEqual(draw(), draw(CONVECTION_LIGHT));
    const morning = draw(at(9)), afternoon = draw(at(15)), night = draw(at(0));
    assert.ok(differs(morning, afternoon), `${options.cloudStyle ?? "cumulus"}: the lit side swaps`);
    assert.ok(mean(night) < mean(morning), "darker once the sun is down");
    assert.ok(differs(draw(sunLight({ azimuth: 0, elevation: 70 })), draw(sunLight({ azimuth: 0, elevation: 20 }))), "a high sun changes the colours");
  }
  // Only the Sunset view is lit.
  const simulation = cloudyBox();
  assert.deepEqual(renderConvection(simulation, "temperature", {}, at(9)), renderConvection(simulation, "temperature", {}, at(15)));
});

test("Noise: the Sunset view follows the shared sun; without one it keeps its old light", () => {
  const simulation = createWeather({ width: 48, height: 36, seed: 4 }), draw = light => renderWeather(simulation, "sunset", {}, null, light);
  assert.ok(simulation.cloud.some(value => value > 0.3), "the fixture has cloud");
  assert.deepEqual(draw(), draw(NOISE_LIGHT));
  const morning = draw(at(9)), afternoon = draw(at(15)), night = draw(at(0));
  assert.ok(differs(morning, afternoon) && differs(morning, draw(at(12))));
  assert.ok(mean(night) < mean(morning));
  assert.ok(differs(draw(sunLight({ azimuth: 0, elevation: 70 })), draw(sunLight({ azimuth: 0, elevation: 20 }))));
});

test("Valley: the glow sits where the sun is, slopes light from its side, dusk dims it", () => {
  let state = 9;
  const texture = { width: 32, height: 32, pixels: Float32Array.from({ length: 1024 }, () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }) };
  const draw = light => renderValley(texture, 1, { horizon: "valley" }, "noise", 48, 30, texture, light);
  const brightest = pixels => { let best = -1, at = 0; for (let i = 0; i < pixels.length; i += 4) { const l = pixels[i] + pixels[i + 1] + pixels[i + 2]; if (l > best) { best = l; at = i / 4; } } return at % 48; };
  const clear = light => renderValley(texture, 1, { horizon: "open", coverage: 0 }, "noise", 48, 30, texture, light);
  assert.ok(brightest(clear(sunLight({ azimuth: 30, elevation: 10 }))) > 24, "sun right, glow right");
  assert.ok(brightest(clear(sunLight({ azimuth: -30, elevation: 10 }))) < 24, "sun left, glow left");
  assert.ok(differs(draw(at(9)), draw(at(15))));
  assert.ok(mean(draw(at(0))) < mean(draw(at(9))));
  assert.ok(differs(draw(), draw(at(9))), "without a light, the old painted look");
});

test("Convection and Noise: old links load on the default sun path and keep playing", () => {
  for (const experiment of [convection, noise]) {
    const doc = fakeDocument(["sky", "presets", "playback", "controls", "stats", "status", "legend"]);
    fakeCanvas(doc, experiment.width, experiment.height);
    const { raf, frame } = manualFrames();
    const page = mountExperiment(experiment, { doc, raf, presets: false, serviceWorker: null, playing: true });
    frame();
    const { sunPathWidth, sunPathHeight, sunPathX, sunPathY, ...old } = page.getParams();
    page.applyParams({ ...old, sunPhase: 0.1 });
    const loaded = page.getParams();
    for (const key of Object.keys(DEFAULT_SUN_SHAPE)) assert.equal(loaded[key], DEFAULT_SUN_SHAPE[key], `${experiment.title}: ${key}`);
    assert.equal(doc.getElementById("play").textContent, "Pause", `${experiment.title}: still playing`);
    page.dispose?.();
  }
});

function mean(pixels) {
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
  return sum / (pixels.length / 4);
}
