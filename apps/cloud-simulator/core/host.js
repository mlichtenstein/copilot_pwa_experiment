/*
 * Purpose: Turn an experiment module (core/experiment.js contract) into a working page: build
 *   its controls from the params schema, run the one shared loop and clock, move the shared
 *   sun, draw to the canvas, and wire the emoji rating bar and ?p= links through generic
 *   getParams/applyParams. It alone builds the common panel, identical on every page (Play/
 *   Pause and Step, Randomize, Drift, Drift speed, then New seed with `seed` and the Sun group
 *   with `sun`), and below it the experiment's own section under its title. Optional
 *   capabilities (autoplay, Drift, seed, stepSeconds, actions, migrate, readouts, a grid-size
 *   switch, linked params, custom decorations, async loading) are all generic.
 * Consumers: every experiment page script (../sunset.js, ../convection.js, ../horizon.js,
 *   ../shafts.js, ../noise.js, ../valley.js, ../lightning.js); the core tests (common-panel.test.js
 *   among them) and the per-experiment UI tests.
 * Dependencies: experiment.js, clock.js, sun-path.js, ../../shared/presets-panel.js,
 *   ../../shared/drift.js; the page's DOM contract: <canvas id="sky">, and empty containers
 *   #presets (rating bar), #playback (the common panel), #stats (moved under the experiment's
 *   heading), #controls (the experiment's own section) and
 *   #status, plus any element an experiment's readouts name; Canvas 2D,
 *   requestAnimationFrame and optionally matchMedia and the service worker API.
 */
import { validateExperiment, validateInstance, cleanParams, cleanParam, defaultParams, driftableParams, parseSize } from "./experiment.js";
import { createClock, startLoop } from "./clock.js";
import { DEFAULT_SUN_SHAPE, SUN_PATH_PARAMS, nearestPhase, sunAt, sunPhase, timeForPhase } from "./sun-path.js";
import { mountPresetBar } from "../../shared/presets-panel.js";
import { bindDrift, seededRandom, DRIFT } from "../../shared/drift.js";

// Where the sun starts and where Reset sun puts it: an eighth of the way round, in the top
// lobe, high and to the right (15° across and about 20° up with the default path shape).
export const DEFAULT_SUN_PHASE = 0.125;

const make = (doc, tag, props = {}, ...children) => {
  const node = Object.assign(doc.createElement(tag), props);
  node.append(...children);
  return node;
};
// The common panel's words: one set for every page (see the panel below).
export const PANEL_TEXT = {
  play: "Play",
  playTitle: "Start or stop this page's one shared clock",
  stepTitle: "Pause, then move the clock on by one step",
  playNote: "Play runs this page's one clock: the sun, wind, simulation and Drift all move with it. Step pauses and moves it on one step (one simulation tick, or one second).",
  randomizeTitle: "Set every slider Drift moves to a random value in its range",
  randomizeNote: "Every slider Drift moves jumps to a random value in its range. Greyed-out sliders, playback speeds, seeds, menus, toggles and the sun stay.",
  driftTitle: "Slowly wander the sliders on a random walk across their whole range while playing",
  driftNote: "While playing, the experiment's sliders wander slowly, anywhere in their range; drag one to steer it. Greyed-out sliders, playback speeds, seeds, menus, toggles and the sun stay put.",
  speedTitle: "How fast Drift moves the sliders: 0.1× to 10× (log scale), 1× in the middle",
  speedNote: "Scales each drift step; 1× crosses a slider's range in about 7 minutes, 10× in seconds, 0.1× in hours.",
  newSeedTitle: "Pick a new seed for this experiment's randomness",
  newSeedNote: "A new seed for the experiment's randomness (cloud layout, noise, run or strike); your slider settings stay.",
  resetSunTitle: "Stop the sun and put it back at its starting point on the path (the path's shape stays)",
  resetSunNote: "Stops the sun and puts it back at its starting point; the path's shape stays."
};

const randomSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
const finite = value => typeof value === "number" && Number.isFinite(value);

// One control per param, matching the hand-written markup the pages used before. Every
// control is { element, read(), write(value), listen(fn), setDisabled(on), output?, input? }.
function buildControl(doc, param, value) {
  const control = buildInput(doc, param, value);
  // wide: the control spans the whole controls grid row.
  if (param.wide) control.element.setAttribute("style", "grid-column: 1 / -1");
  return control;
}
function buildInput(doc, param, value) {
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
        error => { console.error(`${experiment.title} failed to load`, error); status(experiment.loadError ?? `${experiment.title} could not load its resources. Reload online to try again.`); });
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

  // The common panel (#playback): the controls every experiment shares, built here and only
  // here, in one order with the same labels, tooltips and explanatory texts on every page.
  // Items every page has come first, so they never move; capability items follow: New seed
  // (experiment.seed), then the Sun group (experiment.sun). Each button's or slider's text
  // sits beside it. The experiment's own controls follow in a section under its title.
  const commonPanel = element("playback");
  commonPanel.className = "common-panel";
  commonPanel.setAttribute("role", "group"); commonPanel.setAttribute("aria-label", "Common controls");
  const note = text => make(doc, "small", { textContent: text });
  const row = (className, ...children) => make(doc, "div", { className: `panel-row ${className}` }, ...children);
  const button = (id, textContent, title) => make(doc, "button", { id, type: "button", textContent, title });
  commonPanel.append(make(doc, "h2", { className: "panel-heading", textContent: "Common controls" }));

  // 1. Play/Pause and Step: the one shared clock that moves everything time-based on the
  // page (the sun, wind, any simulation and Drift).
  const play = button("play", PANEL_TEXT.play, PANEL_TEXT.playTitle);
  const step = button("step", "Step", PANEL_TEXT.stepTitle);
  lockable.push(play, step);
  function setPlaying(value) {
    clock.play(value);
    play.textContent = value ? "Pause" : PANEL_TEXT.play;
    play.setAttribute("aria-pressed", String(value));
  }
  play.addEventListener("click", () => setPlaying(!clock.playing));
  // Step pauses, then moves the clock on by one step (experiment.stepSeconds: one simulation
  // tick, or one second). Drift waits for Play.
  step.addEventListener("click", () => {
    setPlaying(false);
    const seconds = typeof experiment.stepSeconds === "function" ? experiment.stepSeconds(params) : experiment.stepSeconds ?? 1;
    clock.set(clock.time + seconds);
    instance.step(seconds, frameInfo());
    dirty = true;
  });
  commonPanel.append(row("play-row", play, step, note(PANEL_TEXT.playNote)));

  // What an action may do with the page.
  const actionPage = () => ({
    instance, params, setPlaying, redraw: () => { dirty = true; },
    setParams: partial => setParams({ ...params, ...partial }),
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

  // The experiment's own section: its title, its stats line, its unique buttons (each with
  // its help beside it), then its generated controls in schema order. Params with a group
  // share a fieldset with that legend.
  const panel = element("controls");
  const ownHead = [make(doc, "h2", { className: "experiment-heading", textContent: `${experiment.title} settings` })];
  const statsLine = element("stats");
  if (statsLine) ownHead.push(statsLine);
  const ownButtons = [];
  for (const action of experiment.actions ?? []) {
    const actionButton = button(action.id, action.label, action.title ?? action.label);
    actionButton.addEventListener("click", () => { action.run(actionPage()); dirty = true; });
    lockable.push(actionButton);
    ownButtons.push(row("own-action", actionButton, ...(action.help ? [note(action.help)] : [])));
  }
  const groups = new Map();
  const container = param => {
    if (!param.group) return panel;
    if (!groups.has(param.group)) {
      // A group with a note (groupNotes) gets a bold title: "<b>Cloud layer</b> · note".
      const groupNote = experiment.groupNotes?.[param.group];
      const legend = groupNote === undefined ? make(doc, "legend", { textContent: param.group })
        : make(doc, "legend", {}, make(doc, "b", { textContent: param.group }), ...(groupNote ? [` · ${groupNote}`] : []));
      const fieldset = make(doc, "fieldset", {}, legend);
      groups.set(param.group, fieldset); panel.append(fieldset);
    }
    return groups.get(param.group);
  };
  let newSeed = null;
  for (const param of experiment.params) {
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
      const common = param.key === experiment.seed;
      const seedButton = common ? button("new-seed", "New seed", PANEL_TEXT.newSeedTitle)
        : button("new-" + param.key, param.newLabel ?? "New seed", param.newTitle ?? "Pick a random seed");
      seedButton.addEventListener("click", () => commit(param.next ? param.next(params[param.key]) >>> 0 : randomSeed()));
      lockable.push(seedButton);
      if (common) newSeed = seedButton;
      else {
        // Other seeds are the experiment's own: its section, or the element buttonsIn names.
        const target = param.buttonsIn ? element(param.buttonsIn) : null;
        if (target) target.append(seedButton); else ownButtons.push(row("own-action", seedButton));
      }
    }
  }
  panel.prepend(...ownHead, ...ownButtons);

  // 2–4. Randomize, Drift and Drift speed (every experiment with a driftable slider, unless
  // it sets drift: false). While playing, those sliders wander on their own slow random walk
  // across their whole range (own random numbers, so simulation seeds are untouched).
  // Dragging a slider takes it over; greyed-out sliders hold still. The walk moves by the
  // clock time that passes, so it stops when paused; drift changes redraw at the
  // experiment's frame rate.
  const driftParams = experiment.drift === false ? [] : driftableParams(experiment);
  const driftSliders = driftParams.map(param => controls.get(param.key).input);
  let drift = null, driftBox = null, speedInput = null, speedOutput = null;
  const setDriftSpeed = value => {
    const speed = Math.min(DRIFT.speed.max, Math.max(DRIFT.speed.min, finite(value) ? value : DRIFT.speed.default));
    speedInput.value = String(Math.log10(speed));
    speedOutput.textContent = `${speed < 1 ? speed.toFixed(2) : speed.toFixed(1)}×`;
    drift.walk.setSpeed(speed);
  };
  if (driftSliders.length) {
    // Randomize: every slider Drift moves (not the sun, its path, seeds, menus, toggles or
    // greyed-out sliders) to a uniformly random value in its range, from its own random numbers.
    const randomize = button("randomize", "Randomize", PANEL_TEXT.randomizeTitle);
    driftBox = make(doc, "input", { id: "drift", type: "checkbox", checked: false });
    const driftLabel = make(doc, "label", { className: "panel-row drift", title: PANEL_TEXT.driftTitle }, driftBox, " Drift ", note(PANEL_TEXT.driftNote));
    // Drift speed: a log slider from 0.1× to 10× the walk's step, 1× in the middle. It never
    // drifts or gets randomized itself; it stays live while Drift is off so it can be set first.
    speedInput = make(doc, "input", { id: "drift-speed", type: "range", min: "-1", max: "1", step: "0.05", value: "0" });
    const speedLabel = make(doc, "label", { className: "panel-row drift-speed", title: PANEL_TEXT.speedTitle },
      "Drift speed ", speedInput, speedOutput = make(doc, "output", { textContent: "1.0×" }), note(PANEL_TEXT.speedNote));
    commonPanel.append(row("randomize", randomize, note(PANEL_TEXT.randomizeNote)), driftLabel, speedLabel);
    lockable.push(randomize);
    let moved = null;
    drift = bindDrift(driftSliders, { seed: randomSeed(), onChange: slider => { (moved ??= {})[slider.id] = slider.value; } });
    driftBox.addEventListener("change", () => drift.sync());
    speedInput.addEventListener("input", () => setDriftSpeed(10 ** Number(speedInput.value)));
    const randomizeRandom = seededRandom(randomSeed());
    randomize.addEventListener("click", () => {
      const next = {};
      for (const param of driftParams) {
        if (controls.get(param.key).input.disabled) continue;
        const steps = Math.floor((param.max - param.min) / param.step + 1e-9);
        next[param.key] = Math.min(param.max, Number((param.min + Math.floor(randomizeRandom() * (steps + 1)) * param.step).toFixed(10)));
      }
      setParams({ ...params, ...next }, { linked: true });
      drift.sync();
    });
    // Returns true when a slider moved; the redraw then waits for frameInterval like any
    // other playback frame rather than forcing one every animation frame.
    drift.advance = dt => {
      moved = null; drift.step(dt);
      if (!moved) return false;
      const wasDirty = dirty;
      setParams({ ...params, ...moved });
      dirty = wasDirty;
      return true;
    };
  }

  // 5. New seed (experiment.seed): a new seed for the experiment's randomness.
  if (newSeed) commonPanel.append(row("new-seed", newSeed, note(PANEL_TEXT.newSeedNote)));

  // 6. The Sun group (experiment.sun): Reset sun, the sun's place on the shared path and the
  // path's shape, the same in every experiment with a sun.
  const sunControl = experiment.sun ? buildControl(doc, { key: "sunPhase", kind: "range", min: 0, max: 1, step: 0.001,
    help: "Sun position on the shared vertical figure-eight path (0 to 1), the same in every experiment with a sun. Moving it stops the sun." }, sunPhase(clock.time)) : null;
  if (sunControl) {
    sunControl.input.step = "any";
    sunControl.listen(() => { setPlaying(false); clock.set(timeForPhase(Number(sunControl.read()))); dirty = true; });
    // The path's size and position follow the sun slider; they do not stop the sun.
    const sunShapeControls = SUN_PATH_PARAMS.map(param => {
      const control = buildControl(doc, param, sunShape[param.key]);
      control.listen(() => { sunShape = { ...sunShape, [param.key]: cleanParam(param, control.read()) }; dirty = true; });
      controls.set(param.key, control);
      return control;
    });
    const resetSun = button("reset-sun", "Reset sun", PANEL_TEXT.resetSunTitle);
    resetSun.addEventListener("click", () => { setPlaying(false); clock.set(timeForPhase(DEFAULT_SUN_PHASE)); dirty = true; });
    commonPanel.append(make(doc, "fieldset", { className: "panel-sun" }, make(doc, "legend", { textContent: "Sun" }),
      row("reset-sun", resetSun, note(PANEL_TEXT.resetSunNote)), sunControl.element, ...sunShapeControls.map(control => control.element)));
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
      const drifted = drift && driftBox.checked ? drift.advance(advanced) : false;
      changed = instance.step(advanced, frameInfo()) !== false || experiment.sun || drifted;
    }
    sinceRender += dt * 1000;
    if (dirty || (changed && sinceRender >= (experiment.frameInterval ?? 0))) render();
  }, { raf, doc });

  // Ratings and links: every param, the sun's place on the path and the path's shape, the
  // grid size, Drift and its speed.
  const getParams = () => ({
    ...params,
    ...(experiment.sun ? { sunPhase: sunPhase(clock.time), ...sunShape } : {}),
    ...(sizeParam ? {} : { resolution: `${canvas.width}x${canvas.height}` }),
    ...(driftBox ? { drift: driftBox.checked, driftSpeed: drift.walk.speed } : {})
  });
  function applyParams(raw) {
    const given = raw && typeof raw === "object" ? raw : {};
    // An older saved shape (experiment.migrate) becomes flat params first.
    const migrated = experiment.migrate ? experiment.migrate(given) : given;
    const source = migrated && typeof migrated === "object" ? migrated : {};
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
    // Links from before the speed slider load at 1×.
    if (driftBox) setDriftSpeed(source.driftSpeed);
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
