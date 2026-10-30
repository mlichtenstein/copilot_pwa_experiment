/*
 * Purpose: Browser-independent noise-weather experiment: humidity, temperature and pressure
 *   are slices of seeded 3D gradient noise moving through time and scrolling with one global
 *   wind; the noise only forces the weather: where relative humidity, weighted by a
 *   cloud-layer band of height, crosses a threshold, stored cloud water condenses fast, and
 *   it evaporates slowly, from the edges in, once the forcing is gone; dense, lasting cloud
 *   water turns into real rain (draining the cloud) that falls slowly, drifts with the wind,
 *   spreads sideways only a little and never evaporates in the air, so every shaft reaches
 *   the floor and collects; plus the views and the display-only rain curtains and streaks
 *   drawn from that rain.
 * Consumers: noise.js and noise-model.test.js.
 * Dependencies: none; values are dimensionless experimental units, not a weather model.
 */

// The noise fields. Their amplitude and bias are fixed; feature size and change speed are
// shared sliders, scaled per field so they do not line up. Humidity's and temperature's
// octaves and roughness come from the `texture` slider (see textureShape).
export const FIELDS = ["humidity", "temperature", "pressure"];
const FIELD_SHAPE = {
  // relative size, relative change speed, octaves, roughness, amplitude, bias (humidity's
  // bias is the `cloudiness` slider)
  humidity: { size: 1, speed: 1, textured: true, amplitude: 0.35 },
  temperature: { size: 1.5, speed: 0.5, textured: true, amplitude: 0.12, bias: 0.75 },
  pressure: { size: 2, speed: 0.4, octaves: 2, roughness: 0.5, amplitude: 1, bias: 0 }
};

// The sliders. Everything else is fixed below.
export const defaults = {
  // Sky: mean humidity, size of cloud features in pixels, how fast the fields change, and
  // the one global wind in pixels per tick (sign = direction, positive blows right).
  cloudiness: 0.45, featureSize: 32, changeSpeed: 0.012, wind: 0.1,
  // Texture: 0 smooth blobs, 1 ragged, grainy edges (see textureShape).
  texture: 0.65,
  // Cloud layer: clouds form only in a band of height (altitude 0 floor, 1 lid) centred on
  // `layerHeight`, `layerThickness` across. `layerAsymmetry` > 0 puts more of the band above
  // the centre (a sharper bottom). Its edge shape is fixed (RULES.layerSharpness).
  layerHeight: 0.45, layerThickness: 0.3, layerAsymmetry: 0.35,
  // Persistence (slider 0.5 to 1.5): 0.5 = cloud fades within several seconds of the noise
  // moving on, 1 = it lingers for tens of seconds, 1.5 = about a minute (see dissipation).
  persistence: 1,
  // Rain: rain made per tick by charged cloud (× density), and fall speed in pixels per tick.
  rainAmount: 0.003, fallSpeed: 0.25
};

// Fixed rules.
export const RULES = {
  pressureLift: 0.3, cloudThreshold: 1, cloudGain: 8,
  // Cloud-layer band exponent: below 2 (a Gaussian), so the band fades softly with no flat
  // top or crisp edge. Fixed; it used to be a slider.
  layerSharpness: 1.5,
  // Cloud water closes 30% of the gap to the forcing's potential per tick when the potential
  // is higher (fast condensation); when it is lower it evaporates slowly, from the edges in:
  // `dissipation(persistence) × (edgeInterior + edgeGain × exposure)` per tick, where
  // exposure is how much cloud its 8 neighbors lack (0 deep inside, about 0.4 on a straight
  // edge, 1 alone). Interior cloud barely thins until the edge eats in to it.
  condensation: 0.3, edgeInterior: 0.05, edgeGain: 10,
  // Rain needs dense cloud water (≥ denseWater) that has stayed dense: charge builds by
  // `charge` per tick there and falls 10% per tick elsewhere; at `rainThreshold` it rains.
  // Each unit of rain made takes `rainDrain` units of cloud water, so a cloud cut off from
  // its forcing rains itself back below denseWater and stops, while the cloud remains.
  denseWater: 0.8, charge: 0.012, discharge: 0.1, rainThreshold: 0.6, rainDrain: 2,
  // Rain never dries in the air: it falls until it leaves the floor. Each tick it spreads
  // sideways by `rainSpread` to each neighbor (a shaft widens by about 1.5 px over the
  // whole fall at the default speed). Puddles on the floor dry at `puddleEvaporation`.
  rainSpread: 0.003, puddleEvaporation: 0.002
};

