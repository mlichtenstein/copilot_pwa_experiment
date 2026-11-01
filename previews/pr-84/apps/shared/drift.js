/*
 * Purpose: Drift mode: every slider wanders slowly on its own Gaussian random walk (Brownian
 *   motion) that can roam its whole range, so a visitor can press play, leave it and come back to new
 *   settings. The walk itself (createDrift) is pure and deterministic for a given seed;
 *   bindDrift drives range inputs with it.
 * Consumers: ../cloud-simulator/core/host.js (the Drift checkbox on every experiment page);
 *   drift.test.js.
 * Dependencies: none; bindDrift needs DOM <input type="range"> elements.
 */

// Each value u (in units of its slider's range, 0 to 1) follows a pure random walk
//   du = rate · N(0, 1) · sqrt(dt)
// with no pull back toward any value, so it can roam the whole range. After t seconds it has
// typically moved rate · sqrt(t) of the range: with rate 0.05, about a fifth in 16 s, half in
// 100 s and a full range in about 7 minutes. Steps that would leave the range reflect off its
// ends (the only limits), so values stay valid and never stick at a limit.
// The Drift speed slider multiplies the rate, from a tenth to ten times (1× in the middle of
// its log scale); 4× crosses a range about 16 times sooner.
export const DRIFT = { rate: 0.05, speed: { min: 0.1, max: 10, default: 1 } };

// Small seeded generator (uniform in [0, 1)) so Drift and Randomize never touch Math.random
// or a simulation's own seed.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => (state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296;
}

// ranges: { id: { min, max } }; values: { id: starting value }.
export function createDrift(ranges, values = {}, { seed = 1, rate = DRIFT.rate } = {}) {
  const random = seededRandom(seed), position = {};
  let speed = DRIFT.speed.default;
  let spare = null;
  // Box-Muller: two uniform draws make two standard normals.
  const normal = () => {
    if (spare !== null) { const value = spare; spare = null; return value; }
    const u = Math.max(1e-12, random()), angle = 2 * Math.PI * random(), radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
  const unit = (id, value) => {
    const { min, max } = ranges[id];
    return max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  };
  const value = id => ranges[id].min + position[id] * (ranges[id].max - ranges[id].min);
  const drift = {
    // A person set this value: the walk continues from it.
    set(id, next) { position[id] = unit(id, next); },
    value,
    values: () => Object.fromEntries(Object.keys(ranges).map(id => [id, value(id)])),
    // The Drift speed multiplier (clamped to DRIFT.speed's range).
    setSpeed(next) { speed = Math.min(DRIFT.speed.max, Math.max(DRIFT.speed.min, Number(next) || DRIFT.speed.default)); },
    get speed() { return speed; },
    // Advance every walk by dt seconds; returns the new values.
    step(dt) {
      const kick = rate * speed * Math.sqrt(dt);
      for (const id of Object.keys(ranges)) {
        let u = position[id] + kick * normal();
        // Reflect off the ends (twice covers any step shorter than the range).
        for (let k = 0; k < 2; k++) { if (u < 0) u = -u; if (u > 1) u = 2 - u; }
        position[id] = Math.max(0, Math.min(1, u));
      }
      return drift.values();
    }
  };
  for (const id of Object.keys(ranges)) drift.set(id, values[id] ?? (ranges[id].min + ranges[id].max) / 2);
  return drift;
}

// Drive range inputs with a drift walk. `step(dt)` moves every slider (snapped to its own
// step for display, while the walk keeps its exact position) and calls onChange(slider) for
// each; a person dragging a slider takes it over, and it wanders on from where they leave it.
// Disabled sliders hold still.
export function bindDrift(sliders, { seed = 1, onChange = () => {}, ...options } = {}) {
  const ranges = Object.fromEntries(sliders.map(slider => [slider.id, { min: Number(slider.min), max: Number(slider.max) }]));
  const walk = createDrift(ranges, Object.fromEntries(sliders.map(slider => [slider.id, Number(slider.value)])), { seed, ...options });
  // Sliders a person is holding are left alone until they let go.
  const held = new Set();
  for (const slider of sliders) {
    slider.addEventListener("input", event => { if (event.isTrusted) walk.set(slider.id, Number(slider.value)); });
    slider.addEventListener("pointerdown", () => held.add(slider));
    for (const type of ["pointerup", "pointercancel", "change"]) slider.addEventListener(type, () => { held.delete(slider); walk.set(slider.id, Number(slider.value)); });
  }
  return {
    walk,
    // Restart every walk from the sliders' current values (after loading settings or
    // turning drift on).
    sync() { for (const slider of sliders) walk.set(slider.id, Number(slider.value)); },
    step(dt) {
      const values = walk.step(dt);
      for (const slider of sliders) {
        // Held or disabled (greyed out because it does nothing right now): stays put.
        if (held.has(slider) || slider.disabled) { walk.set(slider.id, Number(slider.value)); continue; }
        slider.value = values[slider.id]; onChange(slider);
      }
    }
  };
}
