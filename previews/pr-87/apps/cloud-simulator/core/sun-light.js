/*
 * Purpose: How the shared sun lights a picture that is not drawn from 3D geometry (the side
 *   views of Convection and Noise, Valley's painted landscape): which way the light comes from
 *   on screen, how strong it is through dusk, and how far it has moved from a warm low sun
 *   toward plain daylight. Each model keeps its own dynamics and palette; this only steers them.
 * Consumers: convection-experiment.js, noise-experiment.js, valley-experiment.js (from
 *   frame.sun) and their models; sun-light.test.js.
 * Dependencies: none (pure).
 */

// The pictures are framed toward the sun's side of the sky, so a sun SUN_LIGHT.across degrees
// to the right (left) lights them fully from the right (left), and a sun straight ahead lights
// them from the front. Their clouds sit high, so a sun lower than `lift` degrees lights them
// from below (the warm undersides the models used to bake in), higher from above. `dusk`
// fades direct light out between its two elevations, and `day` moves colours from the
// warm low-sun palette to daylight between its two. With the default sun path (−18° to 28°
// up, ±15° across) the palette stays warm all day, as before.
export const SUN_LIGHT = { across: 15, lift: 30, liftRange: 25, front: 0.35, dusk: [-6, 4], day: [35, 60] };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smoothstep = (low, high, value) => { const t = clamp((value - low) / (high - low), 0, 1); return t * t * (3 - 2 * t); };

// The light from a shared sun { azimuth, elevation } (degrees):
//   across    −1 (from the left) … 1 (from the right)
//   rise      −1 (from below) … 1 (from above)
//   direction unit vector toward the light: x right, y down the screen, z toward the viewer
//   march     the same direction across the screen, scaled so its larger step is one pixel
//             (null when the light comes straight from the front)
//   relief    how much of the light runs across the screen rather than from the front (0 … 1):
//             how strongly a flat picture shows which side a shape is lit on
//   strength  0 (sun well below the horizon) … 1 (direct light)
//   day       0 (warm low-sun colours) … 1 (high-sun daylight colours)
export function sunLight(sun = {}) {
  const azimuth = Number.isFinite(sun.azimuth) ? sun.azimuth : 0;
  const elevation = Number.isFinite(sun.elevation) ? sun.elevation : 0;
  const across = Math.sin(Math.PI / 2 * clamp(azimuth / SUN_LIGHT.across, -1, 1));
  const rise = clamp((elevation - SUN_LIGHT.lift) / SUN_LIGHT.liftRange, -1, 1);
  return lightFrom(across, -rise, SUN_LIGHT.front, {
    azimuth, elevation, across, rise,
    strength: smoothstep(SUN_LIGHT.dusk[0], SUN_LIGHT.dusk[1], elevation),
    day: smoothstep(SUN_LIGHT.day[0], SUN_LIGHT.day[1], elevation)
  });
}

// A light with a fixed screen direction (x right, y down, z toward the viewer), full strength
// and warm colours: what a model drew before it followed the shared sun.
export function fixedLight(x, y, z, more = {}) {
  return lightFrom(x, y, z, { azimuth: 0, elevation: 0, across: Math.sign(x), rise: -Math.sign(y), strength: 1, day: 0, ...more });
}

function lightFrom(x, y, z, light) {
  const length = Math.hypot(x, y, z) || 1, step = Math.max(Math.abs(x), Math.abs(y));
  return { ...light, direction: [x / length, y / length, z / length], relief: Math.hypot(x, y) / length,
    march: step < 0.05 ? null : { x: x / step, y: y / step } };
}