// Texture → fractal shape: octaves 1 to 6 (fractional, so the slider is smooth) and
// roughness 0.3 to 0.75. The default 0.65 gives about 4.25 octaves at roughness 0.59.
export function textureShape(texture = defaults.texture) {
  const t = Math.max(0, Math.min(1, texture));
  return { octaves: 1 + 5 * t, roughness: 0.3 + 0.45 * t };
}

// Cloud water lost per tick where the forcing has gone: persistence 0 → 0.04 (a full cloud
// gone in about 25 ticks), 0.5 → 0.0071, 1 (default) → 0.0013 (about 800 ticks), 1.5 →
// 0.00022. The slider covers 0.5 to 1.5; values from 0 to 2 are accepted.
export function dissipation(persistence = defaults.persistence) {
  return 0.04 * Math.pow(10, -1.5 * Math.max(0, Math.min(2, persistence)));
}

// Fixed slope of the capacity curve, as in the convection study: cold air holds
// about e^-3 ≈ 5% of what hot air holds.
export const SATURATION_SLOPE = 3;
export function saturation(temperature, pressure = 0, pressureLift = RULES.pressureLift) {
  return Math.exp(SATURATION_SLOPE * (temperature - 1)) * Math.max(0.05, 1 + pressureLift * pressure);
}

// Cloud-layer band: 1 at `layerHeight`, falling to 0 above and below. Half-widths are
// thickness/2 × (1 ± asymmetry) above/below; shape exp(−|distance / halfWidth|^1.5), a soft
// fade (RULES.layerSharpness; any layerSharpness in old saved settings is ignored).
export function layerBand(altitude, rules = defaults) {
  const asymmetry = Math.max(-0.95, Math.min(0.95, rules.layerAsymmetry));
  const half = Math.max(0.005, rules.layerThickness / 2);
  const offset = altitude - rules.layerHeight;
  const width = offset >= 0 ? half * (1 + asymmetry) : half * (1 - asymmetry);
  return Math.exp(-Math.pow(Math.abs(offset) / width, RULES.layerSharpness));
}

