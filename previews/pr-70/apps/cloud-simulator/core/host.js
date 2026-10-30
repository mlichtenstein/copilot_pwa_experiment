/*
 * Purpose: Turn an experiment module (core/experiment.js contract) into a working page: build
 *   its controls from the params schema, run the one shared loop and clock, move the shared
 *   sun, draw to the canvas, and wire the emoji rating bar and ?p= links through generic
 *   getParams/applyParams.
 * Consumers: experiment page scripts (../sunset.js); host.test.js.
 * Dependencies: experiment.js, clock.js, sun-path.js, ../../shared/presets-panel.js; the
 *   page's DOM contract: <canvas id="sky">, and empty containers #presets (rating bar),
 *   #playback (buttons), #stats, #controls (generated controls) and #status; Canvas 2D,
 *   requestAnimationFrame and optionally the service worker API.
 */
import { validateExperiment, validateInstance, cleanParams, cleanParam, defaultParams } from "./experiment.js";
import { createClock, startLoop } from "./clock.js";
import { sunAt, sunPhase, timeForPhase } from "./sun-path.js";
import { mountPresetBar } from "../../shared/presets-panel.js";

// Where the sun starts and where Reset sun puts it: a quarter into the first lobe, high and
// to the right (about 28° across and 25° up), close to the studies' old default sun.
export const DEFAULT_SUN_PHASE = 0.125;

const make = (doc, tag, props = {}, ...children) => {
  const node = Object.assign(doc.createElement(tag), props);
  node.append(...children);
  return node;
};

// One control per param, matching the hand-written markup the pages used before:
// <label><code>key</code><small>help</small><output/><input/></label>.
function buildControl(doc, param, value) {
  if (param.kind === "select") {
    const select = make(doc, "select", { id: param.key, title: param.help ?? param.label },
      ...param.options.map(([option, text]) => make(doc, "option", { value: option, textContent: text })));
    select.value = value;
    return { label: make(doc, "label", {}, param.label, select), input: select };
  }
  const input = param.kind === "seed"
    ? make(doc, "input", { id: param.key, type: "number", min: "0", max: "4294967295", step: "1", value: String(value) })
    : make(doc, "input", { id: param.key, type: "range", min: String(param.min), max: String(param.max), step: String(param.step), value: String(value) });
  const output = param.kind === "range" ? make(doc, "output", { id: param.key + "-value" }) : null;
  const label = make(doc, "label", {}, make(doc, "code", { textContent: param.key }), make(doc, "small", { textContent: param.help ?? "" }), ...(output ? [output] : []), input);
  return { label, input, output };
}

