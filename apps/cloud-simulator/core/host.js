/*
 * Purpose: Turn an experiment module (core/experiment.js contract) into a working page: build
 *   its controls from the params schema, run the one shared loop and clock, move the shared
 *   sun, draw to the canvas, and wire the emoji rating bar and ?p= links through generic
 *   getParams/applyParams. Optional capabilities (autoplay, Drift, actions, readouts, a
 *   grid-size switch, linked params, custom decorations, async loading) are all generic.
 * Consumers: every experiment page script (../sunset.js, ../convection.js, ../horizon.js,
 *   ../shafts.js, ../noise.js, ../valley.js); host.test.js and the per-experiment UI tests.
 * Dependencies: experiment.js, clock.js, sun-path.js, ../../shared/presets-panel.js,
 *   ../../shared/drift.js; the page's DOM contract: <canvas id="sky">, and empty containers
 *   #presets (rating bar), #playback (buttons), #stats, #controls (generated controls) and
 *   #status, plus any element an experiment's readouts name; Canvas 2D,
 *   requestAnimationFrame and optionally matchMedia and the service worker API.
 */
import { validateExperiment, validateInstance, cleanParams, cleanParam, defaultParams, driftableParams, parseSize } from "./experiment.js";
import { createClock, startLoop } from "./clock.js";
import { DEFAULT_SUN_SHAPE, SUN_PATH_PARAMS, nearestPhase, sunAt, sunPhase, timeForPhase } from "./sun-path.js";
import { mountPresetBar } from "../../shared/presets-panel.js";
import { bindDrift } from "../../shared/drift.js";

// Where the sun starts and where Reset sun puts it: an eighth of the way round, in the top
// lobe, high and to the right (15° across and about 20° up with the default path shape).
export const DEFAULT_SUN_PHASE = 0.125;

const make = (doc, tag, props = {}, ...children) => {
  const node = Object.assign(doc.createElement(tag), props);
  node.append(...children);
  return node;
};
const randomSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
const finite = value => typeof value === "number" && Number.isFinite(value);

// One control per param, matching the hand-written markup the pages used before. Every
// control is { element, read(), write(value), listen(fn), setDisabled(on), output?, input? }.
function buildControl(doc, param, value) {
  const keyLabel = () => [make(doc, "code", { textContent: param.key }), make(doc, "small", { textContent: param.help ?? "" })];
  const single = (input, element, eventName) => ({
    element, input, read: () => input.value, write: next => { input.value = String(next); },
    listen: fn => input.addEventListener(eventName, fn), setDisabled: on => { input.disabled = on; }
  });
  if (param.kind === "select" && param.display !== "radio") {
    const select = make(doc, "select", { id: param.key, title: param.help ?? param.label },
      ...param.options.map(([option, text]) => make(doc, "option", { value: option, textContent: text })));
    select.value = value;
    const label = make(doc, "label", {}, param.label ?? param.key, ...(param.label && param.help ? [make(doc, "small", { textContent: param.help })] : []), select);
    if (param.wide) label.setAttribute("style", "grid-column: 1 / -1");
    return single(select, label, "change");
  }
  if (param.kind === "select" || param.kind === "size") {
    // <div class="choices" role="radiogroup"><span><code>key</code> <small>help</small></span><label class="choice">…</div>
    const heading = make(doc, "span", { id: param.key + "-label" }, ...keyLabel());
    const radios = param.options.map(([option]) => make(doc, "input", { type: "radio", name: param.key, value: option, id: param.key + "-" + option, checked: option === value }));
    const group = make(doc, "div", { className: "choices" }, heading,
      ...param.options.map(([, text], i) => make(doc, "label", { className: "choice" }, radios[i], make(doc, "span", { textContent: text }))));
    group.setAttribute("role", "radiogroup"); group.setAttribute("aria-labelledby", heading.id);
    return {
      element: group, radios,
      read: () => radios.find(radio => radio.checked)?.value,
      write: next => { for (const radio of radios) radio.checked = radio.value === next; },
      listen: fn => { for (const radio of radios) radio.addEventListener("change", fn); },
      setDisabled: on => { for (const radio of radios) radio.disabled = on; }
    };
  }
  if (param.kind === "toggle") {
    const input = make(doc, "input", { id: param.key, type: "checkbox", checked: value });
    const label = make(doc, "label", { className: "choice" }, input, make(doc, "span", {}, ...keyLabel()));
    return { ...single(input, label, "change"), read: () => input.checked, write: next => { input.checked = next; } };
  }
  const input = param.kind === "seed"
    ? make(doc, "input", { id: param.key, type: "number", min: "0", max: "4294967295", step: "1", value: String(value) })
    : make(doc, "input", { id: param.key, type: "range", min: String(param.min), max: String(param.max), step: String(param.step), value: String(value) });
  const output = param.kind === "range" ? make(doc, "output", { id: param.key + "-value" }) : null;
  const label = make(doc, "label", {}, ...keyLabel(), ...(output ? [output] : []), input);
  return { ...single(input, label, param.kind === "range" ? "input" : "change"), output };
}

