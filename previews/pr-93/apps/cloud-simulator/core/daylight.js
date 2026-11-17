/*
 * Purpose: Night for every cloud simulator page. One daylight factor from the shared sun's
 *   elevation, and the host's night step that darkens a rendered frame toward a dim blue floor.
 * Consumers: core/host.js (after each render), daylight.test.js.
 * Dependencies: none (pure).
 */

// Daylight from sun elevation (degrees): 1 at and above `top` (+6° by default: full day, the
// frame is untouched), a smooth ramp (smootherstep, no kinks) through twilight, and 0 at and
// below −12° (astronomical night begins near −18°; the picture is fully dim by −12°).
// Sun-lit experiments (experiment.sun) shade their own dusk, so the host starts their ramp at
// the horizon (top 0) and only adds the night floor below it.
export const TWILIGHT = { top: 6, bottom: -12 };
export function daylight(elevation, { top = TWILIGHT.top, bottom = TWILIGHT.bottom } = {}) {
  const x = Math.min(1, Math.max(0, (elevation - bottom) / (top - bottom)));
  return x * x * x * (x * (6 * x - 15) + 10);
}

// Night is a very dark blue, not black: at daylight 0 a pixel keeps `keep` of its brightness
// over the `floor` colour, so clouds stay faintly visible. Sun-lit models have already dimmed
// themselves by then (to roughly a third to a half of day), so they keep more (`sunKeep`),
// which leaves every page's night about equally dark with its clouds still readable.
export const NIGHT = { keep: 0.2, sunKeep: 0.3, floor: [5, 9, 24] };

// Darken RGBA `pixels` in place for `light` (0 night to 1 day). Light 1 leaves them unchanged.
export function applyNight(pixels, light, { keep = NIGHT.keep, floor = NIGHT.floor } = {}) {
  if (!(light < 1)) return pixels;
  const dark = 1 - Math.max(0, light), scale = 1 - dark * (1 - keep);
  const add = floor.map(value => value * dark);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = pixels[i] * scale + add[0];
    pixels[i + 1] = pixels[i + 1] * scale + add[1];
    pixels[i + 2] = pixels[i + 2] * scale + add[2];
  }
  return pixels;
}
