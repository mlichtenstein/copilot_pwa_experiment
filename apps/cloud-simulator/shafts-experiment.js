/*
 * Purpose: Light shafts as a cloud simulator experiment module: three fixed cloud pictures
 *   whose shadows and lit air are drawn by one of three lighting strategies, lit from wherever
 *   the shared vertical figure-eight sun path puts the sun.
 * Consumers: shafts.js (mounts it with core/host.js), core/registry.js, core/experiment.test.js,
 *   shafts-ui.test.js.
 * Dependencies: shafts-model.js and visibility-model.js (scene and lighting); the contract in
 *   core/experiment.js.
 */
import { defaults, createScene, createLayer, buildLightMaps, renderShafts } from "./shafts-model.js";
import { buildVisibility, renderVisibility, buildLayeredVisibility, visibilityDefaults } from "./visibility-model.js";

const all = { ...defaults, ...visibilityDefaults };
const slider = (key, min, max, step, help, more = {}) => ({ key, kind: "range", min, max, step, default: all[key], help, ...more });
const polygons = params => params.strategy !== "geometric";
const now = () => globalThis.performance?.now() ?? Date.now();
// The scene follows the shared sun's full elevation range: below the horizon the disc is
// hidden and sunlight() fades the shafts out by about −4.6°; high suns sit above the view and
// cast short, downward shafts. Elevation is only guarded short of straight up or down, where
// the extrusion depth (cos elevation · cos azimuth) would reach 0; the path never gets there
// (−45..60°). Azimuth stays within ±40°, the view's sideways reach, for the same reason.
export const SUN_LIMITS = { elevation: [-85, 85], azimuth: [-40, 40] };
const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value));
export const sceneSun = sun => ({ sunElevation: clamp(sun.elevation, SUN_LIMITS.elevation), sunAzimuth: clamp(sun.azimuth, SUN_LIMITS.azimuth) });
const modeName = params => params.strategy === "layered" ? "layered visibility" : params.strategy === "visibility" ? "visibility polygons" : "geometric shadows";
// The three cloud pictures' seeds, as createScene(42) chooses them; Change near/middle/far
// steps one of them.
const sceneSeeds = createScene().layers.map(layer => layer.seed);
const patternKeys = ["nearPattern", "middlePattern", "farPattern"];
const pattern = (key, i, name) => ({ key, kind: "seed", default: sceneSeeds[i], hidden: true, next: seed => seed + 1, buttonsIn: "pattern-buttons",
  newLabel: `Change ${name}`, newTitle: `Change the ${name} cloud picture` });

export const shafts = {
  id: "shafts",
  title: "Light shafts",
  app: "cloud-simulator/shafts",
  width: 128,
  height: 80,
  sun: true,
  frameInterval: 160,
  params: [
    { key: "strategy", kind: "select", display: "radio", label: "Lighting strategy", group: "Lighting strategy", default: "layered",
      help: "How lit air and shadows are drawn.",
      options: [["visibility", "Visibility polygons"], ["layered", "Layered visibility polygons"], ["geometric", "Geometric shadows"]] },
    slider("cloudOpacity", 0, 3, 0.1, "How strongly droplets block sunlight and the background; 0 makes clouds transparent."),
    slider("haze", 0, 1, 0.05, "Amount of illuminated air between cloud pictures; 0 removes it."),
    slider("cloudSharpness", 1, 16, 0.5, "Changes cloud-mask contrast before the opaque silhouette cutoff. Visible cloud shading stays soft."),
    slider("sourceRadius", 0, 16, 0.5, "Visibility strategies only: sunlight passes through clouds within this distance of the sun, in native image pixels. 0 restores hard blocking.", { enabled: polygons }),
    slider("edgeFeather", 0, 6, 0.5, "Visibility strategies only: fades the cloud-facing and radius-facing ends of lit regions. Ray sides stay crisp. Native image pixels; 0 restores hard ends.", { enabled: polygons }),
    pattern("nearPattern", 0, "near"), pattern("middlePattern", 1, "middle"), pattern("farPattern", 2, "far")
  ],
  actions: [{ id: "reset-experiment", label: "Reset experiment", title: "Lighting, the sun, its path and the cloud patterns back to their defaults, paused; the strategy stays",
    run: page => { page.setPlaying(false); page.resetToDefaults({ keep: ["strategy"] }); } }],
  readouts: { patterns: (params, frame, instance) => instance.scene.layers.map(layer => `${layer.name}: ${layer.seed}`).join(" · ") },
  stats: (params, frame, instance) => `3 cloud layers · ${modeName(params)} · ${instance.lastMs.toFixed(0)} ms/frame`,
  create({ width, height, params }) {
    let current = params;
    const scene = createScene();
    const syncLayers = () => patternKeys.forEach((key, i) => { if (scene.layers[i].seed !== current[key]) scene.layers[i] = createLayer(i, current[key] >>> 0); });
    syncLayers();
    return {
      scene, lastMs: 0,
      update(next) { current = next; syncLayers(); },
      // Nothing evolves; only the sun moves.
      step() { return true; },
      render(frame) {
        const start = now(), options = { ...current, ...sceneSun(frame.sun) };
        const pixels = polygons(current)
          ? renderVisibility(scene, (current.strategy === "layered" ? buildLayeredVisibility : buildVisibility)(scene, options, width, height))
          : renderShafts(scene, buildLightMaps(scene, options), width, height);
        this.lastMs = now() - start;
        return pixels;
      },
      dispose() {}
    };
  }
};
