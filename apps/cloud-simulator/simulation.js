/*
 * Purpose: Seed two atmospheric fields and advance a threshold-driven rain experiment.
 * Consumers: app.js and simulation tests.
 * Dependencies: none; values are dimensionless experimental units, not a weather model.
 */
export function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Smooth value noise gives patches rather than independent speckle at every pixel.
function noiseField(width, height, scale, random) {
  const columns = Math.ceil(width / scale) + 1;
  const rows = Math.ceil(height / scale) + 1;
  const knots = Float64Array.from({ length: columns * rows }, random);
  const smooth = value => value * value * (3 - 2 * value);
  return Float64Array.from({ length: width * height }, (_, index) => {
    const x = index % width / scale;
    const y = Math.floor(index / width) / scale;
    const left = Math.floor(x);
    const top = Math.floor(y);
    const sx = smooth(x - left);
    const sy = smooth(y - top);
    const a = knots[top * columns + left] * (1 - sx) + knots[top * columns + left + 1] * sx;
    const b = knots[(top + 1) * columns + left] * (1 - sx) + knots[(top + 1) * columns + left + 1] * sx;
    return a * (1 - sy) + b * sy;
  });
}

export function createSimulation({ width = 128, height = 96, seed = 42,
  moisture = 1.7, temperatureNoise = 0.35, patchSize = 8 } = {}) {
  const random = randomFromSeed(seed);
  const thermalNoise = noiseField(width, height, patchSize * 2, random);
  const waterNoise = noiseField(width, height, patchSize, random);
  const temperature = new Float64Array(width * height);
  const water = new Float64Array(width * height);
  for (let i = 0; i < water.length; i++) {
    const altitude = 1 - Math.floor(i / width) / (height - 1);
    temperature[i] = Math.max(0, Math.min(1, 1 - altitude + (thermalNoise[i] - 0.5) * temperatureNoise));
    // A moist upper band feeds initially dry lower columns; no ongoing water source.
    water[i] = moisture * Math.pow(waterNoise[i], 2) * (altitude > 0.62 ? 3 : 0.12);
  }
  return { width, height, temperature, water, tick: 0, drained: 0 };
}

export function threshold(temperature, baseThreshold) {
  return baseThreshold * (0.55 + temperature * 0.9);
}

export function step(simulation, { transfer = 0.65, baseThreshold = 0.4 } = {}) {
  const { width, height, water, temperature } = simulation;
  const next = water.slice();
  for (let i = 0; i < water.length; i++) {
    if (water[i] <= threshold(temperature[i], baseThreshold)) continue;
    // Transfer a fraction of the whole wet cell to allow cascading streaks.
    const falling = water[i] * transfer;
    next[i] -= falling;
    if (i < width * (height - 1)) next[i + width] += falling;
    else simulation.drained += falling;
  }
  simulation.water = next;
  simulation.tick++;
}
