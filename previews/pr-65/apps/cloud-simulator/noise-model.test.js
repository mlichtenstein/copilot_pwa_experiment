/* Purpose: Check the noise weather experiment: repeatable, smooth noise; one global wind
 *   that moves every field and all rain alike; a cloud-layer band low at both ends and high in
 *   the middle, with asymmetry and sharpness; cloud forcing only inside the band; stored
 *   cloud water that forms fast, fades slowly and drifts with the wind; slow rain that falls,
 *   drifts, dries and is conserved; a texture slider from smooth to ragged; rain made only in
 *   dense, lasting cloud that stays while it rains; varied rain streaks born only under a
 *   raining cloud and fading once it is gone; and weather that never stops moving, on random
 *   seeds.
 * Consumers: Node's test runner. Dependencies: node:test, node:assert and noise-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createNoise3, fractal, createWeather, step, sampleFields, renderWeather, airborneRain,
  pooledRain, defaults, RULES, FIELDS, layerBand, altitudeOf, createRainLayer, updateRainLayer,
  rainAlpha, formRain, textureShape, condense, dissipation, startCloud } from "./noise-model.js";

// Seeds are incidental: every check runs on fresh random seeds.
const randomSeeds = count => Array.from({ length: count }, () => Math.floor(Math.random() * 2 ** 32));
const sum = values => values.reduce((total, value) => total + value, 0);

test("noise repeats per seed, differs across seeds and stays in range", () => {
  for (const seed of randomSeeds(3)) {
    const a = createNoise3(seed), b = createNoise3(seed), c = createNoise3(seed + 1);
    let differs = false;
    for (let k = 0; k < 200; k++) {
      const x = k * 0.37, y = k * 0.11, z = k * 0.05;
      assert.equal(a(x, y, z), b(x, y, z));
      assert.ok(Math.abs(a(x, y, z)) <= 1.01);
      if (Math.abs(a(x, y, z) - c(x, y, z)) > 1e-6) differs = true;
    }
    assert.ok(differs, `seed ${seed} and ${seed + 1} differ`);
  }
});

test("noise is continuous in time and changes over longer times", () => {
  for (const seed of randomSeeds(3)) {
    const noise = createNoise3(seed);
    let maxJump = 0, totalChange = 0;
    for (let k = 0; k < 100; k++) {
      const x = 3.3 + k * 0.7, y = 1.9 + k * 0.3;
      maxJump = Math.max(maxJump, Math.abs(fractal(noise, x, y, 4.001, 3) - fractal(noise, x, y, 4, 3)));
      totalChange += Math.abs(fractal(noise, x, y, 6, 3) - fractal(noise, x, y, 4, 3));
    }
    assert.ok(maxJump < 0.02, `a tiny time step moves noise by at most ${maxJump}`);
    assert.ok(totalChange / 100 > 0.05, "noise moves over two time units");
  }
});


test("one global wind scrolls every field sideways together", () => {
  for (const seed of randomSeeds(2)) {
    const a = createWeather({ width: 40, height: 12, seed }), b = createWeather({ width: 40, height: 12, seed });
    // Same time, b scrolled 3 px further: b at x equals a at x − 3, for every field.
    b.scroll = a.scroll + 3;
    sampleFields(a); sampleFields(b);
    for (const name of FIELDS) for (let y = 0; y < 12; y++) for (let x = 3; x < 40; x++)
      assert.ok(Math.abs(b[name][y * 40 + x] - a[name][y * 40 + x - 3]) < 1e-12, name);
    // A tick adds exactly `wind` to the scroll, either sign.
    for (const wind of [0.3, -0.2]) {
      const simulation = createWeather({ seed });
      step(simulation, { wind }); step(simulation, { wind });
      assert.ok(Math.abs(simulation.scroll - 2 * wind) < 1e-12);
    }
  }
});

test("the cloud-layer band is low at both ends, 1 in the middle, with asymmetry and sharpness", () => {
  const rules = { ...defaults, layerHeight: 0.5, layerThickness: 0.3, layerAsymmetry: 0, layerSharpness: 4 };
  assert.equal(layerBand(0.5, rules), 1);
  assert.ok(layerBand(0, rules) < 1e-6 && layerBand(1, rules) < 1e-6);
  // Rises monotonically to the middle and falls after it.
  for (let a = 0; a < 0.5; a += 0.01) assert.ok(layerBand(a, rules) <= layerBand(a + 0.01, rules) + 1e-12);
  for (let a = 0.5; a < 0.99; a += 0.01) assert.ok(layerBand(a, rules) >= layerBand(a + 0.01, rules) - 1e-12);
  // Symmetric at 0 asymmetry; positive asymmetry: sharper bottom, wider top; negative the reverse.
  assert.ok(Math.abs(layerBand(0.4, rules) - layerBand(0.6, rules)) < 1e-12);
  const up = { ...rules, layerAsymmetry: 0.5 }, down = { ...rules, layerAsymmetry: -0.5 };
  assert.ok(layerBand(0.4, up) < layerBand(0.6, up));
  assert.ok(layerBand(0.4, down) > layerBand(0.6, down));
  // Higher sharpness: flatter inside the band, lower outside it (crisper edges).
  const soft = { ...rules, layerSharpness: 2 }, sharp = { ...rules, layerSharpness: 10 };
  assert.ok(layerBand(0.55, sharp) > layerBand(0.55, soft));
  assert.ok(layerBand(0.7, sharp) < layerBand(0.7, soft));
  // Thickness widens it.
  assert.ok(layerBand(0.7, { ...rules, layerThickness: 0.6 }) > layerBand(0.7, rules));
});

test("cloud is forced exactly where relative humidity × band passes the threshold", () => {
  for (const seed of randomSeeds(2)) {
    const simulation = createWeather({ width: 64, height: 48, seed });
    sampleFields(simulation);
    let cloudy = 0;
    simulation.potential.forEach((cloud, i) => {
      const forming = simulation.relative[i] * layerBand(altitudeOf(i, 64, 48));
      assert.equal(cloud > 0, forming > RULES.cloudThreshold, `seed ${seed} pixel ${i}`);
      if (cloud > 0) cloudy++;
    });
    assert.ok(cloudy > 0, `seed ${seed} has some cloud`);
  }
});

test("at defaults the cloud sits in a clear horizontal layer with clear sky above and below", () => {
  const { height, width } = { height: 96, width: 128 }, rows = new Array(height).fill(0);
  for (const seed of randomSeeds(4)) {
    const simulation = createWeather({ seed });
    for (let t = 0; t <= 1000; t += 125) {
      simulation.time = t * defaults.changeSpeed; simulation.scroll = t * defaults.wind;
      sampleFields(simulation);
      simulation.potential.forEach((cloud, i) => { if (cloud > 0) rows[Math.floor(i / width)]++; });
    }
  }
  const total = sum(rows), share = predicate => sum(rows.filter((_, y) => predicate(altitudeOf(y * width, width, height)))) / total;
  const { layerHeight: c, layerThickness: w, layerAsymmetry: s } = defaults;
  const below = share(a => a < c - w / 2 * (1 - s)), above = share(a => a > c + w / 2 * (1 + s));
  assert.ok(total > 0);
  assert.ok(below < 0.01, `cloud below the layer: ${below}`);
  assert.ok(above < 0.05, `cloud above the layer: ${above}`);
  // Sharper bottom: the lowest cloudy row is closer to the layer's middle than the highest.
  const cloudy = rows.map((count, y) => count > total * 0.002 ? altitudeOf(y * width, width, height) : null).filter(a => a !== null);
  assert.ok(c - Math.min(...cloudy) < Math.max(...cloudy) - c);
});

test("all rain moves fallSpeed down and wind sideways per tick, nothing lost", () => {
  for (const [fallSpeed, wind] of [[0.25, 0.1], [0.4, -0.2], [1, 0]]) {
    const simulation = createWeather({ width: 48, height: 40, seed: randomSeeds(1)[0] });
    // No cloud, so no new rain, no evaporation, and no puddle drying.
    const options = { cloudiness: -1, fallSpeed, wind };
    sampleFields(simulation, options); startCloud(simulation);
    // Kept away from the side walls, where diffused tails would wrap around.
    simulation.rain[5 * 48 + 24] = 1; simulation.rain[8 * 48 + 28] = 0.5;
    const centre = () => {
      let x = 0, y = 0, mass = 0;
      simulation.rain.forEach((value, i) => { x += value * (i % 48); y += value * Math.floor(i / 48); mass += value; });
      return [x / mass, y / mass, mass];
    };
    const [x0, y0] = centre();
    for (let k = 0; k < 20; k++) step(simulation, options);
    const [x1, y1, mass] = centre();
    assert.ok(Math.abs(y1 - y0 - 20 * fallSpeed) < 1e-6, `fall ${fallSpeed}`);
    assert.ok(Math.abs(x1 - x0 - 20 * wind) < 1e-6, `wind ${wind}`);
    assert.ok(Math.abs(mass + simulation.evaporated - 1.5) < 1e-9);
  }
});

test("rain dries outside cloud, fills puddles and is conserved overall", () => {
  for (const seed of randomSeeds(2)) {
    const simulation = createWeather({ seed });
    for (let k = 0; k < 800; k++) step(simulation);
    assert.ok(simulation.rained > 0, `seed ${seed} rains`);
    assert.ok(simulation.evaporated > 0 && pooledRain(simulation) > 0, `seed ${seed} dries and pools`);
    const accounted = airborneRain(simulation) + pooledRain(simulation) + simulation.evaporated;
    assert.ok(Math.abs(accounted - simulation.rained) / simulation.rained < 1e-9);
    assert.ok(simulation.rain.every(v => v >= 0 && Number.isFinite(v)));
  }
});

test("texture runs from smooth to ragged: more fine detail in humidity as it rises", () => {
  for (const seed of randomSeeds(2)) {
    const roughness = texture => {
      const simulation = createWeather({ seed });
      sampleFields(simulation, { texture });
      // Mean neighbor-to-neighbor change: fine detail.
      let change = 0;
      for (let i = 1; i < simulation.humidity.length; i++) if (i % simulation.width) change += Math.abs(simulation.humidity[i] - simulation.humidity[i - 1]);
      return change;
    };
    const smooth = roughness(0), middle = roughness(defaults.texture), ragged = roughness(1);
    assert.ok(smooth < middle && middle < ragged, `seed ${seed}: ${smooth.toFixed(1)} < ${middle.toFixed(1)} < ${ragged.toFixed(1)}`);
    assert.ok(ragged > 1.5 * smooth);
  }
  assert.deepEqual(textureShape(0), { octaves: 1, roughness: 0.3 });
  assert.ok(Math.abs(textureShape(1).octaves - 6) < 1e-12 && Math.abs(textureShape(1).roughness - 0.75) < 1e-12);
});

test("rain is made only in dense cloud water, and streaks are born only just under a cloud", () => {
  for (const seed of randomSeeds(2)) {
    const simulation = createWeather({ seed }), layer = createRainLayer(seed);
    const { width } = simulation;
    let made = 0, born = 0;
    for (let k = 0; k < 600; k++) {
      step(simulation);
      // Charge everything so every pixel would rain if it could: only cloud does.
      const charged = { ...simulation, charge: simulation.charge.map(() => 1), cloud: simulation.cloud.slice(), rain: simulation.rain.slice() };
      formRain(charged).forEach((amount, i) => {
        if (amount > 0) { made++; assert.ok(simulation.cloud[i] >= RULES.denseWater, `rain made at thin pixel ${i} (${simulation.cloud[i]})`); }
      });
      updateRainLayer(layer, simulation);
      for (const streak of layer.streaks) {
        if (streak.age) continue;
        born++;
        const column = Math.floor(streak.x), row = Math.floor(streak.y);
        let cloudAbove = false;
        for (let r = Math.max(0, row - 4); r <= row; r++) if (simulation.cloud[r * width + column] > 0) cloudAbove = true;
        assert.ok(cloudAbove, `seed ${seed}: streak born at (${streak.x.toFixed(1)}, ${streak.y.toFixed(1)}) with no cloud within 4 px above`);
      }
    }
    assert.ok(made > 0 && born > 0, `seed ${seed} rains (${made} pixels) and makes streaks (${born})`);
  }
});

test("rain streaks grow out of the cloud base, lean with the wind, and fade once their cloud is gone", () => {
  const simulation = createWeather({ width: 48, height: 40, seed: randomSeeds(1)[0] });
  const options = { cloudiness: -1, wind: 0.2, fallSpeed: 0.25 };
  sampleFields(simulation, options); startCloud(simulation);
  const layer = createRainLayer(randomSeeds(1)[0]);
  // Rain in clear air with no cloud above: no streaks.
  for (let y = 10; y < 14; y++) for (let x = 20; x < 24; x++) simulation.rain[y * 48 + x] = 1;
  for (let k = 0; k < 20; k++) updateRainLayer(layer, simulation, options);
  assert.equal(layer.streaks.length, 0, "no cloud, no streaks");
  // A thin cloud over it: still no streaks, since only dense, charged cloud rains.
  for (let y = 6; y < 10; y++) for (let x = 20; x < 24; x++) simulation.cloud[y * 48 + x] = 0.5;
  for (let k = 0; k < 20; k++) updateRainLayer(layer, simulation, options);
  assert.equal(layer.streaks.length, 0, "thin cloud, no streaks");
  // A dense, charged cloud over it, base at row 9.
  for (let y = 6; y < 10; y++) for (let x = 20; x < 24; x++) { simulation.cloud[y * 48 + x] = 1; simulation.charge[y * 48 + x] = 1; }
  for (let k = 0; k < 40 && layer.streaks.length === 0; k++) updateRainLayer(layer, simulation, options);
  assert.ok(layer.streaks.length > 0);
  const newest = layer.streaks.at(-1);
  assert.ok(newest.x >= 20 && newest.x < 24 && newest.y >= 9.5 && newest.y <= 12.5 && newest.top === newest.y);
  // Just born: barely visible.
  assert.ok(Math.max(...rainAlpha({ streaks: [{ ...newest, age: 0 }] }, simulation, options)) < 0.01);
  // Halfway through life: visible, nothing above the row it was born on, and its tail sits
  // upwind of its head.
  const grown = { ...newest, age: newest.life / 2, y: 34, x: 24, length: 20, top: 11, wide: false };
  const alpha = rainAlpha({ streaks: [grown] }, simulation, options);
  assert.ok(Math.max(...alpha) > 0.2);
  for (let i = 0; i < 11 * 48; i++) assert.equal(alpha[i], 0, "nothing above the birth row");
  const columnAt = row => { let x = 0, a = 0; for (let c = 0; c < 48; c++) { x += c * alpha[row * 48 + c]; a += alpha[row * 48 + c]; } return x / a; };
  assert.ok(columnAt(16) < columnAt(33), "tail upwind (left) of head with wind to the right");
  // Moves with its own fall speed and the wind.
  const first = layer.streaks[0], before = { x: first.x, y: first.y };
  updateRainLayer(layer, simulation, options);
  assert.ok(Math.abs(first.y - before.y - 0.25 * first.speed) < 1e-12 && Math.abs(first.x - before.x - 0.2) < 1e-12);
  // The cloud dissolves: every streak fades out within a few ticks, and no new ones start.
  simulation.cloud.fill(0);
  for (let k = 0; k < 20; k++) updateRainLayer(layer, simulation, options);
  assert.equal(layer.streaks.length, 0);
});

test("rain streaks vary: heavy-tailed lengths from 3 to 30 px, uneven spacing, own speeds", () => {
  const simulation = createWeather({ width: 96, height: 60, seed: randomSeeds(1)[0] });
  const options = { cloudiness: -1, wind: 0 };
  sampleFields(simulation, options); startCloud(simulation);
  // One wide, evenly raining cloud: any unevenness comes from the streaks themselves.
  for (let y = 5; y < 10; y++) for (let x = 0; x < 96; x++) { simulation.cloud[y * 96 + x] = 1; simulation.charge[y * 96 + x] = 1; }
  for (let y = 9; y < 12; y++) for (let x = 0; x < 96; x++) simulation.rain[y * 96 + x] = 0.2;
  const layer = createRainLayer(randomSeeds(1)[0]), births = [];
  for (let k = 0; k < 400; k++) {
    updateRainLayer(layer, simulation, options);
    births.push(...layer.streaks.filter(streak => streak.age === 0));
  }
  const lengths = births.map(streak => streak.length).sort((a, b) => a - b);
  assert.ok(lengths.length > 200, `${lengths.length} streaks`);
  assert.ok(lengths[0] >= 3 && lengths.at(-1) <= 30);
  const median = lengths[lengths.length >> 1], mean = sum(lengths) / lengths.length;
  assert.ok(median < mean, "heavy tail: mean above median");
  assert.ok(lengths.filter(l => l < 6).length > 0.25 * lengths.length && lengths.filter(l => l > 20).length > 0.05 * lengths.length);
  // Not on a grid: sub-pixel positions spread out, and births clump (counts per 8-px strip vary).
  assert.ok(new Set(births.map(streak => (streak.x % 1).toFixed(2))).size > 50);
  const strips = new Array(12).fill(0);
  for (const streak of births) strips[Math.floor(streak.x / 8)]++;
  const stripMean = sum(strips) / 12, spread = Math.sqrt(sum(strips.map(c => (c - stripMean) ** 2)) / 12);
  assert.ok(spread / stripMean > 0.2, `clumped: strip counts ${strips.join(",")}`);
  const speeds = births.map(streak => streak.speed);
  assert.ok(Math.min(...speeds) >= 0.8 && Math.max(...speeds) <= 1.2 && Math.max(...speeds) - Math.min(...speeds) > 0.3);
});

test("cloud water forms fast, fades slowly (slower with persistence) and drifts with the wind", () => {
  const simulation = createWeather({ width: 8, height: 4, seed: 1 });
  const ticksTo = (from, potential, persistence, done) => {
    simulation.cloud.fill(from); simulation.potential.fill(potential);
    let ticks = 0;
    while (!done(simulation.cloud[0]) && ticks < 10000) { condense(simulation, { persistence }); ticks++; }
    return ticks;
  };
  for (const persistence of [0, 0.3, defaults.persistence, 1]) {
    const form = ticksTo(0, 1, persistence, c => c >= 0.9), fade = ticksTo(1, 0, persistence, c => c <= 0.1);
    assert.ok(form <= 8, `forms in ${form} ticks`);
    assert.ok(fade > 2 * form, `persistence ${persistence}: fades in ${fade} ticks vs forms in ${form}`);
  }
  assert.ok(ticksTo(1, 0, 1, c => c <= 0.1) > 5 * ticksTo(1, 0, 0, c => c <= 0.1), "persistence slows fading");
  assert.ok(dissipation(0) > dissipation(defaults.persistence) && dissipation(defaults.persistence) > dissipation(1));
  // In a full run, a cloud that has lost its forcing outlives it: some pixels are still
  // cloudy with no forcing, and stored cloud follows the wind with the noise.
  for (const seed of randomSeeds(2)) {
    const run = createWeather({ seed });
    let lingering = 0;
    for (let k = 0; k < 400; k++) {
      step(run);
      run.cloud.forEach((cloud, i) => { if (cloud > 0.3 && run.potential[i] === 0) lingering++; });
    }
    assert.ok(lingering > 0, `seed ${seed}: clouds linger after their forcing`);
    assert.ok(Math.abs(run.shifted - run.scroll) <= 0.5, "cloud carried within half a pixel of the noise scroll");
  }
  // Calm air, frozen noise: stored cloud and potential stay put.
  const calm = createWeather({ width: 32, height: 24, seed: randomSeeds(1)[0] }), before = calm.cloud.slice();
  for (let k = 0; k < 20; k++) step(calm, { wind: 0, changeSpeed: 0, rainAmount: 0 });
  calm.cloud.forEach((cloud, i) => assert.ok(cloud >= before[i] - 1e-9 || cloud >= calm.potential[i]));
  // Wind: an isolated, unforced cloud moves 10 px right over 100 ticks at wind 0.1.
  const carried = createWeather({ width: 40, height: 10, seed: 1 }), options = { cloudiness: -1, wind: 0.1, persistence: 1, rainAmount: 0 };
  sampleFields(carried, options); startCloud(carried);
  carried.cloud[5 * 40 + 10] = 1;
  for (let k = 0; k < 100; k++) step(carried, options);
  assert.ok(carried.cloud[5 * 40 + 20] > 0.8 && carried.cloud[5 * 40 + 10] === 0);
});

test("a raining cloud stays above its rain, and stops raining before it fades", () => {
  // One dense cloud with its forcing gone: it rains (draining itself), rain stops while the
  // cloud is still there, then the cloud fades.
  const simulation = createWeather({ width: 20, height: 20, seed: 1 }), options = { cloudiness: -1, wind: 0 };
  sampleFields(simulation, options); startCloud(simulation);
  for (let y = 4; y < 8; y++) for (let x = 6; x < 12; x++) { simulation.cloud[y * 20 + x] = 1; simulation.charge[y * 20 + x] = 1; }
  let lastRain = -1, gone = -1;
  for (let k = 0; k < 1000 && gone < 0; k++) {
    const before = simulation.rained;
    step(simulation, options);
    if (simulation.rained > before) lastRain = k;
    if (simulation.cloud.every(v => v === 0)) gone = k;
  }
  assert.ok(lastRain > 0, "it rains");
  assert.ok(gone > lastRain + 20, `rain stops (tick ${lastRain}) well before the cloud is gone (tick ${gone})`);
  // Full runs: every pixel that makes rain is still dense cloud afterwards, and every new
  // streak starts under cloud that is raining.
  for (const seed of randomSeeds(2)) {
    const run = createWeather({ seed }), layer = createRainLayer(seed), { width, height } = run;
    let made = 0;
    for (let k = 0; k < 600; k++) {
      step(run); updateRainLayer(layer, run);
      for (let i = 0; i < run.cloud.length; i++) if (run.made[i] > 0) {
        made++;
        assert.ok(run.cloud[i] >= RULES.denseWater - 2 * RULES.rainDrain * defaults.rainAmount, `seed ${seed}: raining pixel thinned to ${run.cloud[i]}`);
      }
      for (const streak of layer.streaks) if (streak.age === 0) {
        const column = Math.floor(streak.x);
        let dense = false;
        for (let y = 0; y < height; y++) if (run.cloud[y * width + column] >= RULES.denseWater - 0.05) dense = true;
        assert.ok(dense, `seed ${seed}: streak born under column ${column} with no dense cloud`);
      }
    }
    assert.ok(made > 0, `seed ${seed} rains`);
  }
});

test("the weather never stops moving and keeps raining", () => {
  for (const seed of randomSeeds(2)) {
    const simulation = createWeather({ seed });
    let previous = renderWeather(simulation), stillFrames = 0, rainingFrames = 0, cloudyFrames = 0;
    for (let k = 1; k <= 3000; k++) {
      step(simulation);
      if (k % 100) continue;
      const frame = renderWeather(simulation);
      let changed = 0;
      for (let p = 0; p < frame.length; p += 4) if (frame[p] !== previous[p] || frame[p + 1] !== previous[p + 1]) changed++;
      if (changed < 20) stillFrames++;
      if (airborneRain(simulation) > 0.1) rainingFrames++;
      if (simulation.cloud.some(v => v > 0)) cloudyFrames++;
      previous = frame;
    }
    assert.equal(stillFrames, 0, `seed ${seed} never freezes`);
    assert.ok(rainingFrames >= 20, `seed ${seed} rains in ${rainingFrames} of 30 samples`);
    assert.ok(cloudyFrames >= 25, `seed ${seed} has cloud in ${cloudyFrames} of 30 samples`);
  }
});

test("every view renders opaque pixels", () => {
  const seed = randomSeeds(1)[0], simulation = createWeather({ seed }), layer = createRainLayer(seed);
  for (let k = 0; k < 50; k++) { step(simulation); updateRainLayer(layer, simulation); }
  for (const view of ["sunset", "water", "relative", "humidity", "temperature", "pressure"]) {
    const pixels = renderWeather(simulation, view, defaults, layer);
    assert.equal(pixels.length, 128 * 96 * 4);
    for (let p = 3; p < pixels.length; p += 4) assert.equal(pixels[p], 255);
  }
});