export function mountExperiment(experiment, {
  doc = globalThis.document,
  canvas = doc.getElementById("sky"),
  playing = experiment.autoplay === true && !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  raf = globalThis.requestAnimationFrame,
  presets = true,
  serviceWorker = globalThis.navigator?.serviceWorker
} = {}) {
  validateExperiment(experiment);
  const element = id => doc.getElementById(id);
  const context = canvas.getContext("2d");
  const sizeParam = experiment.params.find(param => param.kind === "size");
  // Defaults, except seeds marked random start each page load somewhere new.
  const freshDefaults = () => Object.fromEntries(experiment.params.map(param => [param.key, param.kind === "seed" && param.random ? randomSeed() : param.default]));
  let params = freshDefaults();
  const clock = createClock({ time: timeForPhase(DEFAULT_SUN_PHASE), playing: false });
  // The shared sun path's shape (sunPathWidth, sunPathHeight, sunPathX, sunPathY): host-owned
  // settings every sun-bearing experiment shows and saves the same way.
  let sunShape = { ...DEFAULT_SUN_SHAPE };
  const frameInfo = () => ({ time: clock.time, sun: sunAt(clock.time, sunShape) });
  let dirty = true, sinceRender = Infinity, decorDirty = true, loading = false, instance = null;
  const controls = new Map();
  const status = text => { const line = element("status"); if (line) line.textContent = text; };

  // The instance, rebuilt only when the grid size changes. While its `ready` promise is
  // pending, playback, actions and seed buttons stay disabled and nothing is drawn.
  const lockable = [];
  function build() {
    if (sizeParam) Object.assign(canvas, parseSize(params[sizeParam.key]));
    const next = validateInstance(experiment.create({ width: canvas.width, height: canvas.height, params, doc }));
    instance?.dispose();
    instance = next;
    if (next.ready) {
      loading = true; lock(true);
      next.ready.then(() => { if (instance === next) { loading = false; lock(false); decorDirty = dirty = true; } },
        error => { console.error(`${experiment.title} failed to load`, error); status(`${experiment.title} could not load its resources. Reload online to try again.`); });
    }
    dirty = decorDirty = true;
  }
  const lock = on => { for (const button of lockable) button.disabled = on; };

  function render() {
    const frame = frameInfo();
    const pixels = instance.render(frame);
    if (pixels) {
      const image = context.createImageData(canvas.width, canvas.height);
      image.data.set(pixels);
      context.putImageData(image, 0, 0);
    }
    for (const control of controls.values()) if (control.output) control.output.textContent = control.read();
    if (sunControl) {
      sunControl.input.value = String(frame.sun.phase);
      sunControl.output.textContent = `${frame.sun.azimuth.toFixed(0)}° across, ${frame.sun.elevation.toFixed(1)}° up`;
    }
    const stats = element("stats");
    if (stats && experiment.stats && !loading) stats.textContent = experiment.stats(params, frame, instance);
    for (const [id, readout] of Object.entries(experiment.readouts ?? {})) {
      const target = element(id);
      if (target) target.textContent = readout(params, frame, instance);
    }
    if (refreshDecor && decorDirty && !loading) { refreshDecor(params, instance); decorDirty = false; }
    dirty = false; sinceRender = 0;
  }

  // Take a full params object: clean it, link it (adjust), show it, grey out idle controls,
  // and pass it on (rebuilding at a new grid size). Redraws on the next frame.
  function setParams(raw, { linked = false } = {}) {
    const previous = params;
    let next = cleanParams(experiment, raw, previous);
    if (linked && experiment.adjust) next = cleanParams(experiment, experiment.adjust(next, previous), next);
    params = next;
    for (const [key, control] of controls) if (key in params && control.read() !== params[key] && String(control.read()) !== String(params[key])) control.write(params[key]);
    syncEnabled();
    if (sizeParam && params[sizeParam.key] !== previous[sizeParam.key]) build();
    else instance.update(params, { playing: clock.playing });
    dirty = decorDirty = true;
  }
  const syncEnabled = () => {
    for (const param of experiment.params) if (param.enabled && controls.has(param.key)) controls.get(param.key).setDisabled(!param.enabled(params));
  };

  // Playback: Play/Pause runs the shared clock (the sun, and any simulation); Reset sun.
  const playback = element("playback");
  const [playLabel, pauseLabel] = experiment.playLabels ?? (experiment.sun ? ["Play sun", "Pause sun"] : ["Play", "Pause"]);
  const play = make(doc, "button", { id: "play", type: "button", title: experiment.sun
    ? "Start or stop the shared clock that moves the sun along its vertical figure-eight path"
    : "Start or stop the simulation clock" });
  lockable.push(play);
  function setPlaying(value) {
    clock.play(value);
    play.textContent = value ? pauseLabel : playLabel;
    play.setAttribute("aria-pressed", String(value));
  }
  play.addEventListener("click", () => setPlaying(!clock.playing));
  playback.append(play);
  if (experiment.sun) {
    const reset = make(doc, "button", { id: "reset", type: "button", textContent: "Reset sun", title: "Stop the sun and put it back at its starting point on the path (the path's shape stays)" });
    reset.addEventListener("click", () => { setPlaying(false); clock.set(timeForPhase(DEFAULT_SUN_PHASE)); dirty = true; });
    playback.append(reset);
  }
  // What an action may do with the page.
  const actionPage = () => ({
    instance, params, setPlaying, redraw: () => { dirty = true; },
    // Everything back to its defaults (fresh random seeds, the sun back at its start and its
    // path at the default shape), except the keys in `keep`.
    resetToDefaults({ keep = [] } = {}) {
      const kept = Object.fromEntries(keep.map(key => [key, params[key]]));
      if (experiment.sun) {
        clock.set(timeForPhase(DEFAULT_SUN_PHASE)); sunShape = { ...DEFAULT_SUN_SHAPE };
        for (const param of SUN_PATH_PARAMS) controls.get(param.key).write(sunShape[param.key]);
      }
      setParams({ ...freshDefaults(), ...kept });
    }
  });
  for (const action of experiment.actions ?? []) {
    const button = make(doc, "button", { id: action.id, type: "button", textContent: action.label, title: action.title ?? action.label });
    button.addEventListener("click", () => { action.run(actionPage()); dirty = true; });
    lockable.push(button);
    playback.append(button);
  }

  // Generated controls, in schema order. When the experiment has a sun, the shared sun
  // position and path shape go just before its first slider, where each study used to keep
  // its own sun sliders. Params with a group share a fieldset with that legend.
  const panel = element("controls");
  const sunControl = experiment.sun ? buildControl(doc, { key: "sunPhase", kind: "range", min: 0, max: 1, step: 0.001,
    help: "Sun position on the shared vertical figure-eight path (0 to 1), the same in every experiment with a sun. Moving it stops the sun." }, sunPhase(clock.time)) : null;
  if (sunControl) {
    sunControl.input.step = "any";
    sunControl.listen(() => { setPlaying(false); clock.set(timeForPhase(Number(sunControl.read()))); dirty = true; });
  }
  // The path's size and position follow the sun slider; they do not stop the sun.
  const sunShapeControls = experiment.sun ? SUN_PATH_PARAMS.map(param => {
    const control = buildControl(doc, param, sunShape[param.key]);
    control.listen(() => { sunShape = { ...sunShape, [param.key]: cleanParam(param, control.read()) }; dirty = true; });
    controls.set(param.key, control);
    return control;
  }) : [];
  const placeSun = () => panel.append(sunControl.element, ...sunShapeControls.map(control => control.element));
  const groups = new Map();
  const container = param => {
    if (!param.group) return panel;
    if (!groups.has(param.group)) {
      const fieldset = make(doc, "fieldset", {}, make(doc, "legend", { textContent: param.group }));
      groups.set(param.group, fieldset); panel.append(fieldset);
    }
    return groups.get(param.group);
  };
  const seedButtons = [];
  for (const param of experiment.params) {
    if (sunControl && param.kind === "range" && !param.hidden && !sunControl.element.parentNode) placeSun();
    const control = param.hidden
      ? { read: () => params[param.key], write() {}, listen() {}, setDisabled() {} }
      : buildControl(doc, param, params[param.key]);
    controls.set(param.key, control);
    if (!param.hidden) container(param).append(control.element);
    const commit = value => {
      control.input?.setCustomValidity?.("");
      const clean = cleanParam(param, value, null);
      if (clean === null) {
        control.input?.setCustomValidity?.("Use an integer from 0 to 4294967295."); control.input?.reportValidity?.(); return;
      }
      setParams({ ...params, [param.key]: clean }, { linked: true });
    };
    control.listen(() => commit(control.read()));
    if (param.kind === "seed") {
      const button = make(doc, "button", { id: "new-" + param.key, type: "button", textContent: param.newLabel ?? "New seed", title: param.newTitle ?? "Pick a random seed" });
      button.addEventListener("click", () => commit(param.next ? param.next(params[param.key]) >>> 0 : randomSeed()));
      lockable.push(button); seedButtons.push(button);
    }
  }
  playback.append(...seedButtons);
  if (sunControl && !sunControl.element.parentNode) placeSun();

  // Drift (optional): while playing, the experiment's driftable sliders wander on their own
  // slow random walk (own random numbers, so simulation seeds are untouched). Dragging a
  // slider takes it over. The walk moves by the clock time that passes, so it stops when paused.
  let drift = null, driftBox = null;
  if (experiment.drift) {
    driftBox = make(doc, "input", { id: "drift", type: "checkbox", checked: false });
    playback.append(make(doc, "label", { className: "drift" }, driftBox, " Drift ",
      make(doc, "small", { textContent: "While playing, every slider wanders slowly on its own (noticeably within a minute); drag one to steer it." })));
    const sliders = driftableParams(experiment).map(param => controls.get(param.key).input);
    let moved = null;
    drift = bindDrift(sliders, { seed: randomSeed(), onChange: slider => { (moved ??= {})[slider.id] = slider.value; } });
    driftBox.addEventListener("change", () => drift.sync());
    drift.advance = dt => {
      moved = null; drift.step(dt);
      if (moved) setParams({ ...params, ...moved });
    };
  }

  // The optional custom-control hook: pieces of page an experiment adds next to its
  // generated controls (Valley's texture previews), refreshed after params change or load.
  const refreshDecor = experiment.decorate?.({ doc, controlFor: key => controls.get(key)?.element ?? null }) ?? null;

  build();
  syncEnabled();
  setPlaying(playing);

  const stop = startLoop(dt => {
    const advanced = loading ? 0 : clock.advance(dt);
    let changed = false;
    if (advanced) {
      if (drift && driftBox.checked) drift.advance(advanced);
      changed = instance.step(advanced, frameInfo()) !== false || experiment.sun;
    }
    sinceRender += dt * 1000;
    if (dirty || (changed && sinceRender >= (experiment.frameInterval ?? 0))) render();
  }, { raf, doc });

  // Ratings and links: every param, the sun's place on the path and the path's shape, the
  // grid size and Drift.
  const getParams = () => ({
    ...params,
    ...(experiment.sun ? { sunPhase: sunPhase(clock.time), ...sunShape } : {}),
    ...(sizeParam ? {} : { resolution: `${canvas.width}x${canvas.height}` }),
    ...(experiment.drift ? { drift: driftBox.checked } : {})
  });
  function applyParams(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    if (experiment.sun) {
      setPlaying(false);
      // Saved before the path had settings: the default shape. Saved with a fixed sun
      // (sunAzimuth/sunElevation sliders): the nearest point on the path. Other old keys,
      // such as sunSpeed, are dropped by cleanParams.
      sunShape = Object.fromEntries(SUN_PATH_PARAMS.map(param => [param.key, cleanParam(param, source[param.key])]));
      for (const param of SUN_PATH_PARAMS) controls.get(param.key).write(sunShape[param.key]);
      if (finite(source.sunPhase)) clock.set(timeForPhase(source.sunPhase));
      else if (finite(source.sunAzimuth) && finite(source.sunElevation)) clock.set(timeForPhase(nearestPhase(source.sunAzimuth, source.sunElevation, sunShape)));
    }
    if (driftBox && typeof source.drift === "boolean") driftBox.checked = source.drift;
    // Missing keys fall back to defaults (seeds included, so a saved run is reproduced).
    setParams(cleanParams(experiment, source, defaultParams(experiment)));
    drift?.sync();
  }
  if (presets) mountPresetBar(element("presets"), { app: experiment.app, getParams, applyParams, canvas });

  serviceWorker?.register("./cloud-sw.js").catch(error => {
    console.error(`${experiment.title} offline setup failed`, error);
    status("Offline setup failed; the experiment still works online.");
  });

  return {
    clock, getParams, applyParams, setPlaying, render,
    get instance() { return instance; },
    get params() { return params; },
    dispose() { stop(); instance.dispose(); }
  };
}
