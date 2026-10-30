/*
 * Purpose: Browser-independent convection experiment: heated floor, cooled lid,
 *   buoyant overturning, cloud, falling rain, evaporation, a closed water cycle and
 *   optional layering: a warm inversion that caps the convection, or a mixed subcloud
 *   layer under a lifting condensation level (flat cumulus bases); plus the views.
 * Consumers: convection.js and convection-model.test.js.
 * Dependencies: none; values are dimensionless experimental units, not a weather model.
 */

// Live rules. Changing these affects the current run.
export const defaults = {
  buoyancy: 0.012, viscosity: 0.15, drag: 0.004, heating: 0.25, cooling: 0.5,
  diffusion: 0.01, saturation: 1, latentHeat: 0.35, condensation: 0.25,
  evaporation: 0.08, expansion: 0.5, surfaceEvaporation: 0.2, surfaceHumidity: 0.4,
  rainThreshold: 0.005, autoconversion: 0.3, rainEvaporation: 0.03, fallSpeed: 1,
  loading: 0.4, flicker: 0.6, maxSpeed: 0.24,
  // Layering: "none", "inversion" (a warm stable cap, step 1b) or "lcl" (a mixed
  // subcloud layer under flat cloud bases, step 1c). The old `inversion` boolean still works.
  layering: "lcl", lclHeight: 0.35, lclExpansion: 1, lclMixing: 0.05, lclEvaporation: 0.3,
  lclMoisture: 2,
  inversionHeight: 0.6, inversionDepth: 0.1, inversionBase: 0.4, inversionStrength: 0.35,
  inversionRate: 0.02,
  // Drawing only (Sunset view): "cumulus" shaped cloud or "raw" cloud water, and frayed edges.
  cloudStyle: "cumulus", feather: true,
  // Pixel art: a banded sky, a few hard-stepped cloud shades, dithered edges and rain.
  pixelArt: true
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

export function createConvection({ width = 64, height = 48, seed = 42, water = 0.11 } = {}) {
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
    y: nextRandom(simulation) * height, r: (4 + nextRandom(simulation) * 8) * gridScale(width), a: (nextRandom(simulation) - 0.5) * 0.5 }));
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

// Pixel size relative to the original 128-wide grid. Lengths and speeds counted in pixels
// (speed limit, rain fall, blur and noise radii, sun path) scale by it, so a coarser
// grid behaves and looks like the same box with bigger pixels.
export const gridScale = width => width / 128;
// Mean of each row of a field (the horizontal-mean sounding).
function rowMeansOf(field, width, height) {
  const means = new Float64Array(height);
  for (let y = 0; y < height; y++) { let sum = 0; for (let x = 0; x < width; x++) sum += field[y * width + x]; means[y] = sum / width; }
  return means;
}
// Vapor capacity of pixel i. In LCL mode it is judged at the row's mean temperature, the
// steeper `lclExpansion` and the moister `lclMoisture` air mass (see step 1c); otherwise
// at the pixel's own temperature.
function capacityAt(i, temperature, rowMean, rules, lcl, width, height) {
  return lcl ? saturation(rowMean[Math.floor(i / width)], altitudeOf(i, width, height), rules.saturation * rules.lclMoisture, rules.lclExpansion)
    : saturation(temperature[i], altitudeOf(i, width, height), rules.saturation, rules.expansion);
}
// Which layering a run uses: `layering`, else the older `inversion` boolean, else the default.
export function layeringOf(options = {}) {
  if (options.layering) return options.layering;
  if (options.inversion !== undefined) return options.inversion ? "inversion" : "none";
  return defaults.layering;
}