// ---- Seeded 3D Perlin gradient noise -------------------------------------------------
function lcg(seed) {
  let state = seed >>> 0;
  return () => (state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296;
}
const GRADIENTS = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
  [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

// Returns noise(x, y, z) in about [-1, 1], smooth in all three inputs and the same for
// the same seed. z is time here.
export function createNoise3(seed) {
  const random = lcg(seed);
  const order = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = order[i & 255];
  const dot = (hash, x, y, z) => { const g = GRADIENTS[hash % 12]; return g[0] * x + g[1] * y + g[2] * z; };
  return (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const xf = x - X, yf = y - Y, zf = z - Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const a = perm[xi] + yi, aa = perm[a] + zi, ab = perm[a + 1] + zi;
    const b = perm[xi + 1] + yi, ba = perm[b] + zi, bb = perm[b + 1] + zi;
    return lerp(
      lerp(lerp(dot(perm[aa], xf, yf, zf), dot(perm[ba], xf - 1, yf, zf), u),
        lerp(dot(perm[ab], xf, yf - 1, zf), dot(perm[bb], xf - 1, yf - 1, zf), u), v),
      lerp(lerp(dot(perm[aa + 1], xf, yf, zf - 1), dot(perm[ba + 1], xf - 1, yf, zf - 1), u),
        lerp(dot(perm[ab + 1], xf, yf - 1, zf - 1), dot(perm[bb + 1], xf - 1, yf - 1, zf - 1), u), v), w);
  };
}

// Fractal sum of octaves, each twice as fine and `roughness` times as strong, normalized
// so the result stays in about [-1, 1] for any octave count. A fractional octave count
// fades the last octave in, so texture changes smoothly.
export function fractal(noise, x, y, z, octaves = 1, roughness = 0.5) {
  const count = Math.max(1, octaves);
  let sum = 0, weight = 1, total = 0, frequency = 1;
  for (let octave = 0; octave < Math.ceil(count); octave++) {
    const share = Math.min(1, count - octave);
    sum += share * weight * noise(x * frequency, y * frequency, z * frequency + 17.3 * octave);
    total += share * weight; weight *= roughness; frequency *= 2;
  }
  return sum / total;
}

// Noise functions are rebuilt from the seed, so simulation state stays plain JSON.
const noiseCache = new Map();
function noisesFor(seed) {
  if (!noiseCache.has(seed)) {
    const random = lcg(seed);
    noiseCache.set(seed, Object.fromEntries(FIELDS.map(name => [name, createNoise3(Math.floor(random() * 4294967296))])));
    if (noiseCache.size > 8) noiseCache.delete(noiseCache.keys().next().value);
  }
  return noiseCache.get(seed);
}

export function createWeather({ width = 128, height = 96, seed = 1 } = {}) {
  const size = width * height;
  const zeros = () => new Array(size).fill(0);
  const simulation = { width, height, seed: seed >>> 0, tick: 0,
    humidity: zeros(), temperature: zeros(), pressure: zeros(),
    // potential: the cloud the noise forces this tick; cloud: the stored cloud water.
    relative: zeros(), potential: zeros(), cloud: zeros(), charge: zeros(), rain: zeros(), made: zeros(),
    // rained = rain in the air + fallen (left the floor, all time); fallen = puddles + evaporated.
    puddle: new Array(width).fill(0), rained: 0, fallen: 0, evaporated: 0,
    // Accumulated wind scroll and field time, so slider changes never jump the view;
    // `shifted` is how many whole pixels the stored cloud fields have been carried.
    scroll: 0, shifted: 0, time: 0, band: new Array(height).fill(1) };
  sampleFields(simulation, defaults);
  startCloud(simulation);
  return simulation;
}

// Start (or restart) with cloud water equal to the current potential, so a run opens on a
// sky that already has its clouds.
export function startCloud(simulation) {
  for (let i = 0; i < simulation.cloud.length; i++) simulation.cloud[i] = simulation.potential[i];
  return simulation;
}

export const altitudeOf = (i, width, height) => 1 - Math.floor(i / width) / (height - 1);

// Fill the fields, relative humidity and cloud potential for the current state (stored
// cloud water only changes in step). Each field is a 2D
// slice at the current time through its own 3D noise, shifted right by the wind scroll.
export function sampleFields(simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height, scroll, time } = simulation;
  const noises = noisesFor(simulation.seed), textured = textureShape(rules.texture);
  for (const name of FIELDS) {
    const shape = FIELD_SHAPE[name], scale = Math.max(2, rules.featureSize * shape.size);
    // Temperature gets one octave less than humidity, so its grain does not dominate.
    const octaves = shape.textured ? Math.max(1, textured.octaves - (name === "humidity" ? 0 : 1)) : shape.octaves;
    const roughness = shape.textured ? textured.roughness : shape.roughness;
    const bias = name === "humidity" ? rules.cloudiness : shape.bias, z = time * shape.speed;
    const values = simulation[name], noise = noises[name];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      // Raw Perlin rarely leaves ±0.5, so double it to use the full amplitude.
      values[y * width + x] = bias + shape.amplitude * 2 * fractal(noise, (x - scroll) / scale, y / scale, z, octaves, roughness);
    }
  }
  for (let y = 0; y < height; y++) simulation.band[y] = layerBand(altitudeOf(y * width, width, height), rules);
  for (let i = 0; i < width * height; i++) {
    const capacity = saturation(simulation.temperature[i], simulation.pressure[i]);
    simulation.relative[i] = Math.max(0, simulation.humidity[i]) / capacity;
    const forming = simulation.relative[i] * simulation.band[Math.floor(i / width)];
    simulation.potential[i] = Math.max(0, Math.min(1, (forming - RULES.cloudThreshold) * RULES.cloudGain));
  }
}

// Carry a stored field with the wind in whole pixels (wrapping), so it never blurs and
// stays within a pixel of the noise scroll.
function shiftColumns(values, width, height, by) {
  const shift = ((by % width) + width) % width;
  if (!shift) return;
  for (let y = 0; y < height; y++) {
    const row = values.slice(y * width, (y + 1) * width);
    for (let x = 0; x < width; x++) values[y * width + (x + shift) % width] = row[x];
  }
}

// How exposed each pixel is: the mean cloud its 8 neighbors lack (sides wrap; above the lid
// and below the floor count as the edge row itself, so the box walls are not cloud edges).
export function exposure(cloud, width, height) {
  const result = new Array(cloud.length).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let lack = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const row = Math.max(0, Math.min(height - 1, y + dy)), column = (x + dx + width) % width;
      lack += 1 - Math.min(1, cloud[row * width + column]);
    }
    result[y * width + x] = lack / 8;
  }
  return result;
}

