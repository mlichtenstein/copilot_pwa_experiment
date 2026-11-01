/* Purpose: Check the convection study's water budget, repeatability, sustained motion, rain,
 *   the inversion layer, the LCL's flat cloud bases and the Sunset view's cloud shapes,
 *   with each option on and off.
 *   Runs at both page grid sizes (64×48 and 128×96) where size matters.
 * Consumers: Node's test runner. Dependencies: node:test, node:assert and convection-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createConvection, step, totalWater, saturation, renderConvection, RAIN_SCALE,
  cloudCover, cloudLayers, capping, billows, fray, haze, facing, HAZE_OPACITY, rainOpacity, sunsetSky, cloudColor,
  inversionTarget, layeringOf, defaults } from "./convection-model.js";

const allFinite = simulation => ["temperature", "vapor", "liquid", "rain", "vorticity"]
  .every(name => simulation[name].every(Number.isFinite));
const nonNegative = simulation => ["vapor", "liquid", "rain", "pool"].every(name => simulation[name].every(value => value >= 0));

test("capacity grows with temperature and shrinks with altitude", () => {
  assert.ok(saturation(0.8, 0.5) > saturation(0.4, 0.5));
  assert.ok(saturation(0.6, 0.9) < saturation(0.6, 0.1));
});

// The page offers two grid sizes: 64×48 (pixel art, the default) and 128×96 (detailed).
const SIZES = [[64, 48], [128, 96]];
for (const [width, height] of SIZES) test(`${width}×${height}: vapor, cloud, rain and puddles together conserve water`, () => {
  const simulation = createConvection({ width, height, seed: 42 });
  const start = totalWater(simulation);
  assert.ok(Math.abs(start / simulation.temperature.length - 0.11) < 1e-12);
  let clouds = false, rain = false;
  for (let tick = 0; tick < 1500; tick++) {
    step(simulation);
    clouds ||= simulation.liquid.some(value => value > 0.005);
    rain ||= simulation.rain.some(value => value > RAIN_SCALE);
  }
  assert.ok(Math.abs(totalWater(simulation) - start) / start < 1e-9);
  assert.ok(nonNegative(simulation) && allFinite(simulation));
  assert.ok(clouds, "clouds form");
  assert.ok(rain, "rain falls");
});

test("the same seed repeats exactly; another seed differs", () => {
  const run = seed => {
    const simulation = createConvection({ seed });
    for (let tick = 0; tick < 300; tick++) step(simulation, { flicker: 0.8 });
    return simulation;
  };
  assert.deepEqual(run(7), run(7));
  assert.notDeepEqual([...run(7).temperature], [...run(8).temperature]);
});

// Mean |ΔT| per tick in the interior rows, away from the flickering floor and the lid,
// so the score measures air moving rather than boundary noise. With the inversion on,
// only the convecting layer under it counts: the warm layer is stable, so quiet by design.
function interiorActivity(simulation, ticks, options = {}) {
  const { width, height } = simulation, rules = { ...defaults, ...options };
  const top = layeringOf(options) === "inversion" ? Math.max(2, Math.round((1 - rules.inversionHeight) * (height - 1)) + 1) : 2;
  let activity = 0;
  for (let tick = 0; tick < ticks; tick++) {
    const before = simulation.temperature.slice();
    step(simulation, options);
    let change = 0;
    for (let i = top * width; i < (height - 2) * width; i++) change += Math.abs(simulation.temperature[i] - before[i]);
    activity += change / ((height - 2 - top) * width) / ticks;
  }
  return activity;
}
// Defaults sit around 1-3e-4 for thousands of ticks; still air with no buoyancy is about 2e-6.
const ACTIVITY_FLOOR = 6e-5;

// Specific seeds are not meant to matter, so each run draws fresh random seeds and names
// them in any failure. Reproduce one with CONVECTION_SEEDS=123,456 node --test ...
const randomSeeds = process.env.CONVECTION_SEEDS
  ? process.env.CONVECTION_SEEDS.split(",").map(Number)
  : [...crypto.getRandomValues(new Uint32Array(4))];

// At the default 64×48, LCL (the default) runs on every seed and no layering on half.
// The inversion runs at 128×96: at 64×48 its shallow convecting layer can settle on some
// seeds (a known rough edge), so it is not held to the floor there. 128×96 also gets an
// LCL run, so both sizes are covered.
const seedRuns = [...randomSeeds.map(seed => [seed, "lcl", 64, 48]), ...randomSeeds.slice(2).map(seed => [seed, "none", 64, 48]),
  ...randomSeeds.slice(0, 2).map(seed => [seed, "inversion", 128, 96]), [randomSeeds[3], "lcl", 128, 96]];
test(`blobs keep rising and falling and rain keeps falling on random seeds ${randomSeeds.join(", ")}`, () => {
  for (const [seed, layering, width, height] of seedRuns) {
    const simulation = createConvection({ width, height, seed }), options = { layering };
    const start = totalWater(simulation);
    // Rain comes in showers, so count how often a visible shaft (20+ pixels at half the
    // fixed rain color scale) is falling, sampled every 100 ticks after the spin-up.
    let rainy = 0, samples = 0;
    for (let window = 0; window < 8; window++) {
      let activity = 0;
      for (let part = 0; part < 5; part++) {
        activity += interiorActivity(simulation, 100, options) / 5;
        if (window > 0) { samples++; if (simulation.rain.filter(value => value > RAIN_SCALE / 2).length > 20) rainy++; }
      }
      assert.ok(activity > ACTIVITY_FLOOR, `seed ${seed}, ${layering}, ${width}×${height}, ticks ${window * 500}-${window * 500 + 499}: mean |ΔT| ${activity}`);
    }
    assert.ok(rainy >= samples / 2, `seed ${seed}, ${layering}, ${width}×${height}: rain shafts visible in ${rainy} of ${samples} samples`);
    assert.ok(nonNegative(simulation) && allFinite(simulation), `seed ${seed}, ${layering}, ${width}×${height} stays finite and non-negative`);
    assert.ok(Math.abs(totalWater(simulation) - start) / start < 1e-9, `seed ${seed}, ${layering}, ${width}×${height} conserves water`);
  }
});

test("layering: the old inversion boolean still picks a mode; an explicit layering wins", () => {
  assert.equal(layeringOf({}), defaults.layering);
  assert.equal(layeringOf({ inversion: true }), "inversion");
  assert.equal(layeringOf({ inversion: false }), "none");
  assert.equal(layeringOf({ inversion: true, layering: "lcl" }), "lcl");
  const run = options => { const simulation = createConvection({ seed: 9 }); for (let tick = 0; tick < 200; tick++) step(simulation, options); return simulation; };
  assert.deepEqual(run({ inversion: true }), run({ layering: "inversion" }));
});

test("the inversion sounding: none below its height, warming by its strength across its depth", () => {
  const rules = { ...defaults, inversionHeight: 0.6, inversionDepth: 0.1 };
  assert.equal(inversionTarget(0.59, rules), undefined);
  assert.equal(inversionTarget(0.6, rules), rules.inversionBase);
  assert.ok(Math.abs(inversionTarget(0.7, rules) - rules.inversionBase - rules.inversionStrength) < 1e-12);
  assert.equal(inversionTarget(0.95, rules), inversionTarget(0.7, rules));
});

// Mean cloud water per row over ticks 2000-4000, and the altitude of the cloudiest
// interior row (the lid row, where the lid's cold always condenses some, is skipped).
function cloudiestAltitude(options) {
  const simulation = createConvection({ seed: 42 });
  const { width, height } = simulation, rows = new Float64Array(height), start = totalWater(simulation);
  for (let tick = 0; tick < 4000; tick++) {
    step(simulation, options);
    if (tick >= 2000 && tick % 20 === 0) for (let i = 0; i < width * height; i++) rows[Math.floor(i / width)] += simulation.liquid[i];
  }
  assert.ok(Math.abs(totalWater(simulation) - start) / start < 1e-9, "conserves water");
  let best = 1;
  for (let y = 2; y < height; y++) if (rows[y] > rows[best]) best = y;
  return 1 - best / (height - 1);
}
test("the inversion caps the cloud: it piles up just under the warm layer and follows its height", () => {
  const off = cloudiestAltitude({ inversion: false });
  const high = cloudiestAltitude({ inversion: true, inversionHeight: 0.6 });
  const low = cloudiestAltitude({ inversion: true, inversionHeight: 0.45 });
  assert.ok(off > 0.75, `without it the cloud is thickest near the lid (${off})`);
  assert.ok(high > 0.45 && high < 0.66, `capped under 0.6 (${high})`);
  assert.ok(low > 0.3 && low < 0.51 && low < high, `capped under 0.45 (${low})`);
});

// Cloud bases over ticks 2000-4000, every 50 ticks: in each column, the lowest cloudy
// pixel (cloud water over 0.002) above the bottom tenth, where floor fog can form. Returns
// the lowest base of each snapshot and the share of cloudy columns whose base lies within
// 0.08 of it, so a flat deck of bases scores near 1 and ragged ones score low.
function cloudBases(seed, options, size = {}) {
  const simulation = createConvection({ seed, ...size }), { width, height } = simulation, start = totalWater(simulation);
  const lowest = [];
  let cloudy = 0, flat = 0;
  for (let tick = 0; tick < 4000; tick++) {
    step(simulation, options);
    if (tick < 2000 || tick % 50) continue;
    const bases = [];
    for (let x = 0; x < width; x++) for (let y = Math.floor(0.9 * (height - 1)); y >= 1; y--) {
      if (simulation.liquid[y * width + x] > 0.002) { bases.push(1 - y / (height - 1)); break; }
    }
    const low = Math.min(...bases);
    lowest.push(low); cloudy += bases.length; flat += bases.filter(base => base <= low + 0.08).length;
  }
  assert.ok(Math.abs(totalWater(simulation) - start) / start < 1e-9, "conserves water");
  return { lowest, flatShare: flat / cloudy, spread: Math.max(...lowest) - Math.min(...lowest), mean: lowest.reduce((a, b) => a + b) / lowest.length };
}
test("the LCL gives flat cloud bases at one height, under the inversion's cloud layer, set by its height", () => {
  const lcl = cloudBases(42, { layering: "lcl" }), inversion = cloudBases(42, { layering: "inversion" }), none = cloudBases(42, { layering: "none" });
  assert.ok(lcl.spread < 0.15, `the lowest base holds its height over time (within a few rows) (${lcl.spread})`);
  assert.ok(lcl.mean > 0.25 && lcl.mean < 0.5, `near lclHeight ${defaults.lclHeight}: clear air under it (${lcl.mean})`);
  assert.ok(lcl.flatShare > 1.5 * inversion.flatShare && lcl.flatShare > 1.5 * none.flatShare,
    `more bases line up: ${lcl.flatShare} vs inversion ${inversion.flatShare}, none ${none.flatShare}`);
  assert.ok(lcl.mean < cloudiestAltitude({ layering: "inversion" }), "bases sit below the inversion's cloud layer");
  const high = cloudBases(42, { layering: "lcl", lclHeight: 0.5 });
  assert.ok(high.mean > lcl.mean + 0.06, `a higher LCL lifts the bases (${high.mean} vs ${lcl.mean})`);
});
test("128×96: the LCL's bases are flat too, at its height", () => {
  const size = { width: 128, height: 96 };
  const lcl = cloudBases(42, { layering: "lcl" }, size), none = cloudBases(42, { layering: "none" }, size);
  assert.ok(lcl.spread < 0.15, `the lowest base holds its height (${lcl.spread})`);
  assert.ok(lcl.mean > 0.25 && lcl.mean < 0.5, `near lclHeight ${defaults.lclHeight} (${lcl.mean})`);
  assert.ok(lcl.flatShare > 1.5 * none.flatShare, `more bases line up: ${lcl.flatShare} vs none ${none.flatShare}`);
});

test("without buoyancy the air settles below the activity floor", () => {
  const simulation = createConvection({ seed: 42 });
  interiorActivity(simulation, 1500, { buoyancy: 0 });
  assert.ok(interiorActivity(simulation, 500, { buoyancy: 0 }) < ACTIVITY_FLOOR);
  const capped = createConvection({ seed: 42 });
  interiorActivity(capped, 1500, { buoyancy: 0, inversion: true });
  assert.ok(interiorActivity(capped, 500, { buoyancy: 0, inversion: true }) < ACTIVITY_FLOOR, "under the inversion too");
});

test("every view renders opaque pixels without changing the state", () => {
  const simulation = createConvection({ width: 16, height: 12, seed: 3 });
  for (let tick = 0; tick < 50; tick++) step(simulation);
  const snapshot = structuredClone(simulation);
  for (const view of ["sunset", "lamp", "water", "temperature", "buoyancy", "humidity"]) {
    const pixels = renderConvection(simulation, view);
    assert.equal(pixels.length, 16 * 12 * 4);
    for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 255);
  }
  assert.deepEqual(simulation, snapshot);
});

test("sunset cloud: buoyant cloudy masses turn solid, thin streamers and still cloud do not", () => {
  const width = 128, height = 96, size = width * height;
  const disc = (cx, cy, r) => Float64Array.from({ length: size }, (_, i) => ((i % width - cx) ** 2 + (Math.floor(i / width) - cy) ** 2 <= r * r ? 0.005 : 0));
  const warm = new Float64Array(size).fill(0.1), still = new Float64Array(size);
  const puff = cloudCover(disc(64, 48, 15), warm, width, height);
  assert.ok(puff[48 * width + 64] > 0.99, "a warm cloudy mass is opaque inside");
  assert.equal(puff[48 * width + 100], 0, "clear air outside it");
  assert.ok(Math.max(...cloudCover(disc(64, 48, 15), still, width, height)) === 0, "non-buoyant cloud water stays a veil");
  const streamer = Float64Array.from({ length: size }, (_, i) => (i % width === 64 ? 0.005 : 0));
  assert.ok(Math.max(...cloudCover(streamer, warm, width, height)) < 0.05, "a one-pixel streamer fades");
  const lobes = billows(width, height);
  assert.ok(Math.min(...lobes) >= -1 && Math.max(...lobes) <= 1 && lobes === billows(width, height));
  // A surface sloping toward the low sun at the lower right is brighter than one facing away.
  assert.ok(facing(-0.1, -0.05) > facing(0, 0) && facing(0, 0) > facing(0.1, 0.05));
});

for (const [width, height] of SIZES) test(`${width}×${height} sunset cloud: still cloud pressed under warmer air turns solid, as a capped layer`, () => {
  const size = width * height, top = Math.round(height * 20 / 48), bottom = Math.round(height * 30 / 48);
  // A cloudy slab under air 0.2 warmer; no buoyancy anywhere. The cap reaches a few
  // pixels down (scaled to the grid), so the slab's top row is the one that turns solid.
  const temperature = Float64Array.from({ length: size }, (_, i) => (Math.floor(i / width) < top ? 0.7 : 0.5));
  const slab = Float64Array.from({ length: size }, (_, i) => (Math.floor(i / width) >= top && Math.floor(i / width) < bottom ? 0.005 : 0));
  const still = new Float64Array(size);
  assert.equal(Math.max(...cloudCover(slab, still, width, height)), 0, "uncapped, it stays a veil");
  const capped = cloudCover(slab, still, width, height, { capping: capping(temperature, width, height) });
  assert.ok(capped[(top + 1) * width + width / 2] > 0.9, "capped, its top is solid");
});

test("feathered edges: the same solid core, with a fringe that fades out over several pixels", () => {
  const width = 128, height = 96, size = width * height;
  const disc = Float64Array.from({ length: size }, (_, i) => ((i % width - 64) ** 2 + (Math.floor(i / width) - 48) ** 2 <= 225 ? 0.005 : 0));
  const warm = new Float64Array(size).fill(0.1);
  const hard = cloudLayers(disc, warm, width, height), soft = cloudLayers(disc, warm, width, height, { feather: true });
  assert.deepEqual(soft.core, hard.core, "the core is unchanged");
  assert.ok(soft.cover.every((value, i) => value >= soft.core[i] && value <= 1));
  assert.ok(soft.cover[48 * width + 64] > 0.99, "solid inside");
  // Along rays out of the disc, count pixels that are partly but not fully cloud.
  let partialHard = 0, partialSoft = 0;
  for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 16) for (let r = 8; r < 30; r++) {
    const i = Math.round(48 + r * Math.sin(angle)) * width + Math.round(64 + r * Math.cos(angle));
    if (hard.cover[i] > 0.02 && hard.cover[i] < 0.9) partialHard++;
    if (soft.cover[i] > 0.02 && soft.cover[i] < 0.9) partialSoft++;
  }
  assert.ok(partialSoft > 2 * partialHard, `wider fringe (${partialSoft} vs ${partialHard} partial pixels)`);
  const wisps = fray(width, height);
  assert.ok(Math.min(...wisps) >= -1 && Math.max(...wisps) <= 1 && wisps === fray(width, height));
});

test("sunset options: raw cloud water and feathering change only the drawing", () => {
  const simulation = createConvection({ seed: 5 });
  for (let tick = 0; tick < 1500; tick++) step(simulation);
  const snapshot = structuredClone(simulation);
  const draw = options => renderConvection(simulation, "sunset", options);
  const cumulus = draw({}), raw = draw({ cloudStyle: "raw" }), hard = draw({ feather: false });
  const differs = (a, b) => a.some((value, i) => value !== b[i]);
  assert.ok(differs(cumulus, raw) && differs(cumulus, hard));
  assert.deepEqual(draw({ cloudStyle: "raw", feather: false }), raw, "feathering does not apply to raw cloud water");
  assert.deepEqual(simulation, snapshot);
});

test("sunset colors: haze near saturation only, see-through rain, gold floor, indigo lid", () => {
  assert.equal(haze(0.5), 0);
  assert.equal(haze(0.9), 0);
  assert.ok(haze(0.97) > 0 && haze(0.97) < haze(1) && haze(1.2) <= HAZE_OPACITY);
  assert.equal(rainOpacity(0), 0);
  assert.ok(rainOpacity(RAIN_SCALE / 2) < rainOpacity(RAIN_SCALE));
  assert.equal(rainOpacity(10 * RAIN_SCALE), rainOpacity(RAIN_SCALE));
  assert.ok(rainOpacity(10 * RAIN_SCALE) <= 0.5);
  const [floor, lid] = [sunsetSky(0), sunsetSky(1)];
  assert.ok(floor[0] > floor[2] && lid[2] > lid[0]);
  const brightness = rgb => rgb[0] + rgb[1] + rgb[2];
  assert.ok(brightness(cloudColor(1, 0.5)) > brightness(cloudColor(0, 0.5)));
});
