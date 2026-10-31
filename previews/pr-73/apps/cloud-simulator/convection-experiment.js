/*
 * Purpose: Convection study as a cloud simulator experiment module: a heated, wet floor and a
 *   cooled lid overturn a box of moist air into cloud and rain. Its sunset lighting is baked
 *   into the model's Sunset view (a low sun at the lower right), so it does not follow the
 *   shared sun.
 * Consumers: convection.js (mounts it with core/host.js), core/registry.js,
 *   core/experiment.test.js, convection-ui.test.js.
 * Dependencies: convection-model.js (simulation and rendering); the contract in core/experiment.js.
 */
import { defaults, createConvection, step, totalWater, renderConvection } from "./convection-model.js";

const OPTIONS = "Options · part of the run’s parameters", START = "Starting fields · changing these resets the run";
const slider = (key, min, max, stepSize, help, extra = {}) => ({ key, kind: "range", min, max, step: stepSize, default: defaults[key], help, ...extra });
const legends = {
  sunset: "Sunset: solid clouds = cloudy air that is rising or warm, or pressed flat under warmer air above it (the inversion); with the LCL they sit on flat bases at one height over clear air, lit peach and pink from a low sun at lower right and grey-violet in their own shadow, with frayed wisps at the edges; faint veil = still cloud and near-saturated haze; soft curtains = falling rain.",
  sunsetRaw: "Sunset, raw cloud water: every bit of simulated cloud drawn by its own amount, lit from a low sun at lower right; it reads as smoke. Soft curtains = falling rain.",
  lamp: "Lava lamp: orange = warmer than the row average (rising), blue = cooler (sinking), pale cyan = falling rain (cloud is hidden here; see Cloud and rain).",
  water: "Cloud and rain: dark air, blue tint = vapor, gray-white = cloud, pale cyan = falling rain. Fixed color scale; no decorative trails.",
  temperature: "Temperature: blue = cold, red = warm. The floor is heated and the lid is cooled.",
  buoyancy: "Buoyancy: orange = warmer than the row average (rising), blue = cooler (sinking). Clips at ±0.15.",
  humidity: "Relative humidity: brighter = closer to saturation; orange = saturated, where cloud forms."
};
// Sliders whose key is a model rule; the remaining rules keep their defaults.
const ruleKeys = ["inversionHeight", "lclHeight", "buoyancy", "viscosity", "heating", "cooling", "latentHeat", "expansion", "evaporation", "autoconversion", "fallSpeed", "flicker"];
// The run's full rules: sliders plus the Options group. `layering` replaces the older
// `inversion` boolean, which the model still reads when a saved run has no `layering`.
export const rulesOf = params => ({
  ...defaults, ...Object.fromEntries(ruleKeys.map(key => [key, params[key]])),
  layering: params.layering, cloudStyle: params.cloudStyle, feather: params.feather, pixelArt: params.pixelArt, resolution: params.resolution
});

