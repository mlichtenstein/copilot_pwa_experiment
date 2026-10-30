/*
 * Purpose: The one sun path every cloud simulator experiment with a sun follows: a vertical
 *   figure-eight (a 2:1 Lissajous curve) of sun azimuth and elevation over time, so the sun is
 *   in the same place whichever experiment is showing. Its size and position are four shared
 *   settings (SUN_PATH_PARAMS) that every sun-bearing experiment saves with its ratings.
 * Consumers: core/host.js (the shared clock drives it and it builds the four sliders),
 *   experiment modules such as ../sunset-experiment.js (each maps azimuth and elevation into
 *   its own picture), and sun-path.test.js.
 * Dependencies: none (pure).
 */

// One loop of the eight takes `period` seconds of the shared clock. Elevation rises and falls
// once per loop and azimuth swings side to side twice, so the lobes stack top and bottom and
// cross at (sunPathX, sunPathY) at the start and halfway through:
//   phase     = time / period                                  (only the fraction matters)
//   azimuth   = sunPathX + sunPathWidth / 2 · sin(4π · phase)   degrees, negative is left
//   elevation = sunPathY + sunPathHeight / 2 · sin(2π · phase)  degrees above the horizon
// sunPathWidth and sunPathHeight are the full side-to-side and up-and-down extents. With the
// defaults the sun spans −15° to 15° across and −7° to 25° up: the top lobe is daylight and
// the bottom lobe dips below the horizon (dusk) and comes back up.
export const SUN_PATH = { period: 90 };

export const SUN_PATH_PARAMS = [
  { key: "sunPathWidth", kind: "range", min: 0, max: 90, step: 1, default: 30, drift: false,
    help: "Shared sun path: full side-to-side swing in degrees (the figure-eight's width)." },
  { key: "sunPathHeight", kind: "range", min: 0, max: 60, step: 1, default: 32, drift: false,
    help: "Shared sun path: full up-and-down range in degrees (the figure-eight's height)." },
  { key: "sunPathX", kind: "range", min: -45, max: 45, step: 1, default: 0, drift: false,
    help: "Shared sun path: where the eight is centered across, in degrees; negative is left." },
  { key: "sunPathY", kind: "range", min: -15, max: 30, step: 0.5, default: 9, drift: false,
    help: "Shared sun path: elevation of the eight's crossing point, in degrees above the horizon." }
];
export const SUN_PATH_KEYS = SUN_PATH_PARAMS.map(param => param.key);
export const DEFAULT_SUN_SHAPE = Object.freeze(Object.fromEntries(SUN_PATH_PARAMS.map(param => [param.key, param.default])));

// Fraction of the way around the loop, in [0, 1).
export function sunPhase(time, { period = SUN_PATH.period } = {}) {
  const phase = (time / period) % 1;
  return phase < 0 ? phase + 1 : phase;
}

// The sun at `phase` of the loop for a path shape ({ sunPathWidth, … }; missing keys use
// the defaults): { phase, azimuth, elevation } in degrees.
export function sunAtPhase(phase, shape = {}) {
  const { sunPathWidth, sunPathHeight, sunPathX, sunPathY } = { ...DEFAULT_SUN_SHAPE, ...shape };
  const angle = 2 * Math.PI * phase;
  return { phase, azimuth: sunPathX + sunPathWidth / 2 * Math.sin(2 * angle), elevation: sunPathY + sunPathHeight / 2 * Math.sin(angle) };
}

// The sun at `time` seconds on the shared clock.
export function sunAt(time, shape = {}, { period = SUN_PATH.period } = {}) {
  return sunAtPhase(sunPhase(time, { period }), shape);
}

// Clock time (seconds, within one loop) for a phase fraction; the inverse of sunPhase.
export const timeForPhase = (phase, { period = SUN_PATH.period } = {}) => sunPhase(phase * period, { period }) * period;

// The phase whose sun is nearest (azimuth, elevation) on this path shape, so links and
// ratings saved with the studies' old sunAzimuth / sunElevation sliders land close by.
export function nearestPhase(azimuth, elevation, shape = {}, samples = 3600) {
  let best = 0, bestDistance = Infinity;
  for (let i = 0; i < samples; i++) {
    const sun = sunAtPhase(i / samples, shape), distance = Math.hypot(sun.azimuth - azimuth, sun.elevation - elevation);
    if (distance < bestDistance) { best = i / samples; bestDistance = distance; }
  }
  return best;
}
