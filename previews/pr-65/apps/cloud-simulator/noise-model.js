/*
 * Purpose: Browser-independent noise-weather experiment: humidity, temperature and pressure
 *   are slices of seeded 3D gradient noise moving through time and scrolling with one global
 *   wind; cloud forms where relative humidity, weighted by a cloud-layer band of height,
 *   crosses a threshold; charged cloud drops real rain that falls slowly, drifts with the
 *   wind, evaporates and collects; plus the views and the rain-streak layer that draw it.
 * Consumers: noise.js and noise-model.test.js.
 * Dependencies: none; values are dimensionless experimental units, not a weather model.
 */

// The noise fields. Their shape (octaves, roughness, amplitude) is fixed; feature size and
// change speed are shared sliders, scaled per field so they do not line up.
export const FIELDS = ["humidity", "temperature", "pressure"];
const FIELD_SHAPE = {
  // relative size, relative change speed, octaves, roughness, amplitude, bias (humidity's
  // bias is the `cloudiness` slider)
  humidity: { size: 1, speed: 1, octaves: 3, roughness: 0.5, amplitude: 0.35 },
  temperature: { size: 1.5, speed: 0.5, octaves: 2, roughness: 0.5, amplitude: 0.12, bias: 0.75 },
  pressure: { size: 2, speed: 0.4, octaves: 2, roughness: 0.5, amplitude: 1, bias: 0 }
};

// The sliders. Everything else is fixed below.
export const defaults = {
  // Sky: mean humidity, size of cloud features in pixels, how fast the fields change, and
  // the one global wind in pixels per tick (sign = direction, positive blows right).
  cloudiness: 0.45, featureSize: 32, changeSpeed: 0.012, wind: 0.1,
  // Cloud layer: clouds form only in a band of height (altitude 0 floor, 1 lid) centred on
  // `layerHeight`, `layerThickness` across. `layerAsymmetry` > 0 puts more of the band above
  // the centre (a sharper bottom); `layerSharpness` 2 is a Gaussian, higher is flatter
  // inside with sharper edges.
  layerHeight: 0.45, layerThickness: 0.3, layerAsymmetry: 0.35, layerSharpness: 4,
  // Rain: rain made per tick by charged cloud (× density), and fall speed in pixels per tick.
  rainAmount: 0.003, fallSpeed: 0.25
};

// Fixed rules.
export const RULES = {
  pressureLift: 0.3, cloudThreshold: 1, cloudGain: 8,
  charge: 0.02, discharge: 0.04, rainThreshold: 0.6,
  rainEvaporation: 0.015, puddleEvaporation: 0.002
};

// Fixed slope of the capacity curve, as in the convection study: cold air holds
// about e^-3 ≈ 5% of what hot air holds.
export const SATURATION_SLOPE = 3;
export function saturation(temperature, pressure = 0, pressureLift = RULES.pressureLift) {
  return Math.exp(SATURATION_SLOPE * (temperature - 1)) * Math.max(0.05, 1 + pressureLift * pressure);
}

