/*
 * Purpose: The one sun path every cloud simulator experiment with a sun follows: a
 *   figure-eight (a 1:2 Lissajous curve, like a sideways analemma) of sun azimuth and
 *   elevation over time, so the sun is in the same place whichever experiment is showing.
 * Consumers: core/host.js (the shared clock drives it), experiment modules such as
 *   ../sunset-experiment.js (each maps azimuth and elevation into its own picture), and
 *   sun-path.test.js.
 * Dependencies: none (pure).
 */

// One loop of the eight. Azimuth swings once side to side per loop; elevation rises and
// dips twice, so the sun sets and rises once in each lobe and the lobes cross at
// (0°, `elevationMid`) halfway through and at the start.
//   phase   = time / period                      (only the fraction matters)
//   azimuth = azimuthSwing · sin(2π · phase)    degrees, negative is left of center
//   elevation = elevationMid + elevationSwing · sin(4π · phase)   degrees above the horizon
// With the defaults the sun spans −40° to 40° across and −5° to 25° up, so it spends part
// of each lobe just under the horizon (dusk light) and part well up in the sky.
export const SUN_PATH = { period: 90, azimuthSwing: 40, elevationMid: 10, elevationSwing: 15 };

// Fraction of the way around the loop, in [0, 1).
export function sunPhase(time, { period = SUN_PATH.period } = {}) {
  const phase = (time / period) % 1;
  return phase < 0 ? phase + 1 : phase;
}

// The sun at `time` seconds on the shared clock: { phase, azimuth, elevation } in degrees.
export function sunAt(time, path = {}) {
  const { period, azimuthSwing, elevationMid, elevationSwing } = { ...SUN_PATH, ...path };
  const phase = sunPhase(time, { period }), angle = 2 * Math.PI * phase;
  return { phase, azimuth: azimuthSwing * Math.sin(angle), elevation: elevationMid + elevationSwing * Math.sin(2 * angle) };
}

// Clock time (seconds, within one loop) for a phase fraction; the inverse of sunPhase.
export const timeForPhase = (phase, { period = SUN_PATH.period } = {}) => sunPhase(phase * period, { period }) * period;
