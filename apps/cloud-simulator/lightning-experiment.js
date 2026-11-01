/*
 * Purpose: The Lightning experiment module for the shared core (core/experiment.js contract):
 *   its ten sliders, its hidden seed and starting mode, its two unique start buttons, and an
 *   instance that runs the unchanged scene (lightning-model.js) through its fixed-step
 *   session (experiment-session.js). Old ratings and links ({ version: 1, seed, params,
 *   start }) load through migrate.
 * Consumers: lightning.js, core/registry.js, lightning-ui.test.js.
 * Dependencies: lightning-model.js, experiment-session.js; Web Crypto for fresh seeds.
 */
import { lightningScene, parameters } from "./lightning-model.js";
import { createSession } from "./experiment-session.js";

const randomSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
const sceneParams = params => Object.fromEntries(parameters.map(p => [p.key, params[p.key]]));

// The scene has one fixed size (160×100, as on the page); a canvas of another size (tests)
// gets a nearest-neighbour copy.
function fit(pixels, width, height) {
  const { width: w, height: h } = lightningScene;
  if (width === w && height === h) return pixels;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (Math.floor(y * h / height) * w + Math.floor(x * w / width)) * 4, to = (y * width + x) * 4;
    out[to] = pixels[from]; out[to + 1] = pixels[from + 1]; out[to + 2] = pixels[from + 2]; out[to + 3] = pixels[from + 3];
  }
  return out;
}

export const lightning = {
  id: "lightning",
  title: "Lightning",
  app: "cloud-simulator/lightning",
  width: lightningScene.width,
  height: lightningScene.height,
  sun: false,
  // Starts paused on a fresh strike, as before. New seed prepares another strike in the
  // current starting mode; Step is one 1/60-second scene step.
  seed: "seed",
  stepSeconds: lightningScene.dt,
  params: [
    ...parameters.map(p => ({ key: p.key, kind: "range", min: p.min, max: p.max, step: p.step, default: p.default, help: p.description })),
    { key: "seed", kind: "seed", default: 42, random: true, hidden: true },
    // Which moment a fresh strike is prepared at: set by the two start buttons.
    { key: "start", kind: "select", hidden: true, label: "Start", default: lightningScene.defaultStart,
      options: lightningScene.starts.map(start => [start.id, start.label]) }
  ],
  // Unique to Lightning: prepare one naturally triggered strike on a new seed, paused at a
  // chosen moment (the common New seed keeps the current moment and does not pause).
  actions: lightningScene.starts.map(start => ({
    id: start.id === "peak" ? "next-shape" : "before-strike", label: start.label, title: start.description,
    help: start.id === "peak" ? "A fresh strike on a new seed, paused at peak brightness; Step fades this channel."
      : "A fresh strike on a new seed, paused just before growth; Step starts the leader, Play runs the strike.",
    run: page => { page.setPlaying(false); page.setParams({ seed: randomSeed(), start: start.id }); }
  })),
  // Ratings and links saved by Lightning's own host: { version: 1, seed, params, start }.
  migrate: raw => raw?.version === 1 && raw.params && typeof raw.params === "object"
    ? { ...raw.params, seed: Number(raw.seed) >>> 0, start: raw.start ?? lightningScene.defaultStart }
    : raw,
  stats: (params, frame, instance) =>
    `${instance.session.state.phase ?? "scene"} · t ${(instance.session.state.time ?? 0).toFixed(2)} s · ${instance.renderMs.toFixed(1)} ms/render`,
  create({ width, height, params }) {
    const session = createSession(lightningScene, params.seed, sceneParams(params));
    if (params.start !== session.start) session.reset(params.seed, params.start);
    let current = params;
    return {
      session, renderMs: 0,
      // Sliders change the running scene (snapped to their steps); a new seed or starting
      // mode prepares a fresh strike.
      update(next) {
        for (const p of parameters) session.set(p.key, next[p.key]);
        if (next.seed !== current.seed || next.start !== current.start) session.reset(next.seed, next.start);
        current = next;
      },
      step(dt) { session.advance(dt); return true; },
      tick() { session.step(); },
      render() {
        const began = globalThis.performance?.now() ?? 0;
        const pixels = session.render();
        this.renderMs = (globalThis.performance?.now() ?? 0) - began;
        return fit(pixels, width, height);
      },
      dispose() {}
    };
  }
};
