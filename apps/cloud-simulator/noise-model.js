/*
 * Purpose: Browser-independent noise-weather experiment: humidity, temperature, pressure
 *   and wind are slices of seeded 3D gradient noise moving through time and scrolling
 *   sideways together; cloud appears where relative humidity, favored just above a lifting
 *   condensation level (LCL), crosses a threshold, and lingering cloud drops real rain that
 *   falls slowly, drifts, evaporates and collects; plus the views that draw it as pixel art.
 * Consumers: noise.js and noise-model.test.js.
 * Dependencies: none; values are dimensionless experimental units, not a weather model.
 */

// Per-field noise controls: feature size in pixels, drift through time per tick, fractal
// octaves, roughness (amplitude kept per octave), bias (mean) and amplitude.
export const FIELDS = ["humidity", "temperature", "pressure", "wind"];
const field = (scale, speed, octaves, roughness, bias, amplitude) => ({ scale, speed, octaves, roughness, bias, amplitude });
const FIELD_DEFAULTS = {
  humidity: field(32, 0.012, 3, 0.5, 0.32, 0.35),
  temperature: field(48, 0.006, 2, 0.5, 0.75, 0.12),
  pressure: field(64, 0.005, 2, 0.5, 0, 1),
  wind: field(56, 0.008, 2, 0.5, 0, 1)
};

export const defaults = {
  ...Object.fromEntries(FIELDS.flatMap(name => Object.entries(FIELD_DEFAULTS[name])
    .map(([key, value]) => [name + key[0].toUpperCase() + key.slice(1), value]))),
  // Temperature falls by `lapse` from floor to lid, so air aloft holds less vapor.
  lapse: 0.4,
  // Humidity falls by `drying` from floor to lid: most water vapor stays low.
  drying: 0.55,
  // Low pressure (negative) lowers the capacity, adding lift; high pressure clears.
  pressureLift: 0.3,
  // Every field scrolls sideways together by `windScroll` pixels per tick (positive to the
  // right), so clouds drift across as objects; rain and charge ride along.
  windScroll: 0.1,
  // Cloud appears where relative humidity × the LCL profile exceeds `cloudThreshold`.
  cloudThreshold: 1, cloudGain: 8,
  // LCL profile (when `lcl` is 1): about 0 below `lclHeight` (altitude 0..1), a sigmoid step
  // of steepness `lclSharpness` up to 1 + `lclBoost` at the LCL, tapering back to 1 with
  // e-folding height `lclTaper` above it. It divides the cloud threshold, so cloud bases sit
  // flat on the LCL.
  lcl: 1, lclHeight: 0.35, lclSharpness: 60, lclBoost: 0.6, lclTaper: 0.12,
  // Cloud that lingers charges up; past `rainThreshold` it rains `rainRate × density`.
  charge: 0.02, discharge: 0.04, rainThreshold: 0.6, rainRate: 0.003,
  // Rain falls `fallSpeed` pixels per tick (sub-pixel, so it glides), drifts with the
  // scroll plus `windDrift × wind`, and dries in dry air.
  fallSpeed: 0.25, windDrift: 0.15, rainEvaporation: 0.15, puddleEvaporation: 0.002
};

