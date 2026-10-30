/*
 * Purpose: Browser-independent convection experiment: heated floor, cooled lid,
 *   buoyant overturning, cloud, falling rain, evaporation and a closed water cycle.
 * Consumers: convection.js and convection-model.test.js.
 * Dependencies: none; values are dimensionless experimental units, not a weather model.
 */

// Live rules. Changing these affects the current run.
export const defaults = {
  buoyancy: 0.012, viscosity: 0.15, drag: 0.004, heating: 0.25, cooling: 0.5,
  diffusion: 0.01, saturation: 1, latentHeat: 0.35, condensation: 0.25,
  evaporation: 0.08, expansion: 0.5, surfaceEvaporation: 0.2, surfaceHumidity: 0.4,
  rainThreshold: 0.005, autoconversion: 0.3, rainEvaporation: 0.03, fallSpeed: 1,
  loading: 0.4, flicker: 0.6, maxSpeed: 0.24
};

// Fixed slope of the saturation curve: cold air holds about e^-3 ≈ 5% of hot air.
export const SATURATION_SLOPE = 3;
const SOLVER_ITERATIONS = 24;
const OVER_RELAXATION = 1.7;

// Same linear congruential generator as simulation.js, with its state kept in the
// simulation so a run stays JSON-serializable and repeatable from any tick.
function nextRandom(simulation) {
  simulation.randomState = (Math.imul(1664525, simulation.randomState) + 1013904223) >>> 0;
  return simulation.randomState / 4294967296;
}

// `temperature` is the buoyancy temperature a parcel keeps as it moves. Rising air
// also expands and cools, so its capacity drops with altitude by `expansion`.
export function saturation(temperature, altitude, scale = defaults.saturation, expansion = defaults.expansion) {
  return scale * Math.exp(SATURATION_SLOPE * (temperature - 1 - expansion * altitude));
}

const altitudeOf = (index, width, height) => 1 - Math.floor(index / width) / (height - 1);

export function createConvection({ width = 128, height = 96, seed = 42, water = 0.11 } = {}) {
  const size = width * height;
  const simulation = {
    width, height, tick: 0, randomState: seed >>> 0,
    temperature: new Float64Array(size), vapor: new Float64Array(size), liquid: new Float64Array(size),
    rain: new Float64Array(size),
    pool: new Float64Array(width), vorticity: new Float64Array(size),
    stream: new Float64Array((width + 1) * (height + 1)), speed: 0
  };
  // Hot floor, cold lid and a linear profile between, plus a few seeded warm and cool
  // bubbles so the first plumes start within seconds instead of waiting for speckle to grow.
  const bubbles = Array.from({ length: 10 }, () => ({ x: nextRandom(simulation) * width,
    y: nextRandom(simulation) * height, r: 4 + nextRandom(simulation) * 8, a: (nextRandom(simulation) - 0.5) * 0.5 }));
  for (let i = 0; i < size; i++) {
    const x = i % width, y = Math.floor(i / width);
    const bump = bubbles.reduce((sum, b) => sum + b.a * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (b.r * b.r)), 0);
    simulation.temperature[i] = Math.min(1, Math.max(0, 1 - altitudeOf(i, width, height) + bump));
  }
  // Air starts at half its capacity; the rest of the water (mean `water` per cell)
  // sits in floor puddles, ready to evaporate into the hot bottom row.
  let airborne = 0;
  for (let i = 0; i < size; i++) {
    airborne += simulation.vapor[i] = 0.5 * saturation(simulation.temperature[i], altitudeOf(i, width, height), 1, defaults.expansion);
  }
  const scale = Math.min(1, water * size / airborne);
  for (let i = 0; i < size; i++) simulation.vapor[i] *= scale;
  simulation.pool.fill(Math.max(0, water * size - airborne * scale) / width);
  return simulation;
}

export function totalWater(simulation) {
  let sum = 0;
  for (let i = 0; i < simulation.vapor.length; i++) sum += simulation.vapor[i] + simulation.liquid[i] + simulation.rain[i];
  for (const puddle of simulation.pool) sum += puddle;
  return sum;
}

// Conservative donor-cell transport across faces; what leaves one cell enters its neighbor.
function advect(field, u, v, width, height) {
  const next = field.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x, speed = u[y * (width - 1) + x];
      const flux = speed * (speed > 0 ? field[i] : field[i + 1]);
      next[i] -= flux; next[i + 1] += flux;
    }
  }
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, speed = v[y * width + x];
      const flux = speed * (speed > 0 ? field[i] : field[i + width]);
      next[i] -= flux; next[i + width] += flux;
    }
  }
  return next;
}