// Cloud-layer band: 1 at `layerHeight`, falling to 0 above and below. Half-widths are
// thickness/2 × (1 ± asymmetry) above/below; shape exp(−|distance / halfWidth|^sharpness).
export function layerBand(altitude, rules = defaults) {
  const asymmetry = Math.max(-0.95, Math.min(0.95, rules.layerAsymmetry));
  const half = Math.max(0.005, rules.layerThickness / 2);
  const offset = altitude - rules.layerHeight;
  const width = offset >= 0 ? half * (1 + asymmetry) : half * (1 - asymmetry);
  return Math.exp(-Math.pow(Math.abs(offset) / width, Math.max(1, rules.layerSharpness)));
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
// so the result stays in about [-1, 1] for any octave count.
export function fractal(noise, x, y, z, octaves = 1, roughness = 0.5) {
  let sum = 0, weight = 1, total = 0, frequency = 1;
  for (let octave = 0; octave < Math.max(1, Math.round(octaves)); octave++) {
    sum += weight * noise(x * frequency, y * frequency, z * frequency + 17.3 * octave);
    total += weight; weight *= roughness; frequency *= 2;
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
    relative: zeros(), cloud: zeros(), charge: zeros(), rain: zeros(),
    puddle: new Array(width).fill(0), rained: 0, evaporated: 0,
    // Accumulated wind scroll and field time, so slider changes never jump the view.
    scroll: 0, time: 0, band: new Array(height).fill(1) };
  sampleFields(simulation, defaults);
  return simulation;
}

export const altitudeOf = (i, width, height) => 1 - Math.floor(i / width) / (height - 1);

// Fill the fields, relative humidity and cloud for the current state. Each field is a 2D
// slice at the current time through its own 3D noise, shifted right by the wind scroll.
export function sampleFields(simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height, scroll, time } = simulation;
  const noises = noisesFor(simulation.seed);
  for (const name of FIELDS) {
    const shape = FIELD_SHAPE[name], scale = Math.max(2, rules.featureSize * shape.size);
    const bias = name === "humidity" ? rules.cloudiness : shape.bias, z = time * shape.speed;
    const values = simulation[name], noise = noises[name];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      // Raw Perlin rarely leaves ±0.5, so double it to use the full amplitude.
      values[y * width + x] = bias + shape.amplitude * 2 * fractal(noise, (x - scroll) / scale, y / scale, z, shape.octaves, shape.roughness);
    }
  }
  for (let y = 0; y < height; y++) simulation.band[y] = layerBand(altitudeOf(y * width, width, height), rules);
  for (let i = 0; i < width * height; i++) {
    const capacity = saturation(simulation.temperature[i], simulation.pressure[i]);
    simulation.relative[i] = Math.max(0, simulation.humidity[i]) / capacity;
    const forming = simulation.relative[i] * simulation.band[Math.floor(i / width)];
    simulation.cloud[i] = Math.max(0, Math.min(1, (forming - RULES.cloudThreshold) * RULES.cloudGain));
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

// One tick: advance time and the wind scroll, resample the fields, charge lingering cloud,
// then move rain.
export function step(simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height, cloud, charge, rain, puddle } = simulation;
  simulation.tick++;
  simulation.time += rules.changeSpeed;
  simulation.scroll += rules.wind;
  const fall = Math.max(0, Math.min(1, rules.fallSpeed));
  // Charge belongs to the drifting cloud, so it moves with the wind.
  if (rules.wind) advect(charge, width, height, rules.wind, 0);
  sampleFields(simulation, rules);
  const size = width * height;
  // Cloud that stays together charges up; clear air lets the charge drain away. Charged
  // cloud rains `rainAmount × density` per tick.
  for (let i = 0; i < size; i++) {
    if (cloud[i] > 0) charge[i] = Math.min(1, charge[i] + RULES.charge * cloud[i]);
    else charge[i] *= 1 - RULES.discharge;
    if (charge[i] >= RULES.rainThreshold) {
      const drops = rules.rainAmount * cloud[i];
      rain[i] += drops; simulation.rained += drops;
    }
  }
  // Rain outside cloud dries slowly (1.5% per tick), so a dissolved cloud's rain fades out.
  for (let i = 0; i < size; i++) {
    if (rain[i] <= 0 || cloud[i] > 0) continue;
    const loss = rain[i] * RULES.rainEvaporation;
    rain[i] -= loss; simulation.evaporated += loss;
  }
  // Fall and drift: all rain moves `fallSpeed` down and `wind` sideways, sub-pixel.
  advect(rain, width, height, rules.wind, fall, (x, amount) => { puddle[x] += amount; });
  for (let x = 0; x < width; x++) {
    const loss = puddle[x] * RULES.puddleEvaporation;
    puddle[x] -= loss; simulation.evaporated += loss;
  }
  return simulation;
}

// Rain created so far equals rain in the air + puddles + evaporated.
export const airborneRain = simulation => simulation.rain.reduce((sum, value) => sum + value, 0);
export const pooledRain = simulation => simulation.puddle.reduce((sum, value) => sum + value, 0);

// ---- Rain streaks (display only) ----------------------------------------------------------
// The Sunset view draws rain as thin, long, soft streaks: particles spawned where the rain
// field is, sliding down at `fallSpeed` and sideways with the wind (so all lean the same
// way), fading in and out over their life and along their length. They do not change the
// simulation.
export const STREAK = { length: [8, 18], life: [50, 110], alpha: 0.5, spawnTries: 40, max: 300, scale: 0.12 };
export function createRainLayer(seed = 1) {
  let state = (seed ^ 0x5bd1e995) >>> 0;
  const random = () => (state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296;
  return { streaks: [], random };
}

export function updateRainLayer(layer, simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height, rain } = simulation, random = layer.random;
  for (const streak of layer.streaks) { streak.age++; streak.y += rules.fallSpeed; streak.x += rules.wind; }
  layer.streaks = layer.streaks.filter(streak => streak.age < streak.life && streak.y - streak.length < height);
  for (let k = 0; k < STREAK.spawnTries && layer.streaks.length < STREAK.max; k++) {
    const x = Math.floor(random() * width), y = Math.floor(random() * height);
    const amount = rain[y * width + x] / STREAK.scale;
    // Squared, so heavy rain under active cloud gets most streaks and fading rain few.
    if (random() >= Math.min(1, amount * amount)) continue;
    const [shortest, longest] = STREAK.length, [briefest, longestLife] = STREAK.life;
    layer.streaks.push({ x: x + random(), y: y + random(), age: 0,
      length: shortest + random() * (longest - shortest), life: briefest + random() * (longestLife - briefest),
      strength: 0.6 + 0.4 * Math.min(1, amount) });
  }
  return layer;
}