// Environmental temperature the inversion holds above `inversionHeight`; undefined below,
// where only the floor and lid set the temperature.
export function inversionTarget(altitude, rules = defaults) {
  if (altitude < rules.inversionHeight) return undefined;
  const t = Math.min(1, (altitude - rules.inversionHeight) / rules.inversionDepth);
  return rules.inversionBase + rules.inversionStrength * t * t * (3 - 2 * t);
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
  //    Puddles evaporate until floor vapor reaches `surfaceHumidity × saturation`. In LCL
  //    mode the target is instead the vapor that saturates at `lclHeight` (a surface
  //    dewpoint, see 1c), and air moister than that gives water back to the puddle as dew.
  const layering = layeringOf(options), lcl = layering === "lcl";
  const lclRow = Math.round((1 - rules.lclHeight) * (height - 1));
  const surfaceTarget = lcl
    ? saturation(rowMeansOf(temperature, width, height)[lclRow], rules.lclHeight, rules.saturation * rules.lclMoisture, rules.lclExpansion)
    : rules.surfaceHumidity * rules.saturation;
  for (let x = 0; x < width; x++) {
    const floor = (height - 1) * width + x;
    const target = 1 + rules.flicker * (nextRandom(simulation) - 0.5);
    temperature[floor] += rules.heating * (target - temperature[floor]);
    temperature[x] += rules.cooling * (0 - temperature[x]);
    const deficit = surfaceTarget - vapor[floor];
    const lift = Math.min(simulation.pool[x], rules.surfaceEvaporation * (lcl ? deficit : Math.max(0, deficit)));
    simulation.pool[x] -= lift; vapor[floor] += lift; temperature[floor] -= rules.latentHeat * lift;
  }

  // 1b. Inversion. Sinking air in the real atmosphere warms as it is compressed, so the
  //     air aloft can be warmer than the air under it (a subsidence or trade-wind
  //     inversion). Above `inversionHeight` the air is relaxed at `inversionRate` per tick
  //     toward a sounding that warms by `inversionStrength` over `inversionDepth`, then
  //     stays warm up to the lid. A plume from the mixed layer below arrives cooler than
  //     the air beside it, so it stops rising and spreads sideways under the layer. The
  //     sounding starts at `inversionBase`, cooler than the mixed layer, which stands in
  //     for the cloud-top cooling that keeps a real capped layer overturning.
  if (layering === "inversion") {
    for (let y = 1; y < height - 1; y++) {
      const target = inversionTarget(1 - y / (height - 1), rules);
      if (target === undefined) continue;
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        temperature[i] += rules.inversionRate * (target - temperature[i]);
      }
    }
  }

  // 1c. Lifting condensation level. Real fair-weather cumulus sit on a well-mixed subcloud
  //     layer: turbulence gives it one moisture content, and a thermal's warmth is a
  //     fraction of a degree against a dewpoint spread of several, so every parcel
  //     cools to saturation at nearly the same height (about 125 m per °C of spread)
  //     and the cloud bases line up flat. Here: (a) capacity is judged at each row's
  //     mean temperature (`capacityAt`), since the toy's plumes are far warmer than
  //     real thermals and would otherwise saturate higher than the air around them;
  //     (b) scanning up from the floor while the layer's mean vapor is below the next
  //     row's capacity finds the mixed layer, and its vapor is relaxed toward the
  //     layer's mean at `lclMixing` per tick (water is only moved, never made); (c) the
  //     steeper `lclExpansion` lapse makes the change from clear to cloudy quick, and
  //     faster `lclEvaporation` dries cloud that sinks below the base or mixes out
  //     at a top; (d) `lclMoisture` doubles the capacity, a moist air mass like the
  //     tropical trades, where the clouds hold enough water to rain. With dry air the
  //     rain all evaporates in the clear layer under the bases (virga). Above the base, condensation warms the rising air and keeps it buoyant.
  if (lcl) {
    let q = 0, rows = 0, top = height - 1;
    const rowMean = rowMeansOf(temperature, width, height);
    for (let y = height - 1; y >= 1; y--) {
      let rowVapor = 0;
      for (let x = 0; x < width; x++) rowVapor += vapor[y * width + x];
      if (rows > 0 && saturation(rowMean[y], 1 - y / (height - 1), rules.saturation * rules.lclMoisture, rules.lclExpansion) <= q / rows) break;
      q += rowVapor / width; rows++; top = y;
    }
    q /= rows;
    for (let i = top * width; i < size; i++) vapor[i] += rules.lclMixing * (q - vapor[i]);
  }

  // 2. Phase changes. Supersaturated vapor condenses into cloud (`liquid`) and warms the
  //    air; cloud, then rain, in subsaturated air evaporates and cools it. Cloud above
  //    `rainThreshold` collects into rain drops at `autoconversion` per tick. Total water is unchanged.
  const rowMean = rowMeansOf(temperature, width, height);
  const evaporation = lcl ? rules.lclEvaporation : rules.evaporation;
  for (let i = 0; i < size; i++) {
    const capacity = capacityAt(i, temperature, rowMean, rules, lcl, width, height);
    const excess = vapor[i] - capacity;
    const change = excess > 0 ? rules.condensation * excess : -Math.min(liquid[i], evaporation * -excess);
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
  const maxSpeed = rules.maxSpeed * gridScale(width);
  if (fastest > maxSpeed) {
    const scale = maxSpeed / fastest;
    for (let k = 0; k < u.length; k++) u[k] *= scale;
    for (let k = 0; k < v.length; k++) v[k] *= scale;
  }
  simulation.speed = Math.min(fastest, maxSpeed);

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
    const falling = rain[i] * Math.min(1, rules.fallSpeed * gridScale(width));
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
// - Cloud water pressed under warmer air (CAP_SCALE warmer, CAP_REACH pixels above) is
//   also solid: a flat layer spread under the inversion, as stratocumulus are.
// - A fixed smooth pattern scallops the edge into rounded lobes (see `billows`).
// - Feathered edges: a wider blur of the same puff field, frayed by fractal noise (see
//   `fray`), adds a translucent fringe that fades out over several pixels around the
//   solid core. Shading and shadows use the core alone.
// - The "raw" style skips all of this and draws the cloud water itself as smoke.
export const CLOUD_DEPTH_SCALE = 0.004, WARM_SCALE = 0.06, CLOUD_BLUR = 3, CLOUD_EDGE = [0.25, 0.42], BILLOW = 0.45;
// Capped cloud: CAP_SCALE warmer air CAP_REACH pixels above makes cloud water solid.
export const CAP_SCALE = 0.1, CAP_REACH = 4;
// Rising cloud: an updraft of RISE_SCALE pixels per tick makes cloud water solid.
export const RISE_SCALE = 0.05;
// Feather is cut back on a cloud's underside, judged UNDERSIDE_REACH pixels above and below.
export const UNDERSIDE_REACH = 3;
// Feathered edges: fringe threshold range, noise strength and fringe opacity.
export const FEATHER_EDGE = [0.04, 0.4], FEATHER = 1.4, FEATHER_OPACITY = 0.75, FEATHER_BLUR = 4.5;
// Air near saturation adds a faint haze from 90% relative humidity (at most HAZE_OPACITY).
export const HAZE_START = 0.9, HAZE_OPACITY = 0.12, VEIL = 0.12;
// Raw cloud water style: haze optical depth at saturation, and shadowing per unit depth.
const RAW_HAZE_DEPTH = 0.15, RAW_SHADOWING = 0.1;
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
// its row average; `capping` (optional) is how much warmer the air just above is.
// Puff strength is cloud water toward CLOUD_DEPTH_SCALE times the larger of warmth
// toward WARM_SCALE (a rising cumulus) and capping toward CAP_SCALE (cloud pressed
// flat under warmer air, as stratocumulus are under an inversion). Lobes scale it by
// up to ±BILLOW before the threshold. With `feather`, the edge frays instead: fractal
// noise pushes the threshold down to FEATHER_EDGE[0] in places and up in others, so
// wisps reach out and fade over several pixels while the core stays solid.
// Returns the solid `core` (used for shading) and the drawn `cover` (core plus fringe).
export function cloudLayers(cloud, buoyancy, width, height, { capping, rising, feather = false } = {}) {
  const g = gridScale(width);
  const puff = cloud.map((water, i) => clip01(water / CLOUD_DEPTH_SCALE)
    * Math.max(clip01(buoyancy[i] / WARM_SCALE), capping ? clip01(capping[i] / CAP_SCALE) : 0,
      rising ? clip01(rising[i] / (RISE_SCALE * g)) : 0));
  const lobes = billows(width, height);
  const core = blur(puff, width, height, CLOUD_BLUR * g).map((value, i) => smoothstep(CLOUD_EDGE[0], CLOUD_EDGE[1], value * (1 + BILLOW * lobes[i])));
  if (!feather) return { core, cover: core };
  // The fringe comes from a wider blur, so it reaches FEATHER_BLUR pixels out, and is
  // thinned by the noise into wisps that fade in gently (squared) toward the core.
  const wisps = fray(width, height);
  // Under a cloud (solid core above, none below) the fringe is cut back, so the base stays crisp.
  const reach = Math.max(1, Math.round(UNDERSIDE_REACH * g)) * width;
  const cover = blur(puff, width, height, FEATHER_BLUR * g).map((value, i) => {
    const under = clip01((i >= reach ? core[i - reach] : 0) - (i + reach < core.length ? core[i + reach] : 0));
    return Math.max(core[i], (1 - under) * FEATHER_OPACITY * smoothstep(FEATHER_EDGE[0], FEATHER_EDGE[1], value * (1 + FEATHER * wisps[i])) ** 2);
  });
  return { core, cover };
}
// The drawn cover alone.
export const cloudCover = (cloud, buoyancy, width, height, options) => cloudLayers(cloud, buoyancy, width, height, options).cover;
// Upward speed at each pixel, pixels per tick, from the stream function at its corners.
export function rising({ stream, width, height }) {
  const out = new Float64Array(width * height), columns = width + 1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const top = stream[y * columns + x + 1] - stream[y * columns + x];
    const bottom = stream[(y + 1) * columns + x + 1] - stream[(y + 1) * columns + x];
    out[y * width + x] = (top + bottom) / 2;
  }
  return out;
}
// How much warmer the air CAP_REACH pixels above is than each pixel (0 if colder).
export function capping(temperature, width, height) {
  const out = new Float64Array(temperature.length), reach = Math.max(1, Math.round(CAP_REACH * gridScale(width)));
  for (let y = reach; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    out[i] = Math.max(0, temperature[i - reach * width] - temperature[i]);
  }
  return out;
}
// Smooth value noise, -1..1, in lobes about 6 and 3 pixels across. It depends only on
// position, never on the seed, and is computed once per size. Cloud edges drifting
// through it bulge and pinch like churning cumulus tops.
const noiseCache = new Map();
const hash = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const ease = t => t * t * (3 - 2 * t);
function octave(x, y, size) {
  const fx = x / size, fy = y / size, ix = Math.floor(fx), iy = Math.floor(fy), tx = ease(fx - ix), ty = ease(fy - iy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * tx;
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * tx;
  return 2 * (top + (bottom - top) * ty) - 1;
}
function noise(width, height, name, octaves) {
  const key = `${name}:${width}x${height}`;
  if (noiseCache.has(key)) return noiseCache.get(key);
  const field = new Float64Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const g = gridScale(width);
    field[y * width + x] = octaves.reduce((sum, [weight, size, shift]) => sum + weight * octave(x + shift * g, y + 2 * shift * g, Math.max(1, size * g)), 0);
  }
  noiseCache.set(key, field);
  return field;
}
export const billows = (width, height) => noise(width, height, "billows", [[0.75, 6, 0], [0.25, 3, 17]]);
// Fractal noise, -1..1, from 8-pixel lobes down to 2-pixel wisps, halving the weight
// at each finer scale, for frayed edges.
export const fray = (width, height) => noise(width, height, "fray", [[0.57, 8, 5], [0.29, 4, 23], [0.14, 2, 41]]);
export const haze = relativeHumidity => HAZE_OPACITY * clip01((relativeHumidity - HAZE_START) / (1 - HAZE_START)) ** 2;
// Rain curtains (virga) stay see-through: at most 50% opaque.
export const rainOpacity = rain => 0.5 * clip01(rain / RAIN_SCALE);
// Sky: indigo at the lid, through dusky rose, to gold at the floor. `warmth` (the row
// buoyancy, -1..1) brightens or dims it by up to 10% so the overturning still reads.
const SKY = [[14, 16, 46], [78, 40, 92], [214, 104, 78], [252, 182, 96]];
// Pixel art: sky bands per color step, cloud light levels and altitude tints, and a 4×4
// ordered (Bayer) dither threshold, 0..1, per pixel.
// DITHER_WIDTH is the share of each band, at its edges, that dithers into the next.
const SKY_BANDS = 3, LIGHT_LEVELS = 4, TINT_LEVELS = 3, DITHER_WIDTH = 0.35;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y % 4) * 4 + (x % 4)];
const quantize = (value, levels) => Math.round(clip01(value) * levels) / levels;
export function sunsetSky(altitude, warmth = 0, dither) {
  let depth = clip01(1 - altitude) * (SKY.length - 1);
  // Pixel art: SKY_BANDS flat bands per color step, ordered-dithered where they meet.
  if (dither !== undefined) depth = Math.min(SKY.length - 1, Math.floor(depth * SKY_BANDS + 0.5 + DITHER_WIDTH * (dither - 0.5)) / SKY_BANDS);
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

// Amount of `field` between pixel i (half of its own) and the sun.
function sunPath(field, i, width, height) {
  const x = i % width, y = Math.floor(i / width);
  let path = field[i] / 2;
  for (let k = 1; k <= Math.round(SUN_STEPS * gridScale(width)); k++) {
    // The right wall repeats its edge column, so the wall does not glow.
    const sx = Math.min(width - 1, x + k), sy = Math.round(y + k * SUN_RISE);
    if (sy >= height) break;
    path += field[sy * width + sx];
  }
  return path;
}

export function renderConvection(simulation, view = "sunset", options = {}) {
  const rules = { ...defaults, ...options };
  const { width, height, temperature, vapor, liquid, rain } = simulation;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const rowMeans = rowMeansOf(temperature, width, height), lcl = layeringOf(options) === "lcl";
  const clip = value => Math.max(0, Math.min(1, value));
  // Sunset: cloud cover, a dome-shaped thickness for shading, and sunlight reaching each pixel.
  let coverOf, coreOf, reachOf, slopeOf, depthOf;
  const raw = rules.cloudStyle === "raw";
  if (view === "sunset" && raw) {
    // Raw cloud water (the first sunset mapping): each pixel's own optical depth,
    // shadowed by the depth crossed toward the sun. Reads as smoke; kept to compare.
    const size = temperature.length;
    depthOf = new Float64Array(size); reachOf = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const relative = vapor[i] / capacityAt(i, temperature, rowMeans, rules, lcl, width, height);
      const near = clip((relative - HAZE_START) / (1 - HAZE_START));
      depthOf[i] = Math.max(0, liquid[i]) / CLOUD_DEPTH_SCALE + RAW_HAZE_DEPTH * near * near;
    }
    for (let i = 0; i < size; i++) reachOf[i] = Math.exp(-RAW_SHADOWING / gridScale(width) * sunPath(depthOf, i, width, height));
  } else if (view === "sunset") {
    const size = temperature.length;
    const buoyancy = temperature.map((t, i) => t - rowMeans[Math.floor(i / width)]);
    const layers = cloudLayers(liquid, buoyancy, width, height, { capping: capping(temperature, width, height), rising: rising(simulation), feather: rules.feather });
    coverOf = layers.cover; coreOf = layers.core;
    // Thickness: cover blurred wide (DOME_BLUR) plus tight (BILLOW_BLUR, nudged by the
    // lobes), so it is highest deep inside a mass and falls toward its edges, like
    // rounded puffs seen from the side. Its slope gives a surface facing toward or
    // away from the sun; `reach` is the sunlight left after the cover in between.
    const g = gridScale(width), wide = blur(layers.core, width, height, DOME_BLUR * g), tight = blur(layers.core, width, height, BILLOW_BLUR * g);
    const lobes = billows(width, height);
    const thickness = wide.map((value, i) => value + tight[i] * (1 + LOBE_RELIEF * lobes[i]));
    reachOf = new Float64Array(size); slopeOf = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const x = i % width, y = Math.floor(i / width);
      const dx = thickness[y * width + Math.min(width - 1, x + 1)] - thickness[y * width + Math.max(0, x - 1)];
      const dy = thickness[Math.min(height - 1, y + 1) * width + x] - thickness[Math.max(0, y - 1) * width + x];
      slopeOf[i] = facing(dx / 2 / g, dy / 2 / g);
      reachOf[i] = Math.exp(-SHADOWING / g * sunPath(coreOf, i, width, height));
    }
  }
  for (let i = 0; i < temperature.length; i++) {
    const t = clip(temperature[i]);
    const cloud = clip(liquid[i] / 0.04), drops = clip(rain[i] / RAIN_SCALE);
    const shower = clip((rain[i] - LAMP_RAIN_FLOOR) / (RAIN_SCALE * 0.75));
    const wet = (rgb, amount) => rgb.map((channel, c) => channel + (RAIN_COLOR[c] - channel) * amount);
    let rgb;
    if (view === "sunset" && raw) {
      const altitude = altitudeOf(i, width, height);
      const sky = sunsetSky(altitude, (temperature[i] - rowMeans[Math.floor(i / width)]) / 0.15);
      const light = cloudColor(reachOf[i], altitude);
      rgb = mix(sky, light, 1 - Math.exp(-depthOf[i]));
      rgb = mix(rgb, mix(light, sky, 0.35), rainOpacity(rain[i]));
    } else if (view === "sunset") {
      const altitude = altitudeOf(i, width, height);
      const warmth = (temperature[i] - rowMeans[Math.floor(i / width)]) / 0.15;
      const relative = vapor[i] / capacityAt(i, temperature, rowMeans, rules, lcl, width, height);
      const art = rules.pixelArt, d = art ? bayer(i % width, Math.floor(i / width)) : 0;
      const sky = sunsetSky(altitude, art ? 0 : warmth, art ? d : undefined);
      const tint = art ? quantize(altitude, TINT_LEVELS) : altitude;
      const lit = 1.5 * slopeOf[i] * (0.35 + 0.65 * reachOf[i]);
      const light = cloudColor(art ? quantize(lit, LIGHT_LEVELS) : lit, tint);
      // Pixel art: cloud is all or nothing per pixel, the fringe and rain dithered.
      const core = art ? (coreOf[i] > 0.5 ? 1 : 0) : coreOf[i];
      const cover = art ? (coverOf[i] > 0.2 + 0.6 * d ? 1 : 0) : coverOf[i];
      const showers = art ? (rainOpacity(rain[i]) > 0.1 + 0.4 * d ? 0.5 : 0) : rainOpacity(rain[i]);
      // Sky, lit haze near saturation, a thin veil of still cloud water, then the puffs.
      rgb = mix(sky, cloudColor(1, altitude), haze(relative));
      rgb = mix(rgb, cloudColor(0.5, altitude), VEIL * clip(liquid[i] / CLOUD_DEPTH_SCALE));
      // Feathered fringe: thin, so sunlit through (lit by `reach` alone), under the core.
      const fringe = 0.3 + 0.9 * reachOf[i];
      if (coreOf !== coverOf) rgb = mix(rgb, cloudColor(art ? quantize(fringe, LIGHT_LEVELS) : fringe, tint), cover);
      rgb = mix(rgb, light, core);
      // Rain takes the cloud's light, softened toward the sky behind it.
      rgb = mix(rgb, mix(light, sky, 0.35), showers);
    } else if (view === "temperature") rgb = [40 + 205 * t, 95 + 40 * t, 220 - 150 * t];
    else if (view === "buoyancy" || view === "lamp") {
      // Warmer than the row average glows orange; cooler is blue. Clips at ±0.15.
      const a = Math.max(-1, Math.min(1, (temperature[i] - rowMeans[Math.floor(i / width)]) / 0.15));
      rgb = a > 0 ? [17 + 238 * a, 24 + 136 * a, 38 + 30 * a] : [17 - 5 * a, 24 - 116 * a, 38 - 202 * a];
      // Lamp: the buoyancy blobs with only the falling rain drawn over them, so cloud
      // and drizzle do not wash out the blobs.
      if (view === "lamp") rgb = wet(rgb, shower * 0.85);
    } else if (view === "humidity") {
      const relative = vapor[i] / capacityAt(i, temperature, rowMeans, rules, lcl, width, height);
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