// Cloud water follows its potential up fast and down slowly, eroding from the edges inward.
export function condense(simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { cloud, potential, width, height } = simulation, loss = dissipation(rules.persistence);
  const open = exposure(cloud, width, height);
  for (let i = 0; i < cloud.length; i++) {
    if (potential[i] > cloud[i]) cloud[i] += RULES.condensation * (potential[i] - cloud[i]);
    else cloud[i] = Math.max(potential[i], cloud[i] - loss * (RULES.edgeInterior + RULES.edgeGain * open[i]));
    if (cloud[i] < 1e-3) cloud[i] = 0;
  }
}

// Conservative sub-pixel move of a whole field by (dx, dy) pixels: each pixel's amount is
// split bilinearly over the four pixels around its target, wrapping at the side walls.
// Amounts moving below the bottom row go to `spill(x, amount)` (or are dropped).
function advect(values, width, height, dx, dy, spill) {
  const next = new Array(values.length).fill(0);
  const shiftX = Math.floor(dx), shiftY = Math.floor(dy), fx = dx - shiftX, fy = dy - shiftY;
  const weights = [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const amount = values[y * width + x];
    if (amount <= 0) continue;
    for (const [ox, oy, weight] of weights) {
      if (weight <= 0) continue;
      const column = (((x + shiftX + ox) % width) + width) % width, row = y + shiftY + oy;
      if (row >= height) spill?.(column, amount * weight);
      else next[Math.max(0, row) * width + column] += amount * weight;
    }
  }
  for (let i = 0; i < values.length; i++) values[i] = next[i];
}

// Spread rain sideways: each pixel passes `rainSpread` of itself to each side neighbor
// (wrapping), so the total is unchanged.
export function spreadRain(rain, width, height, spread = RULES.rainSpread) {
  for (let y = 0; y < height; y++) {
    const row = rain.slice(y * width, (y + 1) * width);
    for (let x = 0; x < width; x++) {
      rain[y * width + x] = (1 - 2 * spread) * row[x] + spread * (row[(x + width - 1) % width] + row[(x + 1) % width]);
    }
  }
}

// One tick: advance time and the wind scroll, carry the stored cloud and the rain with it,
// resample the forcing, condense or evaporate cloud water, turn dense lasting cloud into
// rain, then let rain fall.
export function step(simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height, cloud, charge, rain, puddle } = simulation;
  simulation.tick++;
  simulation.time += rules.changeSpeed;
  simulation.scroll += rules.wind;
  const fall = Math.max(0, Math.min(1, rules.fallSpeed));
  // Cloud water and its charge drift with the wind, whole pixels at a time.
  const shift = Math.round(simulation.scroll) - simulation.shifted;
  // Rain moves with them, so the wind pushes it uniformly and a shaft stays under its cloud
  // without blurring sideways.
  if (shift) {
    for (const field of [cloud, charge, rain]) shiftColumns(field, width, height, shift);
    simulation.shifted += shift;
  }
  sampleFields(simulation, rules);
  condense(simulation, rules);
  // Kept for the views and tests: rain made at each pixel this tick.
  simulation.made = formRain(simulation, rules);
  // Rain never dries in the air: it spreads sideways a little and falls `fallSpeed` down,
  // sub-pixel, until it leaves the floor into that column's puddle.
  spreadRain(rain, width, height);
  advect(rain, width, height, 0, fall, (x, amount) => { puddle[x] += amount; simulation.fallen += amount; });
  for (let x = 0; x < width; x++) {
    const loss = puddle[x] * RULES.puddleEvaporation;
    puddle[x] -= loss; simulation.evaporated += loss;
  }
  return simulation;
}

