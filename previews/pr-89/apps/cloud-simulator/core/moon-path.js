/*
 * Purpose: The shared moon, a sky light that moves on the shared clock like the sun
 *   (core/sun-path.js). The host puts it on every frame as frame.moon, so any experiment can
 *   light from it the same way it lights from frame.sun, instead of working out its own moon.
 * Consumers: core/host.js (adds frame.moon), weather-model.js / weather-experiment.js (moon
 *   disc, cloud backlight and terrain fill), moon-path.test.js.
 * Dependencies: sun-path.js (the shared clock's phase).
 */
import { sunPhase } from "./sun-path.js";

// A fixed ellipse, separate from the sun's figure-eight, so Randomize changing the sun path
// never moves the moon out of frame:
//   azimuth   = −22 · cos(2π · (phase − 0.57))   degrees, negative is left
//   elevation =  24 · sin(2π · (phase − 0.57))   degrees above the horizon
// It rises about 19:41, is highest about 01:41 and sets about 07:41 on the shared clock.
// Timing only: no lunar phase or ephemeris.
export const MOON_PATH = { offset: 0.57, width: 22, height: 24 };

// The moon at `phase` of the shared loop: { phase, azimuth, elevation } (degrees).
export function moonAtPhase(phase) {
  const angle = 2 * Math.PI * (phase - MOON_PATH.offset);
  return { phase, azimuth: -MOON_PATH.width * Math.cos(angle), elevation: MOON_PATH.height * Math.sin(angle) };
}

// The moon at `time` seconds on the shared clock.
export const moonAt = time => moonAtPhase(sunPhase(time));
