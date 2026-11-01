/*
 * Purpose: Turn an experiment module (core/experiment.js contract) into a working page: build
 *   its controls from the params schema, run the one shared loop and clock, move the shared
 *   sun, draw to the canvas, and wire the emoji rating bar and ?p= links through generic
 *   getParams/applyParams. It alone builds the page header (core/header.js: title, tagline
 *   and the nav to every experiment, from the registry) and the common panel, identical on
 *   every page in compact rows (Play/Pause, Step, Randomize and, with `seed`, New seed; Drift
 *   and its speed; the time of day, inside the Sun group with `sun`, its path shape in a
 *   closed disclosure), and below it the experiment's own section under its title. After each
 *   render it darkens the frame for night from the shared sun (core/daylight.js). Every description is hidden and shown on
 *   hold, hover or focus by the one core/hold-help.js mechanism. Optional
 *   capabilities (autoplay, Drift, seed, stepSeconds, actions, migrate, readouts, a grid-size
 *   switch, linked params, custom decorations, async loading) are all generic.
 * Consumers: every experiment page script (../sunset.js, ../convection.js, ../horizon.js,
 *   ../shafts.js, ../noise.js, ../valley.js, ../lightning.js); the core tests (common-panel.test.js
 *   among them) and the per-experiment UI tests.
 * Dependencies: experiment.js, clock.js, sun-path.js, daylight.js, header.js, hold-help.js, ../../shared/presets-panel.js,
 *   ../../shared/drift.js; the page's DOM contract: <canvas id="sky">, and empty containers
 *   <header id="header"> (the header and nav),
 *   #presets (rating bar), #playback (the common panel), #stats (moved under the experiment's
 *   heading), #controls (the experiment's own section) and
 *   #status, plus any element an experiment's readouts name; Canvas 2D,
 *   requestAnimationFrame and optionally matchMedia and the service worker API.
 */
import { validateExperiment, validateInstance, cleanParams, cleanParam, defaultParams, driftableParams, parseSize, randomParams, randomValue } from "./experiment.js";
import { createClock, startLoop } from "./clock.js";
import { DEFAULT_SUN_SHAPE, LEGACY_SUN_SHAPE, SUN_PATH_PARAMS, clockText, nearestPhase, phaseForTimeOfDay, sunAt, sunPhase, timeForPhase, timeOfDay } from "./sun-path.js";
import { NIGHT, applyNight, daylight } from "./daylight.js";
import { mountPresetBar } from "../../shared/presets-panel.js";
import { bindDrift, seededRandom, DRIFT } from "../../shared/drift.js";
import { createHoldHelp } from "./hold-help.js";
import { mountHeader } from "./header.js";

// Where the clock starts and where Reset sun puts it: an eighth of the way round, 09:00, in
// the top lobe, high and to the right (15° across and about 21° up with the default path).
export const DEFAULT_SUN_PHASE = 0.125;

const make = (doc, tag, props = {}, ...children) => {
  const node = Object.assign(doc.createElement(tag), props);
  node.append(...children);
  return node;
};
// The common panel's words: one set for every page (see the panel below).
// Each description is hidden until someone holds (or hovers or focuses) its control.
export const PANEL_TEXT = {
  play: "Play",
  hint: "Hold any control to see what it does",
  playNote: "Starts or stops this page's one clock: the sun, wind, simulation and Drift all move with it.",
  stepNote: "Pauses, then moves the clock on by one step (one simulation tick, or one second).",
  randomizeNote: "Randomizes scene settings: sliders (greyed-out ones too), scene menus, toggles and seeds, plus time of day and sun path shape. Inspection views, selected field layers, layer visibility and lighting comparison mode stay, along with Play/Pause, Drift, grid size and playback speeds.",
  driftNote: "On by default (links and ratings keep their own setting; older ones load with it off). While playing, the experiment's sliders wander slowly on a random walk, anywhere in their range; drag one to steer it. Greyed-out sliders, playback speeds, seeds, menus, toggles and the sun stay put.",
  speedNote: "How fast Drift moves, 0.1× to 10× on a log scale: 1× crosses a slider's range in about 7 minutes, 10× in seconds, 0.1× in hours.",
  newSeedNote: "A new seed for the experiment's randomness (cloud layout, noise, run or strike); your slider settings stay.",
  resetSunNote: "Stops the sun and puts it back at 09:00, its starting point on the path; the path's shape stays.",
  timeOfDayNote: "Time of day on the shared clock, 00:00 to 24:00: the sun is highest at noon and lowest at midnight, and a day takes 90 s of Play. Once the sun is below the horizon the page darkens to night (dim blue, not black). Moving it pauses the clock.",
  sunPathSummary: "Sun path shape"
};

const randomSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
const finite = value => typeof value === "number" && Number.isFinite(value);

// One control per param, matching the hand-written markup the pages used before. Every
// control is { element, read(), write(value), listen(fn), setDisabled(on), output?, input? }.
function buildControl(doc, param, value, help) {
  const control = buildInput(doc, param, value, help);
  // wide: the control spans the whole controls grid row.
  if (param.wide) control.element.setAttribute("style", "grid-column: 1 / -1");
  return control;
}
// Its description (param.help) is hidden on its label until held: help.attach (hold-help.js).
function buildInput(doc, param, value, help) {
  const describe = (host, control) => { if (param.help) help.attach(host, param.help, control); };
  const keyLabel = () => [make(doc, "code", { textContent: param.key })];
  const single = (input, element, eventName) => ({
    element, input, read: () => input.value, write: next => { input.value = String(next); },
    listen: fn => input.addEventListener(eventName, fn), setDisabled: on => { input.disabled = on; }
  });
  if (param.kind === "select" && param.display !== "radio") {
    const select = make(doc, "select", { id: param.key },
      ...param.options.map(([option, text]) => make(doc, "option", { value: option, textContent: text })));
    select.value = value;
    const label = make(doc, "label", {}, ...keyLabel(), " ", select);
    describe(label, select);
    return single(select, label, "change");
  }
  if (param.kind === "select" || param.kind === "size") {
    // <div class="choices" role="radiogroup"><span><code>key</code> <small>help</small></span><label class="choice">…</div>
    const heading = make(doc, "span", { id: param.key + "-label" }, ...keyLabel());
    const radios = param.options.map(([option]) => make(doc, "input", { type: "radio", name: param.key, value: option, id: param.key + "-" + option, checked: option === value }));
    const group = make(doc, "div", { className: "choices" }, heading,
      ...param.options.map(([, text], i) => make(doc, "label", { className: "choice" }, radios[i], make(doc, "span", { textContent: text }))));
    group.setAttribute("role", "radiogroup"); group.setAttribute("aria-labelledby", heading.id);
    describe(heading, group);
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
    describe(label, input);
    return { ...single(input, label, "change"), read: () => input.checked, write: next => { input.checked = next; } };
  }
  const input = param.kind === "seed"
    ? make(doc, "input", { id: param.key, type: "number", min: "0", max: "4294967295", step: "1", value: String(value) })
    : make(doc, "input", { id: param.key, type: "range", min: String(param.min), max: String(param.max), step: String(param.step), value: String(value) });
  const output = param.kind === "range" ? make(doc, "output", { id: param.key + "-value" }) : null;
  const label = make(doc, "label", output ? { className: "slider" } : {}, ...keyLabel(), ...(output ? [output] : []), input);
  describe(label, input);
  return { ...single(input, label, param.kind === "range" ? "input" : "change"), output };
}