// Fixed slope of the capacity curve, as in the convection study: cold air holds
// about e^-3 ≈ 5% of what hot air holds.
export const SATURATION_SLOPE = 3;
export function saturation(temperature, pressure = 0, pressureLift = defaults.pressureLift) {
  return Math.exp(SATURATION_SLOPE * (temperature - 1)) * Math.max(0.05, 1 + pressureLift * pressure);
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

// ---- Simulation ------------------------------------------------------------------------
export function createWeather({ width = 128, height = 96, seed = 1 } = {}) {
  const size = width * height;
  const zeros = () => new Array(size).fill(0);
  const simulation = { width, height, seed: seed >>> 0, tick: 0,
    humidity: zeros(), temperature: zeros(), pressure: zeros(), wind: zeros(),
    relative: zeros(), cloud: zeros(), charge: zeros(), rain: zeros(),
    puddle: new Array(width).fill(0), rained: 0, evaporated: 0,
    // Accumulated sideways scroll and rain fall, in pixels, so sliders never jump the view.
    scroll: 0, fallen: 0, lclProfile: new Array(height).fill(1) };
  sampleFields(simulation, defaults);
  return simulation;
}

const altitudeOf = (i, width, height) => 1 - Math.floor(i / width) / (height - 1);

// Cloud-forming multiplier by altitude: near 0 below the LCL, a sharp step up to 1 + boost
// at it, tapering back toward 1 above. 1 everywhere when the LCL is off.
export function lclFactor(altitude, rules = defaults) {
  if (!rules.lcl) return 1;
  const above = altitude - rules.lclHeight;
  const rise = 1 / (1 + Math.exp(-rules.lclSharpness * above));
  return rise * (1 + rules.lclBoost * Math.exp(-Math.max(0, above) / Math.max(0.01, rules.lclTaper)));
}

// Fill the four fields, relative humidity and cloud for the current tick. Each field is
// a 2D slice at time `tick × speed` through its own 3D noise, shifted right by the scroll.
export function sampleFields(simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height, tick } = simulation;
  const scroll = simulation.scroll ?? 0;
  const noises = noisesFor(simulation.seed);
  for (const name of FIELDS) {
    const scale = Math.max(1, rules[name + "Scale"]), time = tick * rules[name + "Speed"];
    const octaves = rules[name + "Octaves"], roughness = rules[name + "Roughness"];
    const bias = rules[name + "Bias"], amplitude = rules[name + "Amplitude"];
    const values = simulation[name], noise = noises[name];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      // Raw Perlin rarely leaves ±0.5, so double it to use the slider's full amplitude.
      values[y * width + x] = bias + amplitude * 2 * fractal(noise, (x - scroll) / scale, y / scale, time, octaves, roughness);
    }
  }
  for (let y = 0; y < height; y++) simulation.lclProfile[y] = lclFactor(altitudeOf(y * width, width, height), rules);
  for (let i = 0; i < width * height; i++) {
    const altitude = altitudeOf(i, width, height), favor = simulation.lclProfile[Math.floor(i / width)];
    simulation.temperature[i] -= rules.lapse * (altitude - 0.5);
    simulation.humidity[i] -= rules.drying * (altitude - 0.5);
    const humidity = Math.max(0, simulation.humidity[i]);
    simulation.relative[i] = humidity / saturation(simulation.temperature[i], simulation.pressure[i], rules.pressureLift);
    simulation.cloud[i] = Math.max(0, Math.min(1, (simulation.relative[i] * favor - rules.cloudThreshold) * rules.cloudGain));
  }
}

// Conservative sub-pixel move: each pixel's amount is split bilinearly over the (up to) four
// pixels around its target, wrapping at the side walls. Amounts moving below the bottom row
// go to `spill(x, amount)` (or are dropped when there is none). Totals are preserved.
function advect(values, width, height, moveOf, spill) {
  const next = new Array(values.length).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, amount = values[i];
    if (amount <= 0) continue;
    const [dx, dy] = moveOf(i);
    const tx = x + dx, ty = y + dy, x0 = Math.floor(tx), y0 = Math.floor(ty);
    const fx = tx - x0, fy = ty - y0;
    for (const [ox, oy, weight] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      if (weight <= 0) continue;
      const column = (((x0 + ox) % width) + width) % width, row = y0 + oy;
      if (row >= height) spill?.(column, amount * weight);
      else next[Math.max(0, row) * width + column] += amount * weight;
    }
  }
  for (let i = 0; i < values.length; i++) values[i] = next[i];
}