// Cloud water that stays dense charges up; anywhere thinner the charge drains fast. Charged
// dense cloud rains up to `rainAmount` per tick (more the denser it is above denseWater),
// and pays for it in cloud water, so rain is only made in dense cloud cores and stops once
// a cloud without forcing has rained itself thin. Returns the amount made at each pixel.
export const raining = (simulation, i) => simulation.cloud[i] >= RULES.denseWater && simulation.charge[i] >= RULES.rainThreshold;
export function formRain(simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { cloud, charge, rain } = simulation, made = new Array(cloud.length).fill(0);
  for (let i = 0; i < cloud.length; i++) {
    if (cloud[i] >= RULES.denseWater) charge[i] = Math.min(1, charge[i] + RULES.charge);
    else charge[i] *= 1 - RULES.discharge;
    if (raining(simulation, i)) {
      const excess = Math.min(1, (cloud[i] - RULES.denseWater) / (1 - RULES.denseWater));
      made[i] = rules.rainAmount * (0.25 + 0.75 * excess);
      cloud[i] = Math.max(0, cloud[i] - RULES.rainDrain * made[i]);
      rain[i] += made[i]; simulation.rained += made[i];
    }
  }
  return made;
}

// Rain created so far equals rain in the air + puddles + evaporated.
export const airborneRain = simulation => simulation.rain.reduce((sum, value) => sum + value, 0);
export const pooledRain = simulation => simulation.puddle.reduce((sum, value) => sum + value, 0);

// ---- Rain streaks and curtains (display only) ---------------------------------------------
// The Sunset view draws the simulated rain two ways, neither of which changes the simulation.
// Both follow the rain field itself, which never dries in the air, so a shaft can be traced
// from the floor up to the cloud that made it.
// Curtain: a soft grey sheet wherever rain is falling, its opacity rising with how much
// rain there is (blurred over ±2 columns so its sides are soft). It starts inside the
// raining cloud, where the rain is made, smooths the cloud's lower part, and runs down to
// the floor with no fade at its foot; once a cloud stops raining the sheet's top lets go and
// falls away.
// Streaks: thin streaks born anywhere there is rain, at a random sub-pixel x and a random
// tick; birth is likelier where rain is heavier and where a slow, wind-carried clumping noise
// is high, so streaks gather into uneven shafts. Lengths are heavy-tailed (truncated power
// law, 3 to 30 px: mostly short, a few long), and each streak gets its own speed (±20%),
// strength and, sometimes, a second pixel of width. A streak fades in and out over its life,
// never reaches above the row it was born on, and dims where the rain around it thins.
export const STREAK = { length: [3, 30], lengthPower: 0.7, life: [40, 170], speed: [0.8, 1.2],
  alpha: 0.6, wide: 0.15, spawnTries: 80, max: 300, scale: 0.03, clumpSize: 9, follow: 0.2 };
// Curtain: opacity CURTAIN.alpha × clamp(rain / scale)^power.
export const CURTAIN = { alpha: 0.5, scale: 0.06, power: 0.7 };
export function createRainLayer(seed = 1) {
  let state = (seed ^ 0x5bd1e995) >>> 0;
  const random = () => (state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296;
  return { streaks: [], random, clump: createNoise3((seed ^ 0x2545f491) >>> 0) };
}

// Lowest cloud row in each column (−1 if the column is clear).
export function cloudBases(simulation) {
  const { width, height, cloud } = simulation, bases = new Array(width).fill(-1);
  for (let x = 0; x < width; x++) for (let y = height - 1; y >= 0; y--) if (cloud[y * width + x] > 0) { bases[x] = y; break; }
  return bases;
}

// Rain around a point, in streak units (1 = plenty): the mean over the pixel's row and the
// rows just above and below.
function rainNear(simulation, x, y) {
  const { width, height, rain } = simulation, column = ((Math.floor(x) % width) + width) % width;
  let total = 0, rows = 0;
  for (let row = Math.floor(y) - 1; row <= Math.floor(y) + 1; row++) {
    if (row < 0 || row >= height) continue;
    total += rain[row * width + column]; rows++;
  }
  return rows ? total / rows / STREAK.scale : 0;
}

// Truncated power law on [shortest, longest]: inverse-CDF sample of p(L) ∝ L^−(1 + power).
function streakLength(u) {
  const [shortest, longest] = STREAK.length, a = STREAK.lengthPower;
  const low = Math.pow(shortest, -a), high = Math.pow(longest, -a);
  return Math.pow(low - u * (low - high), -1 / a);
}

export function updateRainLayer(layer, simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height } = simulation, random = layer.random, clump = layer.clump ?? (() => 0);
  for (const streak of layer.streaks) {
    streak.age++; streak.y += rules.fallSpeed * streak.speed; streak.x += rules.wind;
    // Its brightness eases toward the rain around its head, so it never shows in dry air.
    const target = Math.min(1, rainNear(simulation, streak.x, streak.y));
    streak.fade = (streak.fade ?? target) + (target - (streak.fade ?? target)) * STREAK.follow;
  }
  layer.streaks = layer.streaks.filter(streak => streak.age < streak.life && streak.y - streak.length < height && (streak.age < 5 || (streak.fade ?? 1) > 0.02));
  for (let k = 0; k < STREAK.spawnTries && layer.streaks.length < STREAK.max; k++) {
    const x = random() * width, y = random() * height, amount = rainNear(simulation, x, y);
    if (amount <= 0.01) continue;
    // Clumping: slow noise carried by the wind; squared so gaps open between shafts.
    const gather = Math.max(0, Math.min(1, 0.5 + 1.2 * clump((x - simulation.scroll) / STREAK.clumpSize, 0.5, simulation.tick * 0.015)));
    // Squared, so heavy rain gets most streaks and thin rain few.
    if (random() >= Math.min(1, amount * amount) * (0.1 + 1.2 * gather * gather)) continue;
    const [briefest, longestLife] = STREAK.life, [slow, fast] = STREAK.speed;
    layer.streaks.push({ x, y, top: y, age: 0, length: streakLength(random()),
      life: briefest + random() * (longestLife - briefest), speed: slow + random() * (fast - slow),
      strength: (0.45 + 0.55 * random()) * (0.6 + 0.4 * Math.min(1, amount)), wide: random() < STREAK.wide,
      fade: Math.min(1, amount) });
  }
  return layer;
}