export function mountExperiment(experiment, {
  doc = globalThis.document,
  canvas = doc.getElementById("sky"),
  playing = false,
  raf = globalThis.requestAnimationFrame,
  presets = true,
  serviceWorker = globalThis.navigator?.serviceWorker
} = {}) {
  validateExperiment(experiment);
  const element = id => doc.getElementById(id);
  const context = canvas.getContext("2d");
  let params = defaultParams(experiment);
  const instance = validateInstance(experiment.create({ width: canvas.width, height: canvas.height, params }));
  const clock = createClock({ time: timeForPhase(DEFAULT_SUN_PHASE), playing });
  let dirty = true, sinceRender = Infinity;

  const frameInfo = () => ({ time: clock.time, sun: sunAt(clock.time) });
  const controls = new Map();

  function render() {
    const frame = frameInfo();
    const image = context.createImageData(canvas.width, canvas.height);
    image.data.set(instance.render(frame));
    context.putImageData(image, 0, 0);
    for (const control of controls.values()) if (control.output) control.output.textContent = control.input.value;
    if (sunControl) {
      sunControl.input.value = String(frame.sun.phase);
      sunControl.output.textContent = `${frame.sun.azimuth.toFixed(0)}° across, ${frame.sun.elevation.toFixed(1)}° up`;
    }
    const stats = element("stats");
    if (stats && experiment.stats) stats.textContent = experiment.stats(params, frame);
    dirty = false; sinceRender = 0;
  }

  // Take new params (already cleaned) and redraw on the next frame.
  function setParams(next) { params = next; instance.update(params); dirty = true; }

  // Playback: Play/Pause runs the shared clock (the sun, and any simulation); Reset sun.
  const playback = element("playback");
  const play = make(doc, "button", { id: "play", type: "button", title: "Start or stop the shared clock that moves the sun along its figure-eight path" });
  const reset = make(doc, "button", { id: "reset", type: "button", textContent: "Reset sun", title: "Stop the sun and put it back at its starting point on the path" });
  function setPlaying(value) {
    clock.play(value);
    play.textContent = value ? "Pause sun" : "Play sun";
    play.setAttribute("aria-pressed", String(value));
  }
  play.addEventListener("click", () => setPlaying(!clock.playing));
  reset.addEventListener("click", () => { setPlaying(false); clock.set(timeForPhase(DEFAULT_SUN_PHASE)); dirty = true; });
  playback.append(play, reset);

  // Generated controls, in schema order. When the experiment has a sun, the shared sun
  // position goes just before its first slider, where each study used to keep its own sun slider.
  const panel = element("controls");
  const sunControl = experiment.sun ? buildControl(doc, { key: "sunPhase", kind: "range", min: 0, max: 1, step: 0.001,
    help: "Sun position on the shared figure-eight path (0 to 1), the same in every experiment with a sun. Moving it stops the sun." }, sunPhase(clock.time)) : null;
  if (sunControl) {
    sunControl.input.step = "any";
    sunControl.input.addEventListener("input", () => { setPlaying(false); clock.set(timeForPhase(Number(sunControl.input.value))); dirty = true; });
  }
  for (const param of experiment.params) {
    if (sunControl && param.kind === "range" && !sunControl.label.parentNode) panel.append(sunControl.label);
    const control = buildControl(doc, param, params[param.key]);
    controls.set(param.key, control);
    panel.append(control.label);
    const commit = () => {
      control.input.setCustomValidity?.("");
      const value = cleanParam(param, control.input.value, null);
      if (value === null) {
        control.input.setCustomValidity?.("Use an integer from 0 to 4294967295."); control.input.reportValidity?.(); return;
      }
      setParams({ ...params, [param.key]: value });
    };
    control.input.addEventListener(param.kind === "range" ? "input" : "change", commit);
    if (param.kind === "seed") {
      const button = make(doc, "button", { id: "new-" + param.key, type: "button", textContent: param.newLabel ?? "New seed", title: param.newTitle ?? "Pick a random seed" });
      button.addEventListener("click", () => {
        control.input.value = String(globalThis.crypto.getRandomValues(new Uint32Array(1))[0]); commit();
      });
      playback.append(button);
    }
  }
  if (sunControl && !sunControl.label.parentNode) panel.append(sunControl.label);
  setPlaying(playing);

  const stop = startLoop(dt => {
    const advanced = clock.advance(dt);
    if (advanced) instance.step(advanced, frameInfo());
    sinceRender += dt * 1000;
    if (dirty || (advanced && sinceRender >= (experiment.frameInterval ?? 0))) render();
  }, { raf, doc });

  // Ratings and links: every param, the sun's place on the path and the grid size.
  const getParams = () => ({ ...params, ...(experiment.sun ? { sunPhase: sunPhase(clock.time) } : {}), resolution: `${canvas.width}x${canvas.height}` });
  function applyParams(raw) {
    setPlaying(false);
    const next = cleanParams(experiment, raw, defaultParams(experiment));
    for (const [key, control] of controls) control.input.value = String(next[key]);
    if (experiment.sun && typeof raw?.sunPhase === "number" && Number.isFinite(raw.sunPhase)) clock.set(timeForPhase(raw.sunPhase));
    setParams(next);
  }
  if (presets) mountPresetBar(element("presets"), { app: experiment.app, getParams, applyParams, canvas });

  serviceWorker?.register("./cloud-sw.js").catch(error => {
    console.error(`${experiment.title} offline setup failed`, error);
    const status = element("status");
    if (status) status.textContent = "Offline setup failed; the experiment still works online.";
  });

  return { clock, getParams, applyParams, setPlaying, render, dispose() { stop(); instance.dispose(); } };
}