// One tick: advance time and scroll, resample the fields, charge lingering cloud, then
// move rain.
export function step(simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height, cloud, charge, rain, relative, wind, puddle } = simulation;
  simulation.tick++;
  simulation.scroll = (simulation.scroll ?? 0) + rules.windScroll;
  const fall = Math.max(0, Math.min(1, rules.fallSpeed));
  simulation.fallen = (simulation.fallen ?? 0) + fall;
  // Charge belongs to the drifting cloud, so it scrolls with the fields.
  if (rules.windScroll) advect(charge, width, height, () => [rules.windScroll, 0]);
  sampleFields(simulation, rules);
  const size = width * height;
  // Cloud that stays in place charges up; clear air lets the charge drain away.
  for (let i = 0; i < size; i++) {
    if (cloud[i] > 0) charge[i] = Math.min(1, charge[i] + rules.charge * cloud[i]);
    else charge[i] *= 1 - rules.discharge;
    if (charge[i] >= rules.rainThreshold) {
      const drops = rules.rainRate * cloud[i];
      rain[i] += drops; simulation.rained += drops;
    }
  }
  // Rain dries in subsaturated air outside cloud.
  for (let i = 0; i < size; i++) {
    if (rain[i] <= 0 || cloud[i] > 0) continue;
    const loss = rain[i] * Math.min(1, rules.rainEvaporation * Math.max(0, 1 - relative[i]));
    rain[i] -= loss; simulation.evaporated += loss;
  }
  // Fall: rain moves `fallSpeed` pixels down and `windScroll + windDrift × wind` pixels
  // sideways per tick, split over neighboring pixels so slow rain glides instead of
  // jumping. Rain leaving the bottom row fills that column's puddle.
  advect(rain, width, height, i => [rules.windScroll + rules.windDrift * wind[i], fall], (x, amount) => { puddle[x] += amount; });
  for (let x = 0; x < width; x++) {
    const loss = puddle[x] * rules.puddleEvaporation;
    puddle[x] -= loss; simulation.evaporated += loss;
  }
  return simulation;
}

// Rain created so far equals rain in the air + puddles + evaporated.
export const airborneRain = simulation => simulation.rain.reduce((sum, value) => sum + value, 0);
export const pooledRain = simulation => simulation.puddle.reduce((sum, value) => sum + value, 0);

// ---- Drawing -----------------------------------------------------------------------------
// A small sunset palette, in hard dithered bands: indigo at the lid to gold at the floor.
export const SKY = [[18, 16, 48], [40, 24, 72], [70, 34, 90], [110, 44, 98], [156, 58, 96],
  [200, 82, 88], [232, 116, 82], [248, 156, 90], [252, 196, 110]];