// Opacity of each pixel from the streaks: lifetime envelope sin(π age/life) times a
// sin(π t) profile along the streak (t = 0 tail, 1 head), antialiased across the two
// nearest columns. Capped so heavy rain stays a veil.
export function rainAlpha(layer, simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height } = simulation, alpha = new Float32Array(width * height);
  // Lean = wind / fall speed (the streak points along its motion), capped so slow rain in
  // strong wind does not lie flat.
  const lean = rules.fallSpeed > 0 ? Math.max(-1.5, Math.min(1.5, rules.wind / rules.fallSpeed)) : 0;
  for (const streak of layer.streaks) {
    const life = Math.sin(Math.PI * Math.min(1, streak.age / streak.life));
    if (life <= 0) continue;
    const top = Math.ceil(streak.y - streak.length), bottom = Math.floor(streak.y);
    for (let row = Math.max(0, top); row <= Math.min(height - 1, bottom); row++) {
      const t = 1 - (streak.y - row) / streak.length;
      const value = STREAK.alpha * streak.strength * life * Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
      const column = streak.x - lean * (streak.y - row), left = Math.floor(column), frac = column - left;
      alpha[row * width + ((left % width) + width) % width] += value * (1 - frac);
      alpha[row * width + (((left + 1) % width) + width) % width] += value * frac;
    }
  }
  for (let i = 0; i < alpha.length; i++) alpha[i] = Math.min(0.7, alpha[i]);
  return alpha;
}

// ---- Drawing -----------------------------------------------------------------------------
// A small sunset palette, in hard dithered bands: indigo at the lid to gold at the floor.
export const SKY = [[18, 16, 48], [40, 24, 72], [70, 34, 90], [110, 44, 98], [156, 58, 96],
  [200, 82, 88], [232, 116, 82], [248, 156, 90], [252, 196, 110]];
// Cloud shades from shadow to lit edge; rain (diagnostic view), rain-streak grey (tinted by
// the sky behind it) and puddles.
export const CLOUD = [[70, 46, 88], [128, 84, 124], [222, 140, 150], [255, 206, 170]];
const RAIN = [150, 210, 236], RAIN_GREY = [168, 162, 178], PUDDLE = [76, 120, 168];
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
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, altitude = altitudeOf(i, width, height);
    const dither = BAYER[(y % 4) * 4 + (x % 4)];
    let rgb;
    if (view === "humidity") rgb = mix([10, 14, 30], [120, 190, 255], clip01(humidity[i]));
    else if (view === "temperature") rgb = diverging(temperature[i], [70, 120, 255], [255, 90, 60]);
    else if (view === "pressure") rgb = diverging(0.5 + 0.5 * pressure[i], [170, 80, 220], [240, 210, 90]);
    else if (view === "relative") {
      // Cloud-forming strength: relative humidity × the layer band; orange where it forms.
      const forming = relative[i] * band[y];
      rgb = forming >= RULES.cloudThreshold ? [255, 150, 60] : mix([10, 14, 30], [200, 220, 240], clip01(forming / RULES.cloudThreshold));
    } else if (view === "water") {
      rgb = mix([12, 14, 24], [230, 232, 240], cloud[i]);
      if (simulation.charge[i] >= RULES.rainThreshold && cloud[i] > 0) rgb = mix(rgb, [255, 220, 120], 0.35);
      rgb = mix(rgb, RAIN, clip01(rain[i] / RAIN_SCALE));
    } else {
      // Sunset: banded sky, cloud in four shades (lit where the cloud thins toward the low
      // sun at lower right, shaded inside), soft rain streaks, puddles on the floor.
      rgb = skyColor(altitude, dither);
      const density = cloud[i];
      if (density > dither * 0.6) {
        const toward = y + 1 < height && x + 1 < width ? cloud[i + width + 1] : 0;
        const light = clip01(0.4 + 1.5 * (density - toward) + 0.2 * (1 - altitude) - 0.15 * (1 - density));
        rgb = CLOUD[Math.min(3, Math.floor(light * 3.999))];
      }
      if (streaks && streaks[i] > 0.005) rgb = mix(rgb, mix(RAIN_GREY, skyColor(altitude), 0.3), streaks[i] * (1 - 0.7 * density));
    }
    if (y === height - 1 && puddle[x] > 0.02 + dither * 0.2) rgb = PUDDLE;
    pixels.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  }
  return pixels;
}