// Five-point diffusion with closed walls: exchanges between neighbors conserve the total.
function diffuse(field, rate, width, height) {
  if (rate <= 0) return field;
  const next = field.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x < width - 1) { const f = rate * (field[i + 1] - field[i]); next[i] += f; next[i + 1] -= f; }
      if (y < height - 1) { const f = rate * (field[i + width] - field[i]); next[i] += f; next[i + width] -= f; }
    }
  }
  return next;
}

export function step(simulation, options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height } = simulation;
  const size = width * height;
  let { temperature, vapor, liquid, rain, vorticity } = simulation;
  const stream = simulation.stream;

  // 1. Heated floor and cooled lid. The floor target flickers per column from the seed.
  for (let x = 0; x < width; x++) {
    const floor = (height - 1) * width + x;
    const target = 1 + rules.flicker * (nextRandom(simulation) - 0.5);
    temperature[floor] += rules.heating * (target - temperature[floor]);
    temperature[x] += rules.cooling * (0 - temperature[x]);
    // Puddles evaporate until floor vapor reaches `surfaceHumidity × saturation`, cooling the air.
    const deficit = rules.surfaceHumidity * rules.saturation - vapor[floor];
    const lift = Math.min(simulation.pool[x], Math.max(0, rules.surfaceEvaporation * deficit));
    simulation.pool[x] -= lift; vapor[floor] += lift; temperature[floor] -= rules.latentHeat * lift;
  }

  // 2. Phase changes. Supersaturated vapor condenses into cloud (`liquid`) and warms the
  //    air; cloud, then rain, in subsaturated air evaporates and cools it. Cloud above
  //    `rainThreshold` collects into rain drops at `autoconversion` per tick. Total water is unchanged.
  for (let i = 0; i < size; i++) {
    const capacity = saturation(temperature[i], altitudeOf(i, width, height), rules.saturation, rules.expansion);
    const excess = vapor[i] - capacity;
    const change = excess > 0 ? rules.condensation * excess : -Math.min(liquid[i], rules.evaporation * -excess);
    vapor[i] -= change; liquid[i] += change;
    temperature[i] += rules.latentHeat * change;
    const deficit = capacity - vapor[i];
    const drying = deficit > 0 ? Math.min(rain[i], rules.rainEvaporation * deficit) : 0;
    rain[i] -= drying; vapor[i] += drying;
    temperature[i] -= rules.latentHeat * drying;
    const drops = rules.autoconversion * Math.max(0, liquid[i] - rules.rainThreshold);
    liquid[i] -= drops; rain[i] += drops;
  }

  // 3. Buoyancy torque: air lighter than its side neighbors (warm, little water) turns upward.
  const nextVorticity = vorticity.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const left = x > 0 ? i - 1 : i, right = x < width - 1 ? i + 1 : i;
      const lightness = j => temperature[j] - rules.loading * (liquid[j] + rain[j]);
      const slope = (lightness(right) - lightness(left)) / (right - left);
      nextVorticity[i] = (vorticity[i] - rules.buoyancy * slope) * (1 - rules.drag);
    }
  }
  vorticity = diffuse(nextVorticity, rules.viscosity, width, height);

  // 4. Stream function: solve laplacian(stream) = -vorticity at cell corners by
  //    over-relaxed sweeps from the previous tick's answer. Walls keep stream = 0.
  const columns = width + 1;
  for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration++) {
    for (let y = 1; y < height; y++) {
      for (let x = 1; x < width; x++) {
        const c = y * columns + x;
        const w = (vorticity[(y - 1) * width + x - 1] + vorticity[(y - 1) * width + x]
          + vorticity[y * width + x - 1] + vorticity[y * width + x]) / 4;
        const target = (stream[c - 1] + stream[c + 1] + stream[c - columns] + stream[c + columns] + w) / 4;
        stream[c] += OVER_RELAXATION * (target - stream[c]);
      }
    }
  }

  // 5. Face velocities from stream differences are exactly divergence-free.
  //    u: rightward across vertical faces; v: downward across horizontal faces.
  const u = new Float64Array((width - 1) * height), v = new Float64Array(width * (height - 1));
  let fastest = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width - 1; x++) {
    const value = stream[(y + 1) * columns + x + 1] - stream[y * columns + x + 1];
    u[y * (width - 1) + x] = value; fastest = Math.max(fastest, Math.abs(value));
  }
  for (let y = 0; y < height - 1; y++) for (let x = 0; x < width; x++) {
    const value = -(stream[(y + 1) * columns + x + 1] - stream[(y + 1) * columns + x]);
    v[y * width + x] = value; fastest = Math.max(fastest, Math.abs(value));
  }
  // A speed limit keeps every cell's outflow below its contents (positive, stable transport).
  if (fastest > rules.maxSpeed) {
    const scale = rules.maxSpeed / fastest;
    for (let k = 0; k < u.length; k++) u[k] *= scale;
    for (let k = 0; k < v.length; k++) v[k] *= scale;
  }
  simulation.speed = Math.min(fastest, rules.maxSpeed);

  // 6. Carry heat, vapor, cloud, rain and spin with the flow; heat also diffuses a little.
  temperature = diffuse(advect(temperature, u, v, width, height), rules.diffusion, width, height);
  vapor = advect(vapor, u, v, width, height);
  liquid = advect(liquid, u, v, width, height);
  rain = advect(rain, u, v, width, height);
  vorticity = advect(vorticity, u, v, width, height);

  // 7. Rain also falls through the air, `fallSpeed` pixels per tick (faster than the
  //    strongest updraft), like the rain study. Drops leaving the bottom row collect in
  //    floor puddles that evaporate again (step 1): nothing drains, so the cycle can run
  //    indefinitely.
  const fallen = rain.slice();
  for (let i = 0; i < size; i++) {
    const falling = rain[i] * rules.fallSpeed;
    fallen[i] -= falling;
    if (i < size - width) fallen[i + width] += falling;
    else simulation.pool[i - (size - width)] += falling;
  }

  Object.assign(simulation, { temperature, vapor, liquid, rain: fallen, vorticity });
  simulation.tick++;
}