// Cloud shades from shadow to lit edge; rain (diagnostic view, and the grey of the Sunset
// rain veil before sky tint) and puddles.
export const CLOUD = [[70, 46, 88], [128, 84, 124], [222, 140, 150], [255, 206, 170]];
const RAIN = [150, 210, 236], RAIN_GREY = [150, 146, 162], PUDDLE = [76, 120, 168];
// 4×4 ordered dither so bands and opacities break into chunky pixel patterns.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const clip01 = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a.map((channel, k) => channel + (b[k] - channel) * t);
export const RAIN_SCALE = 0.02;
// Rain veil: amount of rain for full veil strength, most opacity it reaches, and the
// smear weights trailing above each pixel (it reads as streaks falling, not dots).
export const VEIL_SCALE = 0.05, VEIL_ALPHA = 0.6;
const SMEAR = [1, 0.75, 0.5, 0.3, 0.15];
// Fixed per-column streak texture: smooth along the fall, sliding down with the rain at
// sub-pixel speed so it never steps. Values in about [0.4, 1].
const columnHash = x => { let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function streak(column, along) {
  const phase = columnHash(column) * 64, period = 5 + 4 * columnHash(column + 7919);
  return 0.7 + 0.3 * Math.sin((along + phase) * 2 * Math.PI / period);
}

export function skyColor(altitude, threshold = 0.5) {
  const depth = clip01(1 - altitude) * (SKY.length - 1);
  const band = Math.floor(depth), within = depth - band;
  return SKY[Math.min(SKY.length - 1, band + (within > threshold ? 1 : 0))];
}

function diverging(value, low, high) {
  const t = clip01(value);
  return t < 0.5 ? mix(low, [24, 26, 40], t * 2) : mix([24, 26, 40], high, (t - 0.5) * 2);
}

export function renderWeather(simulation, view = "sunset", options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height, humidity, temperature, pressure, relative, cloud, rain, puddle } = simulation;
  const pixels = new Uint8ClampedArray(width * height * 4);
  // Sunset rain veil: a vertically smeared copy of the rain field.
  const veil = view === "sunset" ? new Float32Array(width * height) : null;
  if (veil) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0, total = 0;
    SMEAR.forEach((weight, k) => { if (y - k >= 0) sum += weight * rain[(y - k) * width + x]; total += weight; });
    veil[y * width + x] = sum / total * 2;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, altitude = altitudeOf(i, width, height);
    const dither = BAYER[(y % 4) * 4 + (x % 4)];
    let rgb;
    if (view === "humidity") rgb = mix([10, 14, 30], [120, 190, 255], clip01(humidity[i]));
    else if (view === "temperature") rgb = diverging(temperature[i], [70, 120, 255], [255, 90, 60]);
    else if (view === "pressure") rgb = diverging(0.5 + 0.5 * pressure[i], [170, 80, 220], [240, 210, 90]);
    else if (view === "wind") rgb = diverging(0.5 + 0.5 * simulation.wind[i], [80, 200, 170], [240, 140, 200]);
    else if (view === "relative") {
      rgb = relative[i] >= rules.cloudThreshold ? [255, 150, 60] : mix([10, 14, 30], [200, 220, 240], clip01(relative[i] / rules.cloudThreshold));
    } else if (view === "water") {
      rgb = mix([12, 14, 24], [230, 232, 240], cloud[i]);
      if (simulation.charge[i] >= rules.rainThreshold && cloud[i] > 0) rgb = mix(rgb, [255, 220, 120], 0.35);
      rgb = mix(rgb, RAIN, clip01(rain[i] / RAIN_SCALE));
    } else {
      // Sunset: banded sky, cloud in four shades (lit where the cloud thins toward the low
      // sun at lower right, shaded inside), a soft rain veil, puddles on the floor.
      rgb = skyColor(altitude, dither);
      const density = cloud[i];
      if (density > dither * 0.6) {
        // Lit where the cloud thins toward the sun (one pixel right and down), shaded
        // where it thickens; the bottom of the sky is closer to the sun's glow.
        const toward = y + 1 < height && x + 1 < width ? cloud[i + width + 1] : 0;
        const light = clip01(0.4 + 1.5 * (density - toward) + 0.2 * (1 - altitude) - 0.15 * (1 - density));
        rgb = CLOUD[Math.min(3, Math.floor(light * 3.999))];
      }
      // Rain: a soft grey veil tinted by the sky behind it, more opaque in heavier rain,
      // fainter inside cloud, with faint streaks that slide down with the rain.
      const amount = clip01(veil[i] / VEIL_SCALE);
      if (amount > 0.01) {
        const column = Math.floor(x - (simulation.scroll ?? 0));
        const alpha = VEIL_ALPHA * Math.sqrt(amount) * streak(column, y - (simulation.fallen ?? 0)) * (1 - 0.6 * density);
        rgb = mix(rgb, mix(RAIN_GREY, skyColor(altitude), 0.3), alpha);
      }
    }
    if (y === height - 1 && puddle[x] > 0.02 + dither * 0.2) rgb = PUDDLE;
    pixels.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  }
  return pixels;
}