export const convection = {
  id: "convection",
  title: "Convection study",
  app: "cloud-simulator/convection",
  width: 64,
  height: 48,
  sun: false,
  autoplay: true,
  params: [
    { key: "view", kind: "select", label: "View", default: "sunset",
      options: [["sunset", "Sunset"], ["lamp", "Lava lamp"], ["water", "Cloud and rain"], ["temperature", "Temperature"], ["buoyancy", "Buoyancy"], ["humidity", "Relative humidity"]] },
    { key: "layering", kind: "select", display: "radio", group: OPTIONS, default: "lcl", help: "What shapes the cloud layer.",
      options: [["none", "None: plain overturning"],
        ["inversion", "Inversion (cap): a warm, stable layer aloft stops the rising air, as a trade-wind inversion does; clouds spread flat under it"],
        ["lcl", "LCL (flat bases): a well-mixed layer under the lifting condensation level; every thermal saturates at one height, so cumulus sit on flat bases and billow up"]] },
    slider("inversionHeight", 0.3, 0.85, 0.05, "Altitude (0 floor, 1 lid) where the warm layer starts. Inversion only.", { group: OPTIONS, enabled: params => params.layering === "inversion" }),
    slider("lclHeight", 0.15, 0.6, 0.05, "Cloud-base altitude the surface moisture is set for: the floor's dewpoint spread. LCL only.", { group: OPTIONS, enabled: params => params.layering === "lcl" }),
    // Switching restarts the same seed and parameters at the new size (the host rebuilds).
    { key: "resolution", kind: "size", group: OPTIONS, default: "64x48", help: "Grid size; switching restarts the same seed.",
      options: [["64x48", "Pixel art 64×48"], ["128x96", "Detailed 128×96"]] },
    { key: "cloudStyle", kind: "select", display: "radio", group: OPTIONS, default: "cumulus", help: "How the Sunset view draws cloud water.",
      options: [["cumulus", "Cumulus: rising or capped cloud, billowed"], ["raw", "Raw cloud water (smoky first version)"]] },
    { key: "feather", kind: "toggle", group: OPTIONS, default: true, help: "Fray cumulus edges into wisps that fade over a few pixels; cores stay solid.", enabled: params => params.cloudStyle !== "raw" },
    { key: "pixelArt", kind: "toggle", group: OPTIONS, default: true, help: "Banded sky, a few hard-stepped cloud shades, dithered fringe and rain.", enabled: params => params.cloudStyle !== "raw" },
    slider("buoyancy", 0, 0.03, 0.001, "How strongly a sideways temperature difference spins the air; warm sides rise."),
    slider("viscosity", 0, 0.24, 0.01, "Fraction of spin shared with neighbors per tick; higher makes fatter, slower blobs."),
    slider("heating", 0, 1, 0.05, "Fraction of the gap to the hot floor temperature closed per tick in the bottom row."),
    slider("cooling", 0, 1, 0.05, "Fraction of the gap to the cold lid temperature closed per tick in the top row."),
    slider("latentHeat", 0, 1, 0.05, "Warming per unit of vapor condensed; evaporation cools by the same amount."),
    // LCL mode runs its own lapse and cloud evaporation (see the formulas), so these idle.
    slider("expansion", 0, 1.5, 0.05, "How much rising air cools by expanding; sets how low the cloud base sits. LCL mode uses its own steeper 1.", { enabled: params => params.layering !== "lcl" }),
    slider("evaporation", 0, 0.5, 0.01, "Fraction of the humidity deficit refilled from cloud per tick. LCL mode uses its own faster 0.3.", { enabled: params => params.layering !== "lcl" }),
    slider("autoconversion", 0, 1, 0.05, "Fraction of cloud above 0.005 per pixel that gathers into rain drops per tick."),
    slider("fallSpeed", 0, 1, 0.05, "Fraction of each pixel’s rain moving down one pixel per tick; 1 outruns the fastest updraft."),
    slider("flicker", 0, 1.5, 0.05, "Seeded random wobble of the floor temperature per column; keeps the flow from locking."),
    { key: "speed", kind: "range", min: 1, max: 60, step: 1, default: 30, drift: false, help: "Simulation ticks per second; playback speed, not a wind speed." },
    // Changing water restarts the run, so Drift leaves it alone.
    { key: "water", kind: "range", min: 0, max: 0.4, step: 0.01, default: 0.11, group: START, drift: false, help: "Mean water per pixel (vapor + cloud + rain + puddles); conserved for the whole run." },
    // Seeds only make a run reproducible; behavior should look alike on any seed, so the
    // page picks one at random; New seed starts another.
    { key: "seed", kind: "seed", default: 42, random: true, hidden: true, newLabel: "New seed", newTitle: "Start a new run on a random seed" }
  ],
  // The pixel-art style follows a resolution switch (on for 64×48, off for 128×96) and can
  // still be changed afterwards.
  adjust: (next, previous) => next.resolution !== previous.resolution ? { ...next, pixelArt: next.resolution === "64x48" } : next,
  actions: [
    { id: "step", label: "Step", title: "Pause and advance one tick", run: page => { page.setPlaying(false); page.instance.tick(); } }
  ],
  readouts: { legend: params => legends[params.view === "sunset" && params.cloudStyle === "raw" ? "sunsetRaw" : params.view] },
  stats: (params, frame, { simulation }) =>
    `Tick ${simulation.tick} · Water/cell ${(totalWater(simulation) / simulation.temperature.length).toFixed(3)} · Fastest flow ${simulation.speed.toFixed(2)} px/tick`,
  create({ width, height, params }) {
    let current = params, carry = 0;
    const instance = {
      simulation: null,
      restart() { instance.simulation = createConvection({ width, height, seed: current.seed, water: current.water }); carry = 0; },
      tick() { step(instance.simulation, rulesOf(current)); },
      // Rule sliders affect the current run; water and the seed restart it.
      update(next) {
        const restart = next.seed !== current.seed || next.water !== current.water;
        current = next;
        if (restart) instance.restart();
      },
      // `speed` ticks per clock second while playing.
      step(dt) {
        carry += dt * current.speed;
        let changed = false;
        const rules = rulesOf(current);
        while (carry >= 1 - 1e-9) { step(instance.simulation, rules); carry -= 1; changed = true; }
        return changed;
      },
      render: () => renderConvection(instance.simulation, current.view, rulesOf(current)),
      dispose() {}
    };
    instance.restart();
    return instance;
  }
};
