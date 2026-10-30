/* Purpose: Check the noise weather experiment: repeatable, smooth noise; one global wind
 *   that moves every field and all rain alike; a cloud-layer band low at both ends and high in
 *   the middle, with asymmetry and sharpness; cloud only inside the band; slow rain that
 *   falls, drifts, dries and is conserved; rain streaks born only under rain; and weather
 *   that never stops moving, on random seeds.
 * Consumers: Node's test runner. Dependencies: node:test, node:assert and noise-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createNoise3, fractal, createWeather, step, sampleFields, renderWeather, airborneRain,
  pooledRain, defaults, RULES, FIELDS, layerBand, altitudeOf, createRainLayer, updateRainLayer,
  rainAlpha } from "./noise-model.js";

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

test("cloud forms exactly where relative humidity × band passes the threshold", () => {
  for (const seed of randomSeeds(2)) {
    const simulation = createWeather({ width: 64, height: 48, seed });
    sampleFields(simulation);
    let cloudy = 0;
    simulation.cloud.forEach((cloud, i) => {
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
      simulation.cloud.forEach((cloud, i) => { if (cloud > 0) rows[Math.floor(i / width)]++; });
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
    sampleFields(simulation, options);
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

test("rain streaks are born only under rain, fade in, and lean with the wind", () => {
  const simulation = createWeather({ width: 48, height: 40, seed: randomSeeds(1)[0] });
  const options = { cloudiness: -1, wind: 0.2, fallSpeed: 0.25 };
  sampleFields(simulation, options);
  const layer = createRainLayer(randomSeeds(1)[0]);
  updateRainLayer(layer, simulation, options);
  assert.equal(layer.streaks.length, 0, "no rain, no streaks");
  for (let y = 10; y < 14; y++) for (let x = 20; x < 24; x++) simulation.rain[y * 48 + x] = 1;
  updateRainLayer(layer, simulation, options);
  for (let k = 0; k < 20 && layer.streaks.length === 0; k++) updateRainLayer(layer, simulation, options);
  assert.ok(layer.streaks.length > 0);
  const newest = layer.streaks.at(-1);
  assert.ok(newest.x >= 20 && newest.x < 24 && newest.y >= 10 && newest.y < 14);
  // Just born: barely visible.
  assert.ok(Math.max(...rainAlpha({ streaks: [{ ...newest, age: 0 }] }, simulation, options)) < 0.01);
  // Halfway through life: visible, and its tail sits upwind of its head.
  const grown = { ...newest, age: newest.life / 2, y: 30, x: 24 };
  const alpha = rainAlpha({ streaks: [grown] }, simulation, options);
  assert.ok(Math.max(...alpha) > 0.2);
  const columnAt = row => { let x = 0, a = 0; for (let c = 0; c < 48; c++) { x += c * alpha[row * 48 + c]; a += alpha[row * 48 + c]; } return x / a; };
  const head = 29, tail = Math.ceil(30 - grown.length) + 1;
  assert.ok(columnAt(tail) < columnAt(head), "tail upwind (left) of head with wind to the right");
  // Moves with fall speed and wind.
  const before = { x: layer.streaks[0].x, y: layer.streaks[0].y };
  updateRainLayer(layer, simulation, options);
  if (layer.streaks[0].age > 1) {
    assert.ok(Math.abs(layer.streaks[0].y - before.y - 0.25) < 1e-12 && Math.abs(layer.streaks[0].x - before.x - 0.2) < 1e-12);
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