// Fixed color scales so a view never rescales itself to fake motion. Rain is drawn in
// pale cyan, full strength at `RAIN_SCALE`, so falling streaks stand out from gray cloud.
// The lamp view skips drizzle below `LAMP_RAIN_FLOOR` so it cannot veil the blobs.
export const RAIN_SCALE = 0.008, LAMP_RAIN_FLOOR = 0.0015;
const RAIN_COLOR = [175, 235, 255];

// Sunset view mapping, kept pure so it can be tested apart from the simulation.
// Drawn as-is, the simulated cloud water reads as smoke: the flow stretches it into thin
// streamers, and the cold upper half holds a nearly uniform deck of it. So the view
// derives the visible cloud instead (the simulation itself is unchanged):
// - Solid cloud is cloudy air that is still buoyant, i.e. a rising convective puff, as
//   cumulus are. Still, non-buoyant cloud water shows only as a thin VEIL.
// - That puff field is blurred by CLOUD_BLUR pixels, so filaments thinner than that fade
//   and masses round off, and a soft threshold (smoothstep over CLOUD_EDGE) makes it an
//   opaque body with a defined edge a pixel or two wide.
// - A fixed smooth pattern scallops the edge into rounded lobes (see `billows`).
export const CLOUD_DEPTH_SCALE = 0.004, WARM_SCALE = 0.06, CLOUD_BLUR = 3, CLOUD_EDGE = [0.25, 0.42], BILLOW = 0.45;
// Air near saturation adds a faint haze from 90% relative humidity (at most HAZE_OPACITY).
export const HAZE_START = 0.9, HAZE_OPACITY = 0.12, VEIL = 0.12;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clip01 = value => Math.max(0, Math.min(1, value));
const smoothstep = (low, high, value) => { const t = clip01((value - low) / (high - low)); return t * t * (3 - 2 * t); };
// Separable Gaussian blur with standard deviation `radius` pixels; edges repeat.
export function blur(field, width, height, radius) {
  const reach = Math.ceil(3 * radius), weights = new Float64Array(2 * reach + 1);
  for (let k = -reach; k <= reach; k++) weights[k + reach] = Math.exp(-(k * k) / (2 * radius * radius));
  const total = weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < weights.length; k++) weights[k] /= total;
  // One pass along rows (count = width, stride 1) or columns (count = height, stride width).
  const pass = (source, count, lines, along, across) => {
    const out = new Float64Array(source.length);
    for (let line = 0; line < lines; line++) {
      const base = line * across;
      for (let p = 0; p < count; p++) {
        let sum = 0;
        for (let k = -reach; k <= reach; k++) {
          const q = p + k < 0 ? 0 : p + k >= count ? count - 1 : p + k;
          sum += weights[k + reach] * source[base + q * along];
        }
        out[base + p * along] = sum;
      }
    }
    return out;
  };
  return pass(pass(field, width, height, 1, width), height, width, width, 1);
}
// Cloud cover 0..1 per pixel. `cloud` is cloud water; `buoyancy` is temperature minus
// its row average. Puff strength is cloud water toward CLOUD_DEPTH_SCALE times warmth
// toward WARM_SCALE; lobes scale it by up to ±BILLOW before the threshold.
export function cloudCover(cloud, buoyancy, width, height) {
  const puff = cloud.map((water, i) => clip01(water / CLOUD_DEPTH_SCALE) * clip01(buoyancy[i] / WARM_SCALE));
  const lobes = billows(width, height);
  return blur(puff, width, height, CLOUD_BLUR).map((value, i) => smoothstep(CLOUD_EDGE[0], CLOUD_EDGE[1], value * (1 + BILLOW * lobes[i])));
}
// Smooth value noise, -1..1, in lobes about 6 and 3 pixels across. It depends only on
// position, never on the seed, and is computed once per size. Cloud edges drifting
// through it bulge and pinch like churning cumulus tops.
const billowCache = new Map();
export function billows(width, height) {
  const key = `${width}x${height}`;
  if (billowCache.has(key)) return billowCache.get(key);
  const hash = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const ease = t => t * t * (3 - 2 * t);
  const octave = (x, y, size) => {
    const fx = x / size, fy = y / size, ix = Math.floor(fx), iy = Math.floor(fy), tx = ease(fx - ix), ty = ease(fy - iy);
    const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * tx;
    const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * tx;
    return 2 * (top + (bottom - top) * ty) - 1;
  };
  const field = new Float64Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) field[y * width + x] = 0.75 * octave(x, y, 6) + 0.25 * octave(x + 17, y + 31, 3);
  billowCache.set(key, field);
  return field;
}
export const haze = relativeHumidity => HAZE_OPACITY * clip01((relativeHumidity - HAZE_START) / (1 - HAZE_START)) ** 2;
// Rain curtains (virga) stay see-through: at most 50% opaque.
export const rainOpacity = rain => 0.5 * clip01(rain / RAIN_SCALE);
// Sky: indigo at the lid, through dusky rose, to gold at the floor. `warmth` (the row
// buoyancy, -1..1) brightens or dims it by up to 10% so the overturning still reads.
const SKY = [[14, 16, 46], [78, 40, 92], [214, 104, 78], [252, 182, 96]];
export function sunsetSky(altitude, warmth = 0) {
  const depth = clip01(1 - altitude) * (SKY.length - 1);
  const k = Math.min(SKY.length - 2, Math.floor(depth));
  const rgb = mix(SKY[k], SKY[k + 1], depth - k);
  return rgb.map(channel => channel * (1 + 0.1 * Math.max(-1, Math.min(1, warmth))));
}
// A low sun off the lower right lights cloud from below and the side. `light` 0..1 is
// how lit a cloud pixel is: lit cloud glows peach low down and pink higher up; shaded
// cloud turns grey-violet.
const SHADE = [66, 42, 78];
export function cloudColor(light, altitude) {
  const lit = mix([255, 200, 128], [255, 128, 146], clip01(altitude));
  return mix(SHADE, lit, clip01(light));
}
// Sunlight lost per unit of cloud cover crossed, and the light path: SUN_STEPS pixels
// toward the sun, one column right and SUN_RISE rows down per step.
const SHADOWING = 0.06, SUN_STEPS = 40, SUN_RISE = 0.5, DOME_BLUR = 4, BILLOW_BLUR = 1.5, LOBE_RELIEF = 0.12;
// How squarely a rounded surface with thickness slope (dx, dy) faces the low sun at
// the lower right: 1 head-on, AMBIENT on the far side. DOME_HEIGHT sets how domed it is.
const SUN = [1, 0.5, 0.35].map((c, _, v) => c / Math.hypot(...v)), DOME_HEIGHT = 7, AMBIENT = 0.3;
export function facing(dx, dy) {
  const nx = -DOME_HEIGHT * dx, ny = -DOME_HEIGHT * dy;
  const light = Math.max(0, (nx * SUN[0] + ny * SUN[1] + SUN[2]) / Math.sqrt(nx * nx + ny * ny + 1));
  return AMBIENT + (1 - AMBIENT) * light;
}

