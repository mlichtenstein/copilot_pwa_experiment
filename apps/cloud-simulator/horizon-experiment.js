/*
 * Purpose: Horizon light as a cloud simulator experiment module: six fixed layers lit through
 *   a spherical atmosphere from wherever the shared vertical figure-eight sun path puts the sun.
 * Consumers: horizon.js (mounts it with core/host.js), core/registry.js, core/experiment.test.js,
 *   horizon-ui.test.js.
 * Dependencies: horizon-model.js (geometry and lighting); the contract in core/experiment.js.
 */
import { defaults, renderHorizon, cloudCenters } from "./horizon-model.js";

const slider = (key, min, max, step, help) => ({ key, kind: "range", min, max, step, default: defaults[key], help });
const now = () => globalThis.performance?.now() ?? Date.now();
// The model's settings for these params and this frame's sun.
const settings = (params, frame) => ({ ...params, sunElevation: frame.sun.elevation, sunAzimuth: frame.sun.azimuth });

export const horizon = {
  id: "horizon",
  title: "Horizon light",
  app: "cloud-simulator/horizon",
  width: 128,
  height: 80,
  sun: true,
  // A frame takes tens of milliseconds, so redraw five times a second while the sun moves.
  frameInterval: 200,
  playLabels: ["Play sunset", "Pause sunset"],
  params: [
    slider("cloudAltitude", 0.3, 8, 0.1, "Central altitude of the cloud layers above sea level, km."),
    slider("altitudeSpread", 0, 5, 0.1, "Vertical separation of cloud centers and thickness of their bitmap bands, km."),
    slider("distanceScale", 0.5, 2, 0.1, "Multiplier for the distances of all six scene layers."),
    slider("airDensity", 0.2, 2, 0.1, "Atmospheric scattering/extinction multiplier."),
    slider("aerosol", 0, 1, 0.05, "Low-altitude haze strength; approximately neutral extinction."),
    slider("exposure", 0.5, 4, 0.1, "Camera exposure multiplier before tone mapping.")
  ],
  actions: [{ id: "reset-experiment", label: "Reset experiment", title: "Every setting, the sun and its path back to their defaults, paused",
    run: page => { page.setPlaying(false); page.resetToDefaults(); } }],
  readouts: {
    "cloud-status": (params, frame) => cloudCenters(settings(params, frame)).map((layer, i) =>
      `${["Near", "Middle", "Far"][i]} cloud: ${layer.height.toFixed(1)} km high, ${layer.distance.toFixed(0)} km away, ${layer.lit ? "sunlit" : "Earth shadow"}`).join(" · ")
  },
  stats: (params, frame, instance) => `Fixed bitmaps · six layers · ${instance.lastMs.toFixed(0)} ms/frame`,
  create({ width, height, params }) {
    let current = params;
    return {
      lastMs: 0,
      update(next) { current = next; },
      // Nothing evolves; only the sun moves.
      step() { return true; },
      render(frame) {
        const start = now(), pixels = renderHorizon(settings(current, frame), width, height);
        this.lastMs = now() - start;
        return pixels;
      },
      dispose() {}
    };
  }
};