export function mountExperiment(experiment, {
  doc = globalThis.document,
  canvas = doc.getElementById("sky"),
  playing = experiment.autoplay === true && !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  raf = globalThis.requestAnimationFrame,
  presets = true,
  serviceWorker = globalThis.navigator?.serviceWorker,
  // Randomize's random numbers (() => [0, 1)); tests pass a seeded one.
  random = seededRandom(randomSeed())
} = {}) {
  validateExperiment(experiment);
  const element = id => doc.getElementById(id);
  // The shared header (header.js): title, tagline and links to every experiment.
  mountHeader(element("header"), { doc, current: experiment.id, title: experiment.title });
  // Hold-to-see help (hold-help.js) for every control on the page.
  const help = createHoldHelp(doc);
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
  // Night on every page (daylight.js): how much daylight the frame keeps, from the shared sun.
  // Sun-lit experiments shade their own dusk, so their ramp starts at the horizon instead of
  // +6°; a scene that lights itself (instance.selfLight, a lightning flash) stays that bright.
  const nightLight = frame => Math.max(daylight(frame.sun.elevation, experiment.sun ? { top: 0 } : {}), instance.selfLight?.() ?? 0);
  let renderedLight = 1;
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
    renderedLight = nightLight(frame);
    if (pixels) {
      const image = context.createImageData(canvas.width, canvas.height);
      image.data.set(pixels);
      // Night: the copy (never the instance's own buffer) darkens toward the night floor.
      applyNight(image.data, renderedLight, experiment.sun ? { keep: NIGHT.sunKeep } : {});
      context.putImageData(image, 0, 0);
    }
    for (const control of controls.values()) if (control.output) control.output.textContent = control.read();
    const hours = timeOfDay(frame.sun.phase);
    timeControl.input.value = String(hours);
    timeControl.output.textContent = experiment.sun
      ? `${clockText(hours)} · ${frame.sun.elevation.toFixed(0)}° up` : clockText(hours);
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
  // here, in one order with the same labels and descriptions on every page. Compact rows:
  // Play/Pause, Step, Randomize and New seed (experiment.seed) on one; Drift and its speed on
  // the next; then the Sun group (experiment.sun). Every description is hidden until its
  // control is held (hold-help.js). The experiment's own controls follow under its title.
  const commonPanel = element("playback");
  commonPanel.className = "common-panel";
  commonPanel.setAttribute("role", "group"); commonPanel.setAttribute("aria-label", "Common controls");
  const row = (className, ...children) => make(doc, "div", { className: `panel-row ${className}` }, ...children);
  const button = (id, textContent) => make(doc, "button", { id, type: "button", textContent });
  // A button in a wrapper that shows its description on hold.
  const described = (control, text, className = "") => {
    const host = make(doc, "span", className ? { className } : {}, control);
    help.attach(host, text, control);
    return host;
  };
  commonPanel.append(make(doc, "h2", { className: "panel-heading" }, "Common controls",
    make(doc, "span", { className: "hold-hint", textContent: "ⓘ hold for help", title: PANEL_TEXT.hint })));
  const buttonRow = row("buttons");
  commonPanel.append(buttonRow);

  // 1. Play/Pause and Step: the one shared clock that moves everything time-based on the
  // page (the sun, wind, any simulation and Drift).
  const play = button("play", PANEL_TEXT.play);
  const step = button("step", "Step");
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
  buttonRow.append(described(play, PANEL_TEXT.playNote), described(step, PANEL_TEXT.stepNote));

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
    const actionButton = button(action.id, action.label);
    actionButton.addEventListener("click", () => { action.run(actionPage()); dirty = true; });
    lockable.push(actionButton);
    ownButtons.push(described(actionButton, action.help ?? action.title ?? action.label, "own-action"));
  }
  const groups = new Map();
  const container = param => {
    if (!param.group) return panel;
    if (!groups.has(param.group)) {
      // A group with a note (groupNotes) gets a bold title: "<b>Cloud layer</b> · note".
      // Its note, like every description, shows when the legend is held.
      const groupNote = experiment.groupNotes?.[param.group];
      const legend = groupNote === undefined ? make(doc, "legend", { textContent: param.group })
        : make(doc, "legend", {}, make(doc, "b", { textContent: param.group }));
      const fieldset = make(doc, "fieldset", {}, legend);
      if (groupNote) help.attach(legend, groupNote, fieldset);
      groups.set(param.group, fieldset); panel.append(fieldset);
    }
    return groups.get(param.group);
  };
  let newSeed = null;
  for (const param of experiment.params) {
    const control = param.hidden
      ? { read: () => params[param.key], write() {}, listen() {}, setDisabled() {} }
      : buildControl(doc, param, params[param.key], help);
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
      const seedButton = common ? button("new-seed", "New seed")
        : Object.assign(button("new-" + param.key, param.newLabel ?? "New seed"), { title: param.newTitle ?? "Pick a random seed" });
      seedButton.addEventListener("click", () => commit(param.next ? param.next(params[param.key]) >>> 0 : randomSeed()));
      lockable.push(seedButton);
      if (common) newSeed = seedButton;
      else {
        // Other seeds are the experiment's own: its section, or the element buttonsIn names.
        const target = param.buttonsIn ? element(param.buttonsIn) : null;
        if (target) target.append(seedButton); else ownButtons.push(make(doc, "span", { className: "own-action" }, seedButton));
      }
    }
  }
  panel.prepend(...ownHead, ...(ownButtons.length ? [row("own-actions", ...ownButtons)] : []));

  // 2–4. Randomize, Drift and Drift speed (Drift on every experiment with a driftable slider,
  // unless it sets drift: false). While playing, those sliders wander on their own slow random walk
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
  // Randomize (every page): every setting gets a random value (randomParams: menus and
  // toggles first, then sliders, greyed-out ones included, and seeds), plus a random time of
  // day and sun path shape. Play/Pause, Drift, its speed and the grid size stay.
  const randomize = button("randomize", "Randomize");
  buttonRow.append(described(randomize, PANEL_TEXT.randomizeNote));
  lockable.push(randomize);
  randomize.addEventListener("click", () => {
    const next = randomParams(experiment, params, random);
    clock.set(timeForPhase(random()));
    if (experiment.sun) {
      sunShape = Object.fromEntries(SUN_PATH_PARAMS.map(param => [param.key, randomValue(param, random)]));
      for (const param of SUN_PATH_PARAMS) controls.get(param.key).write(sunShape[param.key]);
    }
    setParams(next, { linked: true });
    drift?.sync();
  });
  if (driftSliders.length) {
    // On by default on a fresh load (it still only moves while playing); a saved look sets it below.
    driftBox = make(doc, "input", { id: "drift", type: "checkbox", checked: true });
    const driftLabel = make(doc, "label", { className: "drift" }, driftBox, " Drift");
    help.attach(driftLabel, PANEL_TEXT.driftNote, driftBox);
    // Drift speed: a log slider from 0.1× to 10× the walk's step, 1× in the middle. It never
    // drifts or gets randomized itself; it stays live while Drift is off so it can be set first.
    speedInput = make(doc, "input", { id: "drift-speed", type: "range", min: "-1", max: "1", step: "0.05", value: "0" });
    speedInput.setAttribute("aria-label", "Drift speed");
    const speedLabel = make(doc, "label", { className: "drift-speed" }, make(doc, "code", { textContent: "driftSpeed" }), " ", speedInput, speedOutput = make(doc, "output", { textContent: "1.0×" }));
    help.attach(speedLabel, PANEL_TEXT.speedNote, speedInput);
    commonPanel.append(row("drift-row", driftLabel, speedLabel));
    let moved = null;
    drift = bindDrift(driftSliders, { seed: randomSeed(), onChange: slider => { (moved ??= {})[slider.id] = slider.value; } });
    driftBox.addEventListener("change", () => drift.sync());
    speedInput.addEventListener("input", () => setDriftSpeed(10 ** Number(speedInput.value)));
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

  // 5. New seed (experiment.seed): a new seed for the experiment's randomness, on the
  // buttons row (after Randomize, or after Step with no Drift).
  if (newSeed) buttonRow.append(described(newSeed, PANEL_TEXT.newSeedNote, "new-seed"));

  // 6. The time of day (every page): one slider from 00:00 to 24:00 on the shared clock
  // (sun-path.js: noon is the sun's highest point, midnight its lowest). Saved as sunPhase.
  // With experiment.sun it sits in the Sun group with Reset sun, then the path's shape behind
  // a disclosure (closed), the same in every experiment with a sun.
  const timeControl = buildControl(doc, { key: "timeOfDay", kind: "range", min: 0, max: 24, step: 1 / 60,
    help: PANEL_TEXT.timeOfDayNote }, timeOfDay(sunPhase(clock.time)), help);
  timeControl.input.step = "any";
  timeControl.listen(() => { setPlaying(false); clock.set(timeForPhase(phaseForTimeOfDay(Number(timeControl.read())))); dirty = true; });
  if (experiment.sun) {
    // The path's size and position follow the time slider; they do not stop the sun.
    const sunShapeControls = SUN_PATH_PARAMS.map(param => {
      const control = buildControl(doc, param, sunShape[param.key], help);
      control.listen(() => { sunShape = { ...sunShape, [param.key]: cleanParam(param, control.read()) }; dirty = true; });
      controls.set(param.key, control);
      return control;
    });
    const resetSun = button("reset-sun", "Reset sun");
    resetSun.addEventListener("click", () => { setPlaying(false); clock.set(timeForPhase(DEFAULT_SUN_PHASE)); dirty = true; });
    const pathShape = make(doc, "details", { className: "sun-path" }, make(doc, "summary", { textContent: PANEL_TEXT.sunPathSummary }),
      ...sunShapeControls.map(control => control.element));
    commonPanel.append(make(doc, "fieldset", { className: "panel-sun" }, make(doc, "legend", { textContent: "Sun" }),
      row("sun-row", described(resetSun, PANEL_TEXT.resetSunNote, "reset-sun"), timeControl.element), pathShape));
  } else commonPanel.append(row("time-row", timeControl.element));

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
      // Night follows the clock on every page, so a change in daylight redraws too.
      changed = instance.step(advanced, frameInfo()) !== false || experiment.sun || drifted
        || Math.abs(nightLight(frameInfo()) - renderedLight) > 0.002;
    }
    sinceRender += dt * 1000;
    if (dirty || (changed && sinceRender >= (experiment.frameInterval ?? 0))) render();
  }, { raf, doc });

  // Ratings and links: every param, the time of day (as sunPhase, the place on the path) and
  // the path's shape, the grid size, Drift and its speed.
  const getParams = () => ({
    ...params,
    sunPhase: sunPhase(clock.time),
    ...(experiment.sun ? sunShape : {}),
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
      // Saved before the path had settings: the shape it had then (LEGACY_SUN_SHAPE), so the
      // sun lands where it was. Saved with a fixed sun (sunAzimuth/sunElevation sliders): the
      // nearest point on the path. Other old keys, such as sunSpeed, are dropped by cleanParams.
      const legacy = !SUN_PATH_PARAMS.some(param => param.key in source);
      sunShape = Object.fromEntries(SUN_PATH_PARAMS.map(param => [param.key, cleanParam(param, source[param.key], (legacy ? LEGACY_SUN_SHAPE : DEFAULT_SUN_SHAPE)[param.key])]));
      for (const param of SUN_PATH_PARAMS) controls.get(param.key).write(sunShape[param.key]);
      if (finite(source.sunPhase)) clock.set(timeForPhase(source.sunPhase));
      else if (finite(source.sunAzimuth) && finite(source.sunElevation)) clock.set(timeForPhase(nearestPhase(source.sunAzimuth, source.sunElevation, sunShape)));
    } else if (finite(source.sunPhase)) clock.set(timeForPhase(source.sunPhase));
    // A saved drift value wins; looks saved before Drift existed (no drift key) load with it off,
    // as they were made, even though a fresh page starts with it on.
    if (driftBox) driftBox.checked = source.drift === true;
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
    clock, getParams, applyParams, setPlaying, render, help,
    get instance() { return instance; },
    get params() { return params; },
    dispose() { stop(); instance.dispose(); }
  };
}