export function renderConvection(simulation, view = "sunset", options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height, temperature, vapor, liquid, rain } = simulation;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const rowMeans = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) sum += temperature[y * width + x];
    rowMeans[y] = sum / width;
  }
  const clip = value => Math.max(0, Math.min(1, value));
  // Sunset: cloud cover, a dome-shaped thickness for shading, and sunlight reaching each pixel.
  let coverOf, reachOf, slopeOf;
  if (view === "sunset") {
    const size = temperature.length;
    const buoyancy = temperature.map((t, i) => t - rowMeans[Math.floor(i / width)]);
    coverOf = cloudCover(liquid, buoyancy, width, height);
    // Thickness: cover blurred wide (DOME_BLUR) plus tight (BILLOW_BLUR, nudged by the
    // lobes), so it is highest deep inside a mass and falls toward its edges, like
    // rounded puffs seen from the side. Its slope gives a surface facing toward or
    // away from the sun; `reach` is the sunlight left after the cover in between.
    const wide = blur(coverOf, width, height, DOME_BLUR), tight = blur(coverOf, width, height, BILLOW_BLUR);
    const lobes = billows(width, height);
    const thickness = wide.map((value, i) => value + tight[i] * (1 + LOBE_RELIEF * lobes[i]));
    reachOf = new Float64Array(size); slopeOf = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const x = i % width, y = Math.floor(i / width);
      const dx = thickness[y * width + Math.min(width - 1, x + 1)] - thickness[y * width + Math.max(0, x - 1)];
      const dy = thickness[Math.min(height - 1, y + 1) * width + x] - thickness[Math.max(0, y - 1) * width + x];
      slopeOf[i] = facing(dx / 2, dy / 2);
      let path = coverOf[i] / 2;
      for (let k = 1; k <= SUN_STEPS; k++) {
        // The right wall repeats its edge column, so the wall does not glow.
        const sx = Math.min(width - 1, x + k), sy = Math.round(y + k * SUN_RISE);
        if (sy >= height) break;
        path += coverOf[sy * width + sx];
      }
      reachOf[i] = Math.exp(-SHADOWING * path);
    }
  }
  for (let i = 0; i < temperature.length; i++) {
    const t = clip(temperature[i]);
    const cloud = clip(liquid[i] / 0.04), drops = clip(rain[i] / RAIN_SCALE);
    const shower = clip((rain[i] - LAMP_RAIN_FLOOR) / (RAIN_SCALE * 0.75));
    const wet = (rgb, amount) => rgb.map((channel, c) => channel + (RAIN_COLOR[c] - channel) * amount);
    let rgb;
    if (view === "sunset") {
      const altitude = altitudeOf(i, width, height);
      const warmth = (temperature[i] - rowMeans[Math.floor(i / width)]) / 0.15;
      const relative = vapor[i] / saturation(temperature[i], altitude, rules.saturation, rules.expansion);
      const sky = sunsetSky(altitude, warmth);
      const light = cloudColor(1.5 * slopeOf[i] * (0.35 + 0.65 * reachOf[i]), altitude);
      // Sky, lit haze near saturation, a thin veil of still cloud water, then the puffs.
      rgb = mix(sky, cloudColor(1, altitude), haze(relative));
      rgb = mix(rgb, cloudColor(0.5, altitude), VEIL * clip(liquid[i] / CLOUD_DEPTH_SCALE));
      rgb = mix(rgb, light, coverOf[i]);
      // Rain takes the cloud's light, softened toward the sky behind it.
      rgb = mix(rgb, mix(light, sky, 0.35), rainOpacity(rain[i]));
    } else if (view === "temperature") rgb = [40 + 205 * t, 95 + 40 * t, 220 - 150 * t];
    else if (view === "buoyancy" || view === "lamp") {
      // Warmer than the row average glows orange; cooler is blue. Clips at ±0.15.
      const a = Math.max(-1, Math.min(1, (temperature[i] - rowMeans[Math.floor(i / width)]) / 0.15));
      rgb = a > 0 ? [17 + 238 * a, 24 + 136 * a, 38 + 30 * a] : [17 - 5 * a, 24 - 116 * a, 38 - 202 * a];
      // Lamp: the buoyancy blobs with only the falling rain drawn over them, so cloud
      // and drizzle do not wash out the blobs.
      if (view === "lamp") rgb = wet(rgb, shower * 0.85);
    } else if (view === "humidity") {
      const relative = vapor[i] / saturation(temperature[i], altitudeOf(i, width, height), rules.saturation, rules.expansion);
      const r = clip(relative);
      rgb = relative >= 1 ? [255, 160, 80] : [13 + 140 * r, 24 + 170 * r, 43 + 200 * r];
    } else {
      // Cloud and rain: dark air tinted by vapor, gray-white cloud, pale cyan rain on top.
      const haze = clip(vapor[i] / 0.5);
      const air = [12 + 30 * haze, 22 + 70 * haze, 40 + 100 * haze];
      rgb = wet(air.map((channel, c) => channel + ([200, 206, 216][c] - channel) * cloud * 0.8), drops);
    }
    pixels.set([...rgb, 255], i * 4);
  }
  return pixels;
}
