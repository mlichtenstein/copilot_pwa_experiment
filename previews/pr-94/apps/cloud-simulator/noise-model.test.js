/* Purpose: Check the noise weather experiment: repeatable, smooth noise; one global wind
 *   that moves every field and all rain alike; a cloud-layer band low at both ends and high in
 *   the middle, with asymmetry and a fixed soft edge (no sharpness setting); cloud forcing
 *   only inside the band; stored cloud water that forms fast, fades slowly from the edges in
 *   and drifts with the wind; slow rain that falls, drifts, never dries in the air, spreads
 *   only a little sideways, reaches the floor and is conserved; a texture slider from smooth
 *   to ragged; rain made only in dense, lasting cloud that stays while it rains; rain streaks
 *   (pure functions of the seed and the stored state, nothing saved) and a curtain drawn from
 *   the falling rain, down to the floor; and weather that never stops moving, on pinned seeds
 *   (core/test-seeds.js).
 * Consumers: Node's test runner. Dependencies: node:test, node:assert, noise-model.js and core/test-seeds.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createNoise3, fractal, createWeather, step, sampleFields, renderWeather, airborneRain,
  pooledRain, defaults, RULES, FIELDS, layerBand, altitudeOf, createRainLayer, hash, rainLean,
  rainAlpha, STREAK, curtainAlpha, cloudBases, formRain, textureShape, condense, dissipation, startCloud,
  exposure } from "./noise-model.js";
import { testSeeds } from "./core/test-seeds.js";

// Seeds are pinned (core/test-seeds.js) so runs are repeatable; FUZZ_SEEDS=1 draws fresh ones.
const seeds = count => testSeeds(count);
const sum = values => values.reduce((total, value) => total + value, 0);

test("noise repeats per seed, differs across seeds and stays in range", () => {
  for (const seed of seeds(3)) {
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
  for (const seed of seeds(3)) {
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
  for (const seed of seeds(2)) {
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

test("the cloud-layer band is low at both ends, 1 in the middle, with asymmetry and a fixed soft edge", () => {
  const rules = { ...defaults, layerHeight: 0.5, layerThickness: 0.3, layerAsymmetry: 0 };
  assert.equal(layerBand(0.5, rules), 1);
  assert.ok(layerBand(0, rules) < 0.01 && layerBand(1, rules) < 0.01);
  // Rises monotonically to the middle and falls after it.
  for (let a = 0; a < 0.5; a += 0.01) assert.ok(layerBand(a, rules) <= layerBand(a + 0.01, rules) + 1e-12);
  for (let a = 0.5; a < 0.99; a += 0.01) assert.ok(layerBand(a, rules) >= layerBand(a + 0.01, rules) - 1e-12);
  // Symmetric at 0 asymmetry; positive asymmetry: sharper bottom, wider top; negative the reverse.
  assert.ok(Math.abs(layerBand(0.4, rules) - layerBand(0.6, rules)) < 1e-12);
  const up = { ...rules, layerAsymmetry: 0.5 }, down = { ...rules, layerAsymmetry: -0.5 };
  assert.ok(layerBand(0.4, up) < layerBand(0.6, up));
  assert.ok(layerBand(0.4, down) > layerBand(0.6, down));
  // No sharpness setting: the exponent is fixed, so an old saved layerSharpness changes nothing.
  assert.ok(!("layerSharpness" in defaults));
  for (const a of [0.3, 0.45, 0.6, 0.8]) assert.equal(layerBand(a, { ...rules, layerSharpness: 10 }), layerBand(a, rules));
  // Soft edge: already well below 1 a little way from the middle (no flat top).
  assert.ok(layerBand(0.6, rules) < 0.8);
  // Thickness widens it.
  assert.ok(layerBand(0.7, { ...rules, layerThickness: 0.6 }) > layerBand(0.7, rules));
});

test("cloud is forced exactly where relative humidity × band passes the threshold", () => {
  for (const seed of seeds(2)) {
    // Some seeds start with a clear sky, so sample frames along the noise's time axis
    // (as playback does) and check the rule on every one; at least one must have cloud.
    const simulation = createWeather({ width: 64, height: 48, seed });
    let cloudy = 0;
    for (let t = 0; t <= 4000 && cloudy === 0; t += 100) {
      simulation.time = t * defaults.changeSpeed; simulation.scroll = t * defaults.wind;
      sampleFields(simulation);
      simulation.potential.forEach((cloud, i) => {
        const forming = simulation.relative[i] * layerBand(altitudeOf(i, 64, 48));
        assert.equal(cloud > 0, forming > RULES.cloudThreshold, `seed ${seed} tick ${t} pixel ${i}`);
        if (cloud > 0) cloudy++;
      });
    }
    assert.ok(cloudy > 0, `seed ${seed} has some cloud`);
  }
});

test("at defaults the cloud sits in a clear horizontal layer with clear sky above and below", () => {
  const { height, width } = { height: 96, width: 128 }, rows = new Array(height).fill(0);
  for (const seed of seeds(4)) {
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

test("all rain moves fallSpeed down and trails its cloud sideways, nothing lost", () => {
  // The rain falls through air that is not moving with its cloud, so it keeps none of the wind
  // (the lean wind / fall takes all of it) until the lean hits its cap, past which it keeps the rest.
  for (const [fallSpeed, wind] of [[0.25, 0.1], [0.4, -0.2], [1, 0], [0.1, 0.5], [0.1, -0.5]]) {
    const simulation = createWeather({ width: 48, height: 40, seed: seeds(1)[0] });
    // No cloud, so no new rain, and nothing reaches the puddles.
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
    const drift = wind - rainLean(wind, fallSpeed) * fallSpeed;
    // Carried in whole pixels, so within half a pixel of its path.
    assert.ok(Math.abs(x1 - x0 - simulation.rainShifted) < 1e-6 && Math.abs(x1 - x0 - 20 * drift) <= 0.5 + 1e-9, `wind ${wind}, fall ${fallSpeed}: moved ${(x1 - x0).toFixed(2)}, expected ${(20 * drift).toFixed(2)}`);
    assert.ok(Math.abs(mass - 1.5) < 1e-9 && simulation.evaporated === 0);
  }
});

test("a rain shaft leans by wind / fall (tan of the angle), at most 60° from the vertical", () => {
  assert.equal(rainLean(0, 0.25), 0);
  assert.ok(Math.abs(rainLean(0.1, 0.25) - 0.4) < 1e-12 && Math.abs(rainLean(-0.1, 0.25) + 0.4) < 1e-12);
  assert.ok(Math.abs(rainLean(0.25, 0.25) - 1) < 1e-12, "wind as fast as the fall: 45°");
  assert.ok(Math.abs(rainLean(0.5, 0.05) - Math.sqrt(3)) < 1e-12 && Math.abs(rainLean(-0.5, 0.05) + Math.sqrt(3)) < 1e-12, "capped at 60°");
  assert.equal(rainLean(0.3, 0), 0);
});

test("rain never dries in the air: it fills puddles and is conserved overall", () => {
  for (const seed of seeds(2)) {
    const simulation = createWeather({ seed });
    for (let k = 0; k < 800; k++) step(simulation);
    assert.ok(simulation.rained > 0 && pooledRain(simulation) > 0, `seed ${seed} rains and pools`);
    // Everything made is in the air or has left the floor; only puddles dry.
    const accounted = airborneRain(simulation) + simulation.fallen;
    assert.ok(Math.abs(accounted - simulation.rained) / simulation.rained < 1e-9);
    assert.ok(Math.abs(pooledRain(simulation) + simulation.evaporated - simulation.fallen) / simulation.fallen < 1e-9);
    assert.ok(simulation.rain.every(v => v >= 0 && Number.isFinite(v)));
  }
});

test("falling rain keeps all its mass until it leaves the floor", () => {
  for (const [fallSpeed, wind] of [[defaults.fallSpeed, defaults.wind], [0.6, -0.3]]) {
    const width = 64, height = 48, simulation = createWeather({ width, height, seed: seeds(1)[0] });
    const options = { cloudiness: -1, fallSpeed, wind, rainAmount: 0 };
    sampleFields(simulation, options); startCloud(simulation);
    for (let x = 28; x < 32; x++) simulation.rain[2 * width + x] = 0.25;
    // Until any of it reaches the floor, the rain in the air never shrinks.
    let previous = airborneRain(simulation), ticks = 0;
    for (;;) {
      step(simulation, options); ticks++;
      if (simulation.fallen > 0) break;
      const now = airborneRain(simulation);
      assert.ok(now >= previous - 1e-12, `tick ${ticks}: rain in the air fell from ${previous} to ${now} before reaching the floor`);
      previous = now;
    }
    // Bilinear falling smears a thin leading edge ahead of the shaft, but almost all of it
    // is still in the air when the first trace lands.
    assert.ok(airborneRain(simulation) > 1 - 1e-6);
    for (let k = 0; k < 4 * height / fallSpeed; k++) {
      step(simulation, options);
      assert.ok(Math.abs(airborneRain(simulation) + simulation.fallen - 1) < 1e-9, "air + fallen = all of it");
    }
    assert.ok(airborneRain(simulation) < 1e-6 && Math.abs(simulation.fallen - 1) < 1e-6, "it all reaches the floor");
  }
});

test("a rain shaft reaches the floor under its cloud, spreading only a little sideways", () => {
  const width = 128, height = 96, simulation = createWeather({ width, height, seed: seeds(1)[0] });
  const options = { cloudiness: -1, rainAmount: 0 };
  sampleFields(simulation, options); startCloud(simulation);
  const columnSpread = values => {
    // Circular mean column around x = 64 and the standard deviation about it.
    let mass = 0, x = 0, xx = 0;
    values.forEach((value, i) => { const c = (i % width + width / 2 - 64 + width) % width - width / 2; mass += value; x += value * c; xx += value * c * c; });
    return { mass, mean: x / mass + 64, sd: Math.sqrt(xx / mass - (x / mass) ** 2) };
  };
  // A 3 px wide shaft just under a cloud base, falling the whole height.
  for (let x = 63; x <= 65; x++) simulation.rain[20 * width + x] = 1;
  const start = columnSpread(simulation.rain);
  // Where the rain had been carried sideways when each part of it landed (puddles stay put).
  let carriedSum = 0;
  for (let k = 0; k < (height - 20) / defaults.fallSpeed + 40; k++) {
    const before = simulation.fallen;
    step(simulation, options);
    carriedSum += (simulation.fallen - before) * simulation.rainShifted;
  }
  const landed = columnSpread(simulation.puddle);
  assert.ok(landed.mass > 2.2, `most of the shaft has landed (puddles dry a little) (${landed.mass.toFixed(2)})`);
  // It landed where it had been carried, and is at most a few pixels wider than it started.
  const carried = 64 + carriedSum / simulation.fallen;
  assert.ok(Math.abs(landed.mean - carried) < 1.5, `landed at ${landed.mean.toFixed(1)}, carried to ${carried.toFixed(1)}`);
  assert.ok(landed.sd < start.sd + 2.5, `spread from ${start.sd.toFixed(2)} to ${landed.sd.toFixed(2)} px`);
});

// Seed 1607503078 is a known case from the old random-seed runs: its smooth field has unusually
// high contrast, so raw neighbor change fell from smooth to middle (195.6 > 188.0) although
// the field got finer. fractal() normalizes by the octaves' total weight, so adding octaves
// lowers overall contrast (sd about 0.20 → 0.11 → 0.09); about 8% of seeds did the same. Fine
// detail is therefore measured relative to the field's own spread, which rises on every seed.
test("texture runs from smooth to ragged: more fine detail in humidity as it rises", () => {
  for (const seed of [...seeds(8), 1607503078]) {
    const detail = texture => {
      const simulation = createWeather({ seed });
      sampleFields(simulation, { texture });
      const values = simulation.humidity, mean = sum(values) / values.length;
      const spread = Math.sqrt(sum(values.map(value => (value - mean) ** 2)) / values.length);
      // Mean neighbor-to-neighbor change (fine detail) per unit of overall spread.
      let change = 0, pairs = 0;
      for (let i = 1; i < values.length; i++) if (i % simulation.width) { change += Math.abs(values[i] - values[i - 1]); pairs++; }
      return change / pairs / spread;
    };
    const smooth = detail(0), middle = detail(defaults.texture), ragged = detail(1);
    assert.ok(smooth < middle && middle < ragged, `seed ${seed}: ${smooth.toFixed(3)} < ${middle.toFixed(3)} < ${ragged.toFixed(3)}`);
    assert.ok(ragged > 2 * smooth, `seed ${seed}: ragged ${ragged.toFixed(3)} vs smooth ${smooth.toFixed(3)}`);
  }
  assert.deepEqual(textureShape(0), { octaves: 1, roughness: 0.3 });
  assert.ok(Math.abs(textureShape(1).octaves - 6) < 1e-12 && Math.abs(textureShape(1).roughness - 0.75) < 1e-12);
});

// A pixel is part of a streak only where rain is falling: rain in its column (or the one it
// widens into) within a row of it.
function streakInDryAir(simulation, alpha) {
  const { width, height, rain } = simulation;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] === 0) continue;
    let wet = false;
    for (let r = Math.max(0, y - 1); r <= Math.min(height - 1, y + 1); r++) for (const c of [x, (x + width - 1) % width]) if (rain[r * width + c] > 0) wet = true;
    if (!wet) return `(${x}, ${y})`;
  }
  return null;
}

test("rain is made only in dense cloud water, and streaks are drawn only in falling rain", () => {
  for (const seed of seeds(2)) {
    const simulation = createWeather({ seed }), layer = createRainLayer(seed);
    let made = 0, drawn = 0;
    for (let k = 0; k < 600; k++) {
      step(simulation);
      // Charge everything so every pixel would rain if it could: only cloud does.
      const charged = { ...simulation, charge: simulation.charge.map(() => 1), cloud: simulation.cloud.slice(), rain: simulation.rain.slice() };
      formRain(charged).forEach((amount, i) => {
        if (amount > 0) { made++; assert.ok(simulation.cloud[i] >= RULES.denseWater, `rain made at thin pixel ${i} (${simulation.cloud[i]})`); }
      });
      if (k % 20 === 0) {
        const alpha = rainAlpha(layer, simulation);
        drawn += alpha.filter(value => value > 0).length;
        assert.equal(streakInDryAir(simulation, alpha), null, `seed ${seed} tick ${k}: streak pixel with no rain around it`);
      }
    }
    assert.ok(made > 0 && drawn > 0, `seed ${seed} rains (${made} pixels) and draws streaks (${drawn})`);
  }
});

// A wide, evenly raining cloud, so any unevenness comes from the streaks themselves.
function downpour(width, height, seed, options) {
  const simulation = createWeather({ width, height, seed });
  sampleFields(simulation, options); startCloud(simulation);
  for (let y = 5; y < 10; y++) for (let x = 0; x < width; x++) { simulation.cloud[y * width + x] = 1; simulation.charge[y * width + x] = 1; }
  for (let y = 9; y < height; y++) for (let x = 0; x < width; x++) simulation.rain[y * width + x] = 0.2;
  return simulation;
}

// One lane of one plane, drawn over rain heavy everywhere, so the picture is a single streak.
function lone(plane, seed, wind, fall) {
  const simulation = createWeather({ width: 128, height: 96, seed });
  simulation.rain.fill(0.05); simulation.rainLean = rainLean(wind, fall);
  const layer = { seed, clump: () => 0.6 }, planes = STREAK.planes.map((p, k) => ({ ...p, lanes: k === plane ? 1 : 0 }));
  return { simulation, layer, planes, wind, fall,
    // The picture `frames / perTick` ticks after the start: the state moves on only at ticks, as
    // it does in the app, and `phase` says how far into the next tick the frame is.
    draw(frames, perTick) {
      const ticks = Math.floor(frames / perTick), phase = (frames % perTick) / perTick;
      simulation.tick = ticks; simulation.scroll = wind * ticks; simulation.fallClock = fall * ticks;
      return rainAlpha(layer, simulation, { phase, fall, wind, planes });
    } };
}
const centreOf = alpha => { let mass = 0, row = 0; for (let i = 0; i < alpha.length; i++) { mass += alpha[i]; row += alpha[i] * Math.floor(i / 128); } return { mass, row: mass ? row / mass : NaN }; };

test("a streak falls the same distance on every frame, however slow, at 3 frames to a tick or an uneven 2, 4", () => {
  const seed = 1; // an isolated streak must be one the rain lets show; hashes are fixed, so this one always does
  for (const [plane, fall] of [[0, 0.25], [1, 0.25], [1, 0.1], [2, 0.5]]) {
    const scene = lone(plane, seed, 0, fall);
    for (const cadence of [[3], [2, 4]]) {
      // Frame k's place in time: every `cadence` pattern step is one tick, frames in between get phases.
      let frames = [], ticks = 0;
      for (let tick = 0; tick < 300; tick++) { const per = cadence[tick % cadence.length]; for (let f = 0; f < per; f++) frames.push(tick + f / per); }
      const rows = frames.map(time => {
        scene.simulation.tick = Math.floor(time); scene.simulation.scroll = 0; scene.simulation.fallClock = fall * Math.floor(time);
        return centreOf(rainAlpha(scene.layer, scene.simulation, { phase: time % 1, fall, planes: scene.planes }));
      });
      const inside = k => rows[k].mass > 0 && rows[k].row > 26 && rows[k].row < 68, moves = [];
      for (let k = 1; k < rows.length; k++) if (inside(k) && inside(k - 1)) moves.push({ index: k, dt: frames[k] - frames[k - 1], rows: rows[k].row - rows[k - 1].row });
      assert.ok(moves.length > 40, `plane ${plane}: ${moves.length} steps`);
      // Steady: a frame's fall is the last frame's speed times the time since then, to within a
      // tenth of a row (the old drawing hopped 0, 1 or 2 rows, a whole row off).
      let worst = 0;
      for (let k = 1; k < moves.length; k++) if (moves[k].index === moves[k - 1].index + 1)
        worst = Math.max(worst, Math.abs(moves[k].rows - moves[k - 1].rows / moves[k - 1].dt * moves[k].dt));
      assert.ok(worst < 0.1, `plane ${plane}, fall ${fall}, cadence ${cadence}: a frame off by up to ${worst.toFixed(3)} rows`);
    }
  }
});

test("a streak does not wobble: its rows keep their columns while it falls and the wind carries it", () => {
  const seed = 1;
  for (const wind of [0.4, -0.4, 0.15]) for (const plane of [0, 1, 2]) {
    const scene = lone(plane, seed, wind, 0.25), columns = alpha => { const at = new Array(96).fill(null); for (let y = 0; y < 96; y++) { let best = 0; for (let x = 0; x < 128; x++) if (alpha[y * 128 + x] > best) { best = alpha[y * 128 + x]; at[y] = x; } } return at; };
    let previous = null, worst = 0, compared = 0;
    for (let frame = 0; frame < 240; frame++) {
      const now = columns(scene.draw(frame, 3));
      if (previous) {
        // How each row moved sideways since the last frame, less the hop the whole streak made.
        const moves = [];
        for (let y = 0; y < 96; y++) if (now[y] !== null && previous[y] !== null) moves.push(((now[y] - previous[y] + 192) % 128) - 64);
        if (moves.length >= 3) { const middle = moves.slice().sort((a, b) => a - b)[moves.length >> 1]; worst = Math.max(worst, ...moves.map(m => Math.abs(m - middle))); compared++; }
      }
      previous = now;
    }
    assert.ok(compared > 50 && worst === 0, `wind ${wind}, plane ${plane}: a row moved ${worst} columns against the rest`);
  }
});

test("a frame part-way into a tick is the picture that fraction of a tick later", () => {
  const seed = seeds(1)[0], options = { cloudiness: -1, wind: 0, fallSpeed: 0.3 }, simulation = downpour(96, 60, seed, options), layer = createRainLayer(seed);
  const ahead = JSON.parse(JSON.stringify(simulation)); ahead.fallClock = simulation.fallClock + 0.3 * 0.5;
  assert.deepEqual(rainAlpha(layer, simulation, { phase: 0.5, fall: 0.3 }), rainAlpha(layer, { ...simulation, fallClock: ahead.fallClock, tick: simulation.tick + 0.5 }));
  assert.deepEqual(rainAlpha(layer, simulation, { phase: 0, fall: 0.3 }), rainAlpha(layer, simulation), "phase 0 draws the tick itself");
});

test("rain streaks follow the falling rain, from the cloud base to the floor, and vanish once the rain has passed", () => {
  const seed = seeds(1)[0], options = { cloudiness: -1, wind: 0.2, fallSpeed: 0.25 };
  const simulation = createWeather({ width: 48, height: 40, seed }), layer = createRainLayer(seed);
  sampleFields(simulation, options); startCloud(simulation);
  // No rain: no streaks, however long they fall, even under dense, charged cloud.
  for (let y = 6; y < 10; y++) for (let x = 20; x < 24; x++) { simulation.cloud[y * 48 + x] = 1; simulation.charge[y * 48 + x] = 1; }
  for (let k = 0; k < 100; k++) { simulation.fallClock = k * 0.5; assert.ok(rainAlpha(layer, simulation, options).every(value => value === 0), "no rain, no streaks"); }
  // A shaft of rain from the cloud to the floor: streaks fill it, all the way down, and only it.
  for (let y = 9; y < 40; y++) for (let x = 20; x < 24; x++) simulation.rain[y * 48 + x] = 0.05;
  const rows = new Set(), columns = new Set();
  for (let k = 0; k < 200; k++) {
    simulation.fallClock = k * 0.5;
    const alpha = rainAlpha(layer, simulation, options);
    alpha.forEach((value, i) => { if (value > 0) { rows.add(Math.floor(i / 48)); columns.add(i % 48); } });
  }
  assert.ok(rows.size > 20, `${rows.size} rows have streaks`);
  assert.ok(Math.min(...rows) <= 12 && Math.max(...rows) >= 37, `streaks from row ${Math.min(...rows)} to ${Math.max(...rows)}: cloud base to floor`);
  assert.ok(Math.min(...columns) >= 20 && Math.max(...columns) <= 24, `only in the shaft, columns ${[...columns].sort((a, b) => a - b).join(",")}`);
  // The rain has passed (fallen out): the streaks are gone at once.
  simulation.rain.fill(0);
  assert.ok(rainAlpha(layer, simulation, options).every(value => value === 0));
});

// How far a picture leans, in columns per row: compare each row with the one four rows down,
// find how far sideways the lit pixels line up best, and divide by four. 0 is straight down.
function leanOf(values, width, height) {
  const gap = 4, reach = 8, overlap = new Array(2 * reach + 1).fill(0);
  for (let y = 0; y < height - gap; y++) for (let x = 0; x < width; x++) {
    if (!(values[y * width + x] > 0)) continue;
    for (let d = -reach; d <= reach; d++) if (values[(y + gap) * width + (x + d + width) % width] > 0) overlap[d + reach]++;
  }
  const best = Math.max(...overlap);
  return best ? (overlap.indexOf(best) - reach) / gap : 0;
}

test("rain streaks lean exactly as the rain region does, at every wind", () => {
  const seed = seeds(1)[0], layer = createRainLayer(seed), width = 128, height = 96;
  for (const wind of [-0.5, -0.25, 0, 0.1, 0.25, 0.5]) {
    // A cloud kept fed where the wind has carried it, raining steadily: the region it rains in.
    const options = { cloudiness: -1, wind, fallSpeed: 0.25 }, simulation = createWeather({ width, height, seed });
    sampleFields(simulation, options); startCloud(simulation);
    for (let k = 0; k < 200; k++) {
      for (let y = 20; y < 26; y++) for (let x = 0; x < width; x++) { const c = (x - simulation.shifted + 2 * width) % width; if (c >= 50 && c < 70) { simulation.cloud[y * width + x] = 1; simulation.charge[y * width + x] = 1; } }
      step(simulation, options);
    }
    // The region's lean in columns per row: how the rain, row by row, sits against its cloud.
    const centre = (60 + simulation.shifted) % width, rows = [], offsets = [];
    for (let y = 30; y <= 46; y += 4) {
      let sumX = 0, sumRain = 0;
      for (let x = 0; x < width; x++) { const d = ((x - centre + 1.5 * width) % width) - width / 2; sumX += d * simulation.rain[y * width + x]; sumRain += simulation.rain[y * width + x]; }
      assert.ok(sumRain > 0, `wind ${wind}: rain at row ${y}`);
      rows.push(y); offsets.push(sumX / sumRain);
    }
    const regionLean = (offsets.at(-1) - offsets[0]) / (rows.at(-1) - rows[0]);
    // Trailing behind the cloud: rain further down sits further against the wind.
    const expected = -rainLean(wind, 0.25);
    assert.ok(Math.abs(regionLean - expected) < 0.2, `wind ${wind}: region leans ${regionLean.toFixed(3)} columns per row, expected ${expected.toFixed(3)}`);
    // The streaks' lean, over many frames.
    let streakLean = 0, frames = 0;
    for (let k = 0; k < 30; k++) { simulation.fallClock = k * 1.3; const lean = leanOf(rainAlpha(layer, simulation), width, height); streakLean += lean; frames++; }
    streakLean /= frames;
    assert.ok(Math.abs(streakLean - regionLean) < 0.2, `wind ${wind}: streaks lean ${streakLean.toFixed(3)}, region ${regionLean.toFixed(3)} columns per row`);
    if (Math.abs(wind) >= 0.1) assert.ok(Math.sign(streakLean) === Math.sign(regionLean) && Math.abs(streakLean) > 0.25, `wind ${wind}: the lean is not flat (${streakLean.toFixed(3)})`);
  }
});

test("rain streaks fall, carried by the wind", () => {
  const seed = seeds(1)[0], layer = createRainLayer(seed);
  const alphaAt = (simulation, options, clock, scroll = simulation.scroll) => { simulation.fallClock = clock; simulation.scroll = scroll; return rainAlpha(layer, simulation, options); };
  // Streaks fall: advancing the fall clock moves the picture down, never up.
  const options = { cloudiness: -1, wind: 0, fallSpeed: 0.25 }, simulation = downpour(96, 60, seed, options);
  const before = alphaAt(simulation, options, 40), after = alphaAt(simulation, options, 40.5);
  const overlap = dy => { let total = 0; for (let y = 0; y < 60; y++) for (let x = 0; x < 96; x++) if (y + dy >= 0 && y + dy < 60) total += before[y * 96 + x] * after[(y + dy) * 96 + x]; return total; };
  const down = sum([1, 2, 3, 4].map(overlap)), up = sum([-1, -2, -3, -4].map(overlap));
  assert.ok(down > 1.25 * up, `fall clock +0.5 moves streaks down: ${down.toFixed(1)} vs up ${up.toFixed(1)}`);
  // The wind carries the streaks sideways with the air: 8 px of scroll (two dither cells) shifts
  // the picture exactly 8 px.
  const wind = { ...options, wind: 0.2 }, carried = downpour(96, 60, seed, wind);
  const start = alphaAt(carried, wind, 40, 0), moved = alphaAt(carried, wind, 40, 8);
  assert.ok(start.some(value => value > 0));
  assert.ok(start.every((value, i) => value === moved[Math.floor(i / 96) * 96 + (i % 96 + 8) % 96]), "scrolled picture is the same picture, shifted");
});

test("rain streaks vary: short and long, uneven spacing, crisp pixels, always faint", () => {
  const seed = seeds(1)[0], options = { cloudiness: -1, wind: 0 };
  const simulation = downpour(96, 60, seed, options), layer = createRainLayer(seed);
  const runs = [], strips = new Array(12).fill(0), levels = new Set();
  for (let k = 0; k < 40; k++) {
    simulation.fallClock = k * 1.7; simulation.tick = k * 17;
    const alpha = rainAlpha(layer, simulation, options);
    for (let x = 0; x < 96; x++) {
      let run = 0;
      for (let y = 0; y <= 60; y++) {
        const value = y < 60 ? alpha[y * 96 + x] : 0;
        if (value > 0) { run++; levels.add(value); if (value > 0.04) strips[Math.floor(x / 8)]++; } else if (run) { runs.push(run); run = 0; }
      }
    }
  }
  runs.sort((a, b) => a - b);
  assert.ok(runs.length > 300, `${runs.length} streak runs`);
  assert.ok(runs[0] <= 2 && runs.at(-1) >= 12, `runs from ${runs[0]} to ${runs.at(-1)} px`);
  assert.ok(runs[runs.length >> 1] < sum(runs) / runs.length, "heavy tail: mean above median");
  const strongest = [...levels].reduce((a, b) => Math.max(a, b), 0);
  assert.ok(strongest <= 0.4 + 1e-6, `streaks are faint: highest ${strongest.toFixed(2)}`);
  const stripMean = sum(strips) / 12, spread = Math.sqrt(sum(strips.map(c => (c - stripMean) ** 2)) / 12);
  assert.ok(spread / stripMean > 0.05, `clumped: strip counts ${strips.join(",")}`);
  // Heavier rain draws more of them.
  const heavy = downpour(96, 60, seed, options), light = downpour(96, 60, seed, options);
  light.rain = light.rain.map(value => value * 0.025);
  const count = state => { let total = 0; for (let k = 0; k < 10; k++) { state.fallClock = k * 3; total += rainAlpha(layer, state, options).filter(value => value > 0.02).length; } return total; };
  assert.ok(count(heavy) > 3 * count(light), "heavy rain shows more streaks than thin rain");
});

test("rain streaks are a pure function of the seed and state: a fresh layer on restored state draws the same", () => {
  for (const seed of seeds(2)) {
    const simulation = createWeather({ seed }), layer = createRainLayer(seed);
    for (let k = 0; k < 300; k++) step(simulation);
    assert.ok(simulation.rain.some(value => value > 0) && simulation.fallClock > 0);
    const kept = renderWeather(simulation, "sunset", defaults, layer);
    // The layer holds nothing but the seed, so there is nothing about the streaks to save.
    assert.deepEqual(JSON.parse(JSON.stringify(layer)), { seed });
    // A layer made now, on a simulation saved to JSON and restored, draws the very same pixels.
    const restored = JSON.parse(JSON.stringify(simulation)), fresh = createRainLayer(seed);
    assert.deepEqual(renderWeather(restored, "sunset", defaults, fresh), kept, `seed ${seed}`);
    assert.deepEqual(rainAlpha(fresh, restored), rainAlpha(layer, simulation));
    // And both continue the same way.
    for (let k = 0; k < 100; k++) { step(simulation); step(restored); }
    assert.deepEqual(renderWeather(restored, "sunset", defaults, fresh), renderWeather(simulation, "sunset", defaults, layer), `seed ${seed} after 100 more ticks`);
    // Drawing again changes nothing: it advances no clock and draws no random numbers.
    const again = rainAlpha(layer, simulation);
    assert.deepEqual(rainAlpha(layer, simulation), again);
    // Another seed draws other streaks.
    assert.notDeepEqual(rainAlpha(createRainLayer(seed + 1), simulation), again);
  }
});

test("the fall clock adds fallSpeed each tick, and hash is stable, uniform and sensitive to every input", () => {
  const simulation = createWeather({ seed: seeds(1)[0] });
  step(simulation, { fallSpeed: 0.25 }); step(simulation, { fallSpeed: 0.5 });
  assert.ok(Math.abs(simulation.fallClock - 0.75) < 1e-12);
  assert.equal(hash(1, 2, 3), hash(1, 2, 3));
  assert.notEqual(hash(1, 2, 3), hash(1, 2, 4)); assert.notEqual(hash(1, 2, 3), hash(3, 2, 1)); assert.notEqual(hash(1, 2), hash(1, 2, 0));
  const values = Array.from({ length: 20000 }, (_, k) => hash(7, k >> 7, k & 127));
  assert.ok(values.every(value => value >= 0 && value < 1));
  const mean = sum(values) / values.length, bins = new Array(10).fill(0);
  for (const value of values) bins[Math.floor(value * 10)]++;
  assert.ok(Math.abs(mean - 0.5) < 0.01 && bins.every(count => Math.abs(count - 2000) < 200), `mean ${mean.toFixed(3)}, bins ${bins.join(",")}`);
});

test("cloud water forms fast, fades slowly (slower with persistence) and drifts with the wind", () => {
  const simulation = createWeather({ width: 8, height: 4, seed: 1 });
  const ticksTo = (from, potential, persistence, done) => {
    simulation.cloud.fill(from); simulation.potential.fill(potential);
    let ticks = 0;
    while (!done(simulation.cloud[0]) && ticks < 10000) { condense(simulation, { persistence }); ticks++; }
    return ticks;
  };
  for (const persistence of [0, 0.5, defaults.persistence, 1.5]) {
    const form = ticksTo(0, 1, persistence, c => c >= 0.9), fade = ticksTo(1, 0, persistence, c => c <= 0.1);
    assert.ok(form <= 8, `forms in ${form} ticks`);
    assert.ok(fade > 2 * form, `persistence ${persistence}: fades in ${fade} ticks vs forms in ${form}`);
  }
  assert.ok(ticksTo(1, 0, 1, c => c <= 0.1) > 5 * ticksTo(1, 0, 0, c => c <= 0.1), "persistence slows fading");
  // The slider's range, 0.5 to 1.5, sits above the old 0 to 1: its middle is the old top.
  assert.ok(dissipation(0.5) > dissipation(defaults.persistence) && dissipation(defaults.persistence) > dissipation(1.5));
  assert.equal(defaults.persistence, 1);
  assert.ok(dissipation(1.5) < dissipation(1) / 5, "the new top lingers much longer than the old one");
  // In a full run, a cloud that has lost its forcing outlives it: some pixels are still
  // cloudy with no forcing, and stored cloud follows the wind with the noise.
  for (const seed of seeds(2)) {
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
  const calm = createWeather({ width: 32, height: 24, seed: seeds(1)[0] }), before = calm.cloud.slice();
  for (let k = 0; k < 20; k++) step(calm, { wind: 0, changeSpeed: 0, rainAmount: 0 });
  calm.cloud.forEach((cloud, i) => assert.ok(cloud >= before[i] - 1e-9 || cloud >= calm.potential[i]));
  // Wind: an isolated, unforced cloud moves 10 px right over 100 ticks at wind 0.1.
  const carried = createWeather({ width: 40, height: 10, seed: 1 }), options = { cloudiness: -1, wind: 0.1, persistence: 1, rainAmount: 0 };
  sampleFields(carried, options); startCloud(carried);
  // (A 5×5 block, since a lone pixel is all edge and erodes away.)
  for (let y = 3; y < 8; y++) for (let x = 8; x < 13; x++) carried.cloud[y * 40 + x] = 1;
  for (let k = 0; k < 100; k++) step(carried, options);
  assert.ok(carried.cloud[5 * 40 + 20] > 0.8 && carried.cloud[5 * 40 + 10] === 0);
});

test("clouds fade from the edges in: edge pixels evaporate before the interior", () => {
  // Uniform cloud has no edges, a lone pixel is all edge, a straight edge is in between.
  const width = 20, height = 12;
  const field = new Float32Array(width * height).fill(1);
  assert.ok(exposure(field, width, height).every(e => Math.abs(e) < 1e-9), "full cover: no edges (sides wrap, lid and floor are not edges)");
  field.fill(0); field[5 * width + 5] = 1;
  assert.ok(Math.abs(exposure(field, width, height)[5 * width + 5] - 1) < 1e-9);
  // A 10×6 block losing its forcing: its rim thins long before its core, the core is still
  // dense when the rim is gone, and the cloud shrinks rather than fading evenly.
  for (const persistence of [0, defaults.persistence, 1.5]) {
    const simulation = createWeather({ width: 30, height: 16, seed: 1 }), at = (x, y) => simulation.cloud[y * 30 + x];
    for (let y = 5; y < 11; y++) for (let x = 10; x < 20; x++) simulation.cloud[y * 30 + x] = 1;
    simulation.potential.fill(0);
    let rimGone = -1, coreAtRimGone = 0;
    for (let k = 0; k < 20000 && rimGone < 0; k++) {
      condense(simulation, { persistence });
      if (at(10, 5) === 0) { rimGone = k; coreAtRimGone = at(15, 8); }
    }
    assert.ok(rimGone > 0, `persistence ${persistence}: the corner evaporates`);
    assert.ok(coreAtRimGone > 0.6, `persistence ${persistence}: core still dense (${coreAtRimGone.toFixed(2)}) when the corner is gone`);
  }
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
  // Full runs: every pixel that makes rain is still dense cloud afterwards.
  for (const seed of seeds(2)) {
    const run = createWeather({ seed });
    let made = 0;
    for (let k = 0; k < 600; k++) {
      step(run);
      for (let i = 0; i < run.cloud.length; i++) if (run.made[i] > 0) {
        made++;
        assert.ok(run.cloud[i] >= RULES.denseWater - 2 * RULES.rainDrain * defaults.rainAmount, `seed ${seed}: raining pixel thinned to ${run.cloud[i]}`);
      }
    }
    assert.ok(made > 0, `seed ${seed} rains`);
  }
});

test("the weather never stops moving and keeps raining", () => {
  for (const seed of seeds(2)) {
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
  const seed = seeds(1)[0], simulation = createWeather({ seed }), layer = createRainLayer(seed);
  for (let k = 0; k < 50; k++) step(simulation);
  for (const view of ["sunset", "water", "relative", "humidity", "temperature", "pressure"]) {
    const pixels = renderWeather(simulation, view, defaults, layer);
    assert.equal(pixels.length, 128 * 96 * 4);
    for (let p = 3; p < pixels.length; p += 4) assert.equal(pixels[p], 255);
  }
});

test("the curtain follows the rain: from inside the cloud down to the floor, with no gap or fade", () => {
  const width = 48, height = 40, simulation = createWeather({ width, height, seed: seeds(1)[0] });
  const options = { cloudiness: -1, wind: 0, fallSpeed: 0.25, persistence: 1.5 };
  sampleFields(simulation, options); startCloud(simulation);
  // A dense, charged cloud (rows 6-11), kept full as if the noise still fed it.
  const feed = () => { for (let y = 6; y < 12; y++) for (let x = 14; x < 30; x++) { simulation.cloud[y * width + x] = 1; simulation.charge[y * width + x] = 1; } };
  const column = y => curtainAlpha(null, simulation)[y * width + 22];
  for (let k = 0; k < 200; k++) { feed(); step(simulation, options); }
  // Raining: visible inside the cloud above the base, across it and all the way to the floor,
  // with no empty row and no fade toward the foot.
  assert.equal(cloudBases(simulation)[22], 11);
  assert.ok(column(9) > 0 && column(11) > 0.2);
  for (let y = 9; y < height; y++) assert.ok(column(y) > 0, `curtain row ${y} not empty`);
  assert.ok(column(height - 1) >= 0.8 * column(20), `no fade at the foot (${column(height - 1).toFixed(2)} vs ${column(20).toFixed(2)})`);
  // Once the cloud stops raining the curtain's top lets go and falls; once the rain has left
  // the floor there is no curtain.
  for (let k = 0; k < 2000 && simulation.made.some(v => v > 0); k++) step(simulation, options);
  for (let k = 0; k < 400; k++) step(simulation, options);
  assert.ok(curtainAlpha(null, simulation).every(a => a < 0.01));
});