// Curtain opacity per pixel (0 where there is no rain): CURTAIN.alpha × clamp(rain /
// CURTAIN.scale)^CURTAIN.power, with the rain blurred over ±2 columns. `layer` is unused
// (kept so callers can pass the rain layer alongside).
export function curtainAlpha(layer, simulation) {
  const { width, height, rain } = simulation, alpha = new Float32Array(width * height), kernel = [1, 2, 3, 2, 1];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let amount = 0;
    kernel.forEach((weight, k) => { amount += weight * rain[y * width + (x + k - 2 + width) % width] / 9; });
    if (amount > 1e-5) alpha[y * width + x] = CURTAIN.alpha * Math.min(1, amount / CURTAIN.scale) ** CURTAIN.power;
  }
  return alpha;
}

// Opacity of each pixel from the streaks: lifetime envelope sin(π age/life) times a
// sin(π t) profile along the streak (t = 0 tail, 1 head), antialiased across the two
// nearest columns (plus a fainter third for wide streaks), and cut off above the row the
// streak was born on. Capped so heavy rain stays a veil.
export function rainAlpha(layer, simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height } = simulation, alpha = new Float32Array(width * height);
  for (const streak of layer.streaks) {
    const life = Math.sin(Math.PI * Math.min(1, streak.age / streak.life)) * (streak.fade ?? 1);
    if (life <= 0) continue;
    // Lean = wind / fall speed (the streak points along its motion), capped so slow rain in
    // strong wind does not lie flat.
    const speed = rules.fallSpeed * (streak.speed ?? 1);
    const lean = speed > 0 ? Math.max(-1.5, Math.min(1.5, rules.wind / speed)) : 0;
    const top = Math.max(Math.ceil(streak.y - streak.length), Math.ceil(streak.top ?? -Infinity)), bottom = Math.floor(streak.y);
    for (let row = Math.max(0, top); row <= Math.min(height - 1, bottom); row++) {
      const t = 1 - (streak.y - row) / streak.length;
      const value = STREAK.alpha * streak.strength * life * Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
      const column = streak.x - lean * (streak.y - row), left = Math.floor(column), frac = column - left;
      alpha[row * width + ((left % width) + width) % width] += value * (1 - frac);
      alpha[row * width + (((left + 1) % width) + width) % width] += value * frac;
      if (streak.wide) alpha[row * width + (((left + 2) % width) + width) % width] += 0.5 * value * frac + 0.3 * value * (1 - frac);
    }
  }
  for (let i = 0; i < alpha.length; i++) alpha[i] = Math.min(0.7, alpha[i]);
  return alpha;
}

// ---- Drawing -----------------------------------------------------------------------------
// A small sunset palette, in hard dithered bands: indigo at the lid to gold at the floor.
export const SKY = [[18, 16, 48], [40, 24, 72], [70, 34, 90], [110, 44, 98], [156, 58, 96],
  [200, 82, 88], [232, 116, 82], [248, 156, 90], [252, 196, 110]];
