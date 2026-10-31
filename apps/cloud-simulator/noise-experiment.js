/*
 * Purpose: Noise weather as a cloud simulator experiment module: humidity, heat and pressure
 *   drift as noise; cloud water condenses inside a cloud layer, lingers, rains and pools.
 *   Its sunset lighting is baked into the model (a low sun off the lower right), so it does
 *   not follow the shared sun.
 * Consumers: noise.js (mounts it with core/host.js), core/registry.js, core/experiment.test.js,
 *   noise-ui.test.js.
 * Dependencies: noise-model.js (the weather and its rendering); the contract in core/experiment.js.
 */
import { defaults, createWeather, step, sampleFields, renderWeather, airborneRain, pooledRain,
  createRainLayer, updateRainLayer, startCloud } from "./noise-model.js";

// The model ticks 20 times a clock second while playing.
export const TICKS_PER_SECOND = 20;
const slider = (key, min, max, stepSize, help, group) => ({ key, kind: "range", min, max, step: stepSize, default: defaults[key], help, group });
const legends = {
  sunset: "Sunset: clouds lit peach toward the low sun at lower right and grey-violet where thick; smooth grey curtain under a cloud base and thin streaks = rain falling from a raining cloud; blue floor = puddles.",
  water: "Cloud and rain: white = stored cloud water, gold tint = dense, lasting cloud that is raining, pale blue = rain in the air.",
  relative: "Cloud forcing: relative humidity × the cloud-layer band; brighter = closer to forming, orange = cloud condenses here now.",
  humidity: "Humidity: dark = dry, blue = moist.",
  temperature: "Temperature: blue = cold, red = warm.",
  pressure: "Pressure: purple = low (more cloud), yellow = high (clearer)."
};
const SKY = "Sky", LAYER = "Cloud layer", RAIN = "Rain";
const ruleKeys = ["cloudiness", "featureSize", "texture", "changeSpeed", "wind", "layerHeight", "layerThickness", "layerAsymmetry", "persistence", "rainAmount", "fallSpeed"];
const rulesOf = params => ({ ...defaults, ...Object.fromEntries(ruleKeys.map(key => [key, params[key]])) });

export const noise = {
  id: "noise",
  title: "Noise weather",
  app: "cloud-simulator/noise",
  width: 128,
  height: 96,
  sun: false,
  autoplay: true,
  drift: true,
  groupNotes: { [SKY]: "", [LAYER]: "Clouds form only in this band of height.", [RAIN]: "" },
  params: [
    { key: "view", kind: "select", label: "View", wide: true, default: "sunset",
      options: [["sunset", "Sunset"], ["water", "Cloud and rain"], ["relative", "Cloud forcing"], ["humidity", "Humidity"], ["temperature", "Temperature"], ["pressure", "Pressure"]] },
    slider("cloudiness", 0.2, 0.7, 0.01, "More moisture: more and bigger clouds.", SKY),
    slider("featureSize", 8, 96, 1, "Size of cloud clumps, in pixels.", SKY),
    slider("texture", 0, 1, 0.05, "Smooth to ragged: 0 gives soft round blobs, 1 frayed, grainy edges.", SKY),
    slider("changeSpeed", 0, 0.05, 0.001, "How fast clouds grow, shrink and reshape; 0 freezes them.", SKY),
    slider("wind", -0.5, 0.5, 0.01, "Pixels per tick everything blows sideways; negative blows left, 0 is calm.", SKY),
    slider("layerHeight", 0.1, 0.9, 0.01, "Height of the cloud layer's middle: 0 floor, 1 lid.", LAYER),
    slider("layerThickness", 0.05, 0.8, 0.01, "How deep the cloud layer is.", LAYER),
    slider("layerAsymmetry", -0.9, 0.9, 0.05, "Above 0: flatter bottom, taller soft top. Below 0: the reverse. The layer always fades softly at both edges.", LAYER),
    slider("persistence", 0.5, 1.5, 0.05, "How long clouds linger once the noise stops feeding them; they shrink from the edges in. 0.5 fade within several seconds, 1 linger for tens of seconds, 1.5 about a minute.", LAYER),
    slider("rainAmount", 0, 0.015, 0.0005, "How much rain dense, lasting clouds drop (and how fast that thins them).", RAIN),
    slider("fallSpeed", 0.05, 1, 0.01, "Pixels per tick the rain falls.", RAIN),
    // Seeds only make a run reproducible; behavior should look alike on any seed.
    { key: "seed", kind: "seed", default: 1, random: true, hidden: true, newLabel: "New seed", newTitle: "Start a new run on a random seed" }
  ],
  actions: [
    { id: "step", label: "Step", title: "Pause and advance one tick", run: page => { page.setPlaying(false); page.instance.tick(); } },
    { id: "reset", label: "Reset", title: "Restart the run on the same seed and settings", run: page => page.instance.restart() }
  ],
  readouts: { legend: params => legends[params.view] },
  stats: (params, frame, { simulation }) => {
    const cloudy = simulation.cloud.filter(value => value > 0).length / simulation.cloud.length;
    return `Tick ${simulation.tick} · Cloud ${(100 * cloudy).toFixed(0)}% · Rain in air ${airborneRain(simulation).toFixed(2)} · Puddles ${pooledRain(simulation).toFixed(2)}`;
  },
  create({ width, height, params }) {
    let current = params, carry = 0;
    const instance = {
      simulation: null, rain: null,
      restart() {
        instance.simulation = createWeather({ width, height, seed: current.seed });
        instance.rain = createRainLayer(current.seed);
        sampleFields(instance.simulation, rulesOf(current));
        startCloud(instance.simulation);
        carry = 0;
      },
      tick() { const rules = rulesOf(current); step(instance.simulation, rules); updateRainLayer(instance.rain, instance.simulation, rules); },
      update(next, { playing = false } = {}) {
        const previous = current; current = next;
        if (next.seed !== previous.seed) return instance.restart();
        // Rule changes show at once: the forcing always, and while paused the cloud is reset
        // to it (playing, the stored cloud follows at its own pace).
        if (ruleKeys.some(key => next[key] !== previous[key])) {
          sampleFields(instance.simulation, rulesOf(current));
          if (!playing) startCloud(instance.simulation);
        }
      },
      step(dt) {
        carry += dt * TICKS_PER_SECOND;
        let changed = false;
        while (carry >= 1 - 1e-9) { instance.tick(); carry -= 1; changed = true; }
        return changed;
      },
      render: () => renderWeather(instance.simulation, current.view, rulesOf(current), instance.rain),
      dispose() {}
    };
    instance.restart();
    return instance;
  }
};
