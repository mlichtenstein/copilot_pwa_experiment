/*
 * Purpose: The Sunset study as a cloud simulator experiment module: its controls (params
 *   schema) and a still scene that relights a fixed, seeded droplet slab from wherever the
 *   shared vertical figure-eight sun path puts the sun.
 * Consumers: sunset.js (mounts it with core/host.js), core/registry.js, core/experiment.test.js.
 * Dependencies: sunset-model.js (density and lighting); the contract in core/experiment.js.
 */
import { defaults, createDensity, renderSunset } from "./sunset-model.js";

const slider = (key, min, max, step, help) => ({ key, kind: "range", min, max, step, default: defaults[key], help });

export const sunset = {
  id: "sunset",
  title: "Sunset study",
  app: "cloud-simulator/sunset",
  width: 128,
  height: 80,
  sun: true,
  // Relighting the slab takes about 12 ms, so redraw ten times a second while the sun moves.
  frameInterval: 100,
  params: [
    { key: "view", kind: "select", label: "View", default: "light", options: [["light", "Camera light"], ["density", "Droplet density"], ["sun", "Sunlight transmission"], ["camera", "Camera transmission"]] },
    { key: "seed", kind: "seed", default: 42, help: "Fixed droplet arrangement; changing this regenerates density.", newLabel: "New density seed", newTitle: "Pick a random seed and regenerate the droplets" },
    slider("extinction", 0, 0.5, 0.01, "Light loss per density unit per pixel of path (inverse pixels)."),
    slider("slabDepth", 1, 30, 1, "Cloud thickness toward the camera, in pixel-length units."),
    slider("albedo", 0, 1, 0.05, "Fraction of removed light scattered rather than absorbed."),
    slider("g", 0, 0.9, 0.05, "Scattering asymmetry; 0 is isotropic, positive favors forward scattering."),
    slider("airOpticalDepth", 0, 0.5, 0.01, "Atmospheric extinction scale; stronger values redden low sunlight."),
    slider("ambient", 0, 0.2, 0.005, "Unshadowed neutral fill light, approximating indirect illumination."),
    slider("exposure", 0.1, 4, 0.1, "Camera exposure multiplier before tone mapping.")
  ],
  create({ width, height, params }) {
    let current = params, field = createDensity(width, height, params.seed);
    return {
      update(next) {
        if (next.seed !== current.seed) field = createDensity(width, height, next.seed);
        current = next;
      },
      // Nothing evolves: the droplets are fixed and only the shared sun moves.
      step() {},
      render({ sun }) {
        return renderSunset(field, { ...current, sunAzimuth: sun.azimuth, sunElevation: sun.elevation }, current.view);
      },
      dispose() { field = null; }
    };
  },
  stats: (params, { sun }) => `Seed ${params.seed} · density fixed · sun ${sun.azimuth.toFixed(0)}° across, ${sun.elevation.toFixed(1)}° up`
};
