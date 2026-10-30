/* Purpose: Check the noise weather experiment: repeatable, smooth noise; cloud where relative
 *   humidity crosses the threshold; rain that falls, drifts, dries and is conserved; and fields
 *   that never stop moving, on random seeds.
 * Consumers: Node's test runner. Dependencies: node:test, node:assert and noise-model.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createNoise3, fractal, createWeather, step, sampleFields, renderWeather, saturation,
  airborneRain, pooledRain, defaults } from "./noise-model.js";

// Seeds are incidental: every check runs on fresh random seeds.
const randomSeeds = count => Array.from({ length: count }, () => Math.floor(Math.random() * 2 ** 32));

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

test("cloud appears exactly where relative humidity passes the threshold", () => {
  for (const seed of randomSeeds(2)) {
    const simulation = createWeather({ seed });
    for (const cloudThreshold of [0.8, 1, 1.2]) {
      sampleFields(simulation, { cloudThreshold });
      simulation.relative.forEach((relative, i) => {
        assert.equal(simulation.cloud[i] > 0, relative > cloudThreshold);
        const expected = saturation(simulation.temperature[i], simulation.pressure[i]);
        assert.ok(Math.abs(relative - Math.max(0, simulation.humidity[i]) / expected) < 1e-9);
      });
    }
    // A lower threshold or low pressure lift gives more cloud.
    const cover = options => { sampleFields(simulation, options); return simulation.cloud.filter(v => v > 0).length; };
    assert.ok(cover({ cloudThreshold: 0.8 }) > cover({ cloudThreshold: 1.2 }));
  }
  assert.ok(saturation(0.5, -1) < saturation(0.5, 0) && saturation(0.5, 0) < saturation(0.8, 0));
});

test("rain falls one pixel per tick, drifts with the wind and fills puddles", () => {
  const simulation = createWeather({ width: 8, height: 6, seed: randomSeeds(1)[0] });
  // A dry, clear sky so only the placed drop moves.
  const rules = { humidityBias: -5, rainEvaporation: 0, puddleEvaporation: 0, windDrift: 0 };
  simulation.rain[1 * 8 + 3] = 1;
  step(simulation, rules);
  assert.equal(simulation.rain[2 * 8 + 3], 1);
  for (let k = 0; k < 4; k++) step(simulation, rules);
  assert.equal(airborneRain(simulation), 0);
  assert.equal(simulation.puddle[3], 1);
  // With wind, part of a falling drop moves sideways but none is lost.
  const windy = createWeather({ width: 8, height: 6, seed: 3 });
  windy.rain[8 + 3] = 1;
  step(windy, { ...rules, windDrift: 1, windBias: 1, windAmplitude: 0 });
  assert.equal(windy.rain[2 * 8 + 3], 0);
  assert.equal(windy.rain[2 * 8 + 4], 1);
});

test("rain dries in dry air and is conserved overall", () => {
  for (const seed of randomSeeds(2)) {
    const simulation = createWeather({ seed });
    for (let k = 0; k < 800; k++) step(simulation);
    assert.ok(simulation.rained > 0, `seed ${seed} rains`);
    const accounted = airborneRain(simulation) + pooledRain(simulation) + simulation.evaporated;
    assert.ok(Math.abs(accounted - simulation.rained) / simulation.rained < 1e-9);
    assert.ok(simulation.rain.every(v => v >= 0 && Number.isFinite(v)));
  }
  // Drier air dries more rain.
  const drying = humidityBias => {
    const simulation = createWeather({ width: 4, height: 40, seed: 5 });
    simulation.rain[1] = 1;
    for (let k = 0; k < 30; k++) step(simulation, { humidityBias, humidityAmplitude: 0, puddleEvaporation: 0, windDrift: 0 });
    return simulation.evaporated;
  };
  assert.ok(drying(0) > drying(0.15) && drying(0.15) > 0);
});

test("the weather never stops moving and keeps raining", () => {
  for (const seed of randomSeeds(3)) {
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
  const simulation = createWeather({ seed: randomSeeds(1)[0] });
  for (let k = 0; k < 50; k++) step(simulation);
  for (const view of ["sunset", "water", "relative", "humidity", "temperature", "pressure", "wind"]) {
    const pixels = renderWeather(simulation, view, defaults);
    assert.equal(pixels.length, 64 * 48 * 4);
    for (let p = 3; p < pixels.length; p += 4) assert.equal(pixels[p], 255);
  }
});