// Cloud shades from shadow to lit edge; rain (diagnostic view), rain-streak and curtain
// greys (tinted by the sky behind them) and puddles.
export const CLOUD = [[70, 46, 88], [128, 84, 124], [222, 140, 150], [255, 206, 170]];
const RAIN = [150, 210, 236], RAIN_GREY = [168, 162, 178], CURTAIN_GREY = [132, 112, 142], PUDDLE = [76, 120, 168];
// 4×4 ordered dither so bands and opacities break into chunky pixel patterns.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const clip01 = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a.map((channel, k) => channel + (b[k] - channel) * t);
export const RAIN_SCALE = 0.02;

export function skyColor(altitude, threshold = 0.5) {
  const depth = clip01(1 - altitude) * (SKY.length - 1);
  const band = Math.floor(depth), within = depth - band;
  return SKY[Math.min(SKY.length - 1, band + (within > threshold ? 1 : 0))];
}

function diverging(value, low, high) {
  const t = clip01(value);
  return t < 0.5 ? mix(low, [24, 26, 40], t * 2) : mix([24, 26, 40], high, (t - 0.5) * 2);
}

// `layer` (from createRainLayer/updateRainLayer) supplies the Sunset rain streaks; without
// it Sunset shows no rain in the air.
export function renderWeather(simulation, view = "sunset", options = {}, layer = null) {
  const rules = { ...defaults, ...options };
  const { width, height, humidity, temperature, pressure, relative, cloud, rain, puddle, band } = simulation;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const streaks = view === "sunset" && layer ? rainAlpha(layer, simulation, rules) : null;
  const curtains = view === "sunset" && layer ? curtainAlpha(layer, simulation) : null;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, altitude = altitudeOf(i, width, height);
    const dither = BAYER[(y % 4) * 4 + (x % 4)];
    let rgb;
    if (view === "humidity") rgb = mix([10, 14, 30], [120, 190, 255], clip01(humidity[i]));
    else if (view === "temperature") rgb = diverging(temperature[i], [70, 120, 255], [255, 90, 60]);
    else if (view === "pressure") rgb = diverging(0.5 + 0.5 * pressure[i], [170, 80, 220], [240, 210, 90]);
    else if (view === "relative") {
      // Forcing: relative humidity × the layer band; orange where it forms cloud.
      const forming = relative[i] * band[y];
      rgb = forming >= RULES.cloudThreshold ? [255, 150, 60] : mix([10, 14, 30], [200, 220, 240], clip01(forming / RULES.cloudThreshold));
    } else if (view === "water") {
      rgb = mix([12, 14, 24], [230, 232, 240], cloud[i]);
      if (raining(simulation, i)) rgb = mix(rgb, [255, 220, 120], 0.35);
      rgb = mix(rgb, RAIN, clip01(rain[i] / RAIN_SCALE));
    } else {
      // Sunset: banded sky, cloud in four shades (lit where the cloud thins toward the low
      // sun at lower right, shaded inside), the rain curtain smoothing a raining cloud's base
      // into a soft sheet, soft rain streaks, puddles on the floor.
      rgb = skyColor(altitude, dither);
      const density = cloud[i], sheet = curtains ? curtains[i] : 0;
      if (density > dither * 0.6) {
        const toward = y + 1 < height && x + 1 < width ? cloud[i + width + 1] : 0;
        const light = clip01(0.4 + 1.5 * (density - toward) + 0.2 * (1 - altitude) - 0.15 * (1 - density));
        rgb = CLOUD[Math.min(3, Math.floor(light * 3.999))];
      }
      if (sheet > 0.005) {
        // Inside the cloud the curtain evens out the shading (less texture); below it, a
        // dithered grey sheet over the sky. Four opacity steps keep it pixel art.
        const level = Math.min(1, Math.floor((density > dither * 0.6 ? 1.4 : 1) * sheet * 4 + dither) / 4);
        rgb = mix(rgb, mix(CURTAIN_GREY, skyColor(altitude), 0.25), level);
      }
      if (streaks && streaks[i] > 0.005) rgb = mix(rgb, mix(RAIN_GREY, skyColor(altitude), 0.3), streaks[i] * (1 - 0.7 * density));
    }
    if (y === height - 1 && puddle[x] > 0.02 + dither * 0.2) rgb = PUDDLE;
    pixels.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  }
  return pixels;
}
