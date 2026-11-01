/*
 * Purpose: The common contract every cloud simulator experiment module meets, plus pure
 *   helpers over its params schema (defaults, cleaning untrusted params, which params drift).
 *   An experiment describes its controls in code and draws pixels; core/host.js turns that
 *   into a page (controls, shared loop and clock, shared sun, rating bar, ?p= links).
 * Consumers: core/host.js, core/registry.js, the experiment modules (../*-experiment.js),
 *   experiment.test.js.
 * Dependencies: none (pure).
 *
 * An experiment is a plain object:
 *   id            short name, also the page name (sunset → sunset.html)
 *   title         shown in headers and on the front page
 *   app           rating bar app id, e.g. "cloud-simulator/sunset"
 *   width, height native pixel grid (a "size" param can offer others)
 *   sun           true if it follows the shared sun path (core/sun-path.js); the host then
 *                 adds the Sun group (Reset sun, sunPhase and the sunPath* sliders) to the
 *                 common panel
 *   frameInterval fewest milliseconds between redraws while playing (0 = every frame)
 *   params        the controls, in display order (see PARAM_KINDS)
 *   create({ width, height, params, doc }) → instance
 * The common panel: the host, not the experiment, builds the controls every page shares, in
 * one order with one set of labels, tooltips and texts: Play/Pause and Step (the one shared
 * clock), Randomize, Drift, Drift speed, then New seed (only with `seed`) and the Sun group
 * (only with `sun`). An experiment declares capabilities; it never builds these itself.
 * Its own controls go in a section below, under its title.
 * Optional capabilities (each generic; an experiment uses only what it needs):
 *   autoplay      start playing on load (unless the reader prefers reduced motion); with
 *                 `sun`, loading a saved look keeps it playing too
 *   legacySunShape  false for a `sun` page that only followed the shared sun once the path
 *                 had settings: its saved looks without sunPath* keys load on the default
 *                 path, not the older shape (LEGACY_SUN_SHAPE) the first sun pages used
 *   seed          the key of the seed param the common New seed button changes (random, or
 *                 that param's next(value)); without it the panel has no New seed
 *   stepSeconds   clock seconds one Step advances (a number, or (params) => number): one
 *                 simulation tick; default 1
 *   drift         false to leave out the shared Drift checkbox and its speed slider.
 *                 Every experiment with driftableParams gets them otherwise (../../shared/drift.js);
 *                 they are saved as `drift` and `driftSpeed`
 *   actions       buttons only this experiment has, shown in its own section with their help
 *                 text beside them: [{ id, label, title, help?, run(page) }]; page is
 *                 { instance, params, setPlaying, setParams(partial), resetToDefaults({ keep }), redraw }
 *   migrate(raw) → raw   turn an older saved shape (ratings, ?p= links) into flat params
 *   readouts      { elementId: (params, frame, instance) => text } filled on each redraw
 *                 (legends, status lines)
 *   adjust(next, previous) → params   link params, e.g. a resolution switch sets pixelArt
 *   decorate({ doc, controlFor }) → refresh(params, instance)   add custom pieces next to
 *                 generated controls (previews); refresh runs after params change or load
 *   stats(params, frame, instance)    one-line status under the buttons
 *   loadError     status line shown if an instance's ready promise rejects
 *   groupNotes    { group: note } bolds those groups' titles and adds the note ("" for none)
 * An instance is:
 *   update(params, { playing })  take a full, cleaned params object (rebuild what depends on it)
 *   step(dt, frame)  advance any simulation by dt clock seconds; return false if nothing
 *                    visible changed (a fixed-rate simulation between its ticks)
 *   render(frame)    return RGBA pixels (Uint8ClampedArray of width × height × 4), or null
 *                    while not ready
 *   dispose()        release anything held
 *   selfLight()      optional: 0 to 1, how brightly the scene lights itself right now (a
 *                    lightning flash). The host's night step dims the frame by the darker of
 *                    daylight and this, so a flash stays bright at night
 *   ready            optional promise; the host keeps playback disabled until it settles
 * frame is { time, sun } where time is the shared clock in seconds and sun is
 * sunAt(time, shape) = { phase, azimuth, elevation } (degrees) on the shared vertical
 * figure-eight, sized and placed by the host-owned sunPath* settings.
 */

// Every kind takes { key, help?, group?, enabled?(params), hidden?, wide?, randomize? }:
// randomize: false leaves it out of the common Randomize (a playback speed, a start mode);
// wide spans the
// whole controls row, group puts it in a
// fieldset with that legend, enabled greys it out when it does nothing, hidden keeps it in
// params (saved, restored) with no visible input (a seed with only its "new" button).
// range:  { min, max, step, default, drift? }        a slider; drifts unless drift: false
// select: { label, options: [[value, label], …], default, display?: "menu" | "radio" }
// toggle: { default: true | false }                  a checkbox
// seed:   { default, newLabel, newTitle, random?, next?(value), buttonsIn? }
//         integer 0 … 2³² − 1 with a "new" button: random (or next(value)); random: true also
//         starts each page load on a random seed. The experiment's main seed (its `seed`
//         capability) uses the common panel's New seed instead; any other seed gets its own
//         button (newLabel) in the experiment's section, or in the element buttonsIn names
// size:   { key: "resolution", options: [["WxH", label], …], default }   grid size radios;
//         switching rebuilds the instance at that size
export const PARAM_KINDS = ["range", "select", "toggle", "seed", "size"];
export const SEED_MAX = 4294967295;
// Saved by the host itself: the sun's place on the shared path and the path's four shape
// settings (core/sun-path.js), the grid size (unless a size param owns it) and Drift.
export const RESERVED_KEYS = ["sunPhase", "timeOfDay", "sunPathWidth", "sunPathHeight", "sunPathX", "sunPathY", "resolution", "drift", "driftSpeed"];
const SIZE = /^(\d+)x(\d+)$/;
export const parseSize = value => { const match = SIZE.exec(value); return match ? { width: Number(match[1]), height: Number(match[2]) } : null; };

// Element ids of the common panel's controls (core/host.js); experiments cannot reuse them.
export const COMMON_IDS = ["play", "step", "randomize", "drift", "drift-speed", "new-seed", "reset-sun", "sunPhase", "timeOfDay", "sunPathWidth", "sunPathHeight", "sunPathX", "sunPathY"];
const INSTANCE_METHODS = ["update", "step", "render", "dispose"];

// Throws with every problem in an experiment's description, so a bad module fails loudly.
export function validateExperiment(experiment) {
  const problems = [];
  for (const field of ["id", "title", "app"]) if (typeof experiment?.[field] !== "string" || !experiment[field]) problems.push(`${field} must be a non-empty string`);
  for (const field of ["width", "height"]) if (!Number.isInteger(experiment?.[field]) || experiment[field] < 1) problems.push(`${field} must be a positive integer`);
  if (typeof experiment?.sun !== "boolean") problems.push("sun must be true or false");
  if (typeof experiment?.create !== "function") problems.push("create must be a function");
  const keys = new Set();
  for (const param of experiment?.params ?? []) {
    const name = param?.key ?? "?";
    if (typeof param?.key !== "string" || !param.key) problems.push("every param needs a key");
    else if (keys.has(param.key)) problems.push(`duplicate param ${name}`);
    else if (RESERVED_KEYS.includes(param.key) && !(param.kind === "size" && param.key === "resolution")) problems.push(`param ${name} is reserved for the host`);
    keys.add(param?.key);
    if (!PARAM_KINDS.includes(param?.kind)) problems.push(`param ${name} has unknown kind ${param?.kind}`);
    if (param?.kind === "range") {
      if (!(param.min < param.max) || !(param.step > 0)) problems.push(`range ${name} needs min < max and step > 0`);
      if (!(param.default >= param.min && param.default <= param.max)) problems.push(`range ${name} default is out of range`);
    }
    if (param?.randomize !== undefined && typeof param.randomize !== "boolean") problems.push(`param ${name} randomize must be true or false`);
  if (param?.kind === "select" && !param.options?.some(([value]) => value === param.default)) problems.push(`select ${name} default is not an option`);
    if (param?.kind === "seed" && !isSeed(param.default)) problems.push(`seed ${name} default must be an integer 0 to ${SEED_MAX}`);
    if (param?.kind === "toggle" && typeof param.default !== "boolean") problems.push(`toggle ${name} default must be true or false`);
    if (param?.kind === "size") {
      if (param.key !== "resolution") problems.push(`size param ${name} must use the key resolution`);
      if (!param.options?.length || !param.options.every(([value]) => parseSize(value))) problems.push(`size ${name} options must look like 64x48`);
      if (!param.options?.some(([value]) => value === param.default)) problems.push(`size ${name} default is not an option`);
    }
    for (const field of ["enabled", "next"]) if (param?.[field] !== undefined && typeof param[field] !== "function") problems.push(`param ${name} ${field} must be a function`);
  }
  if (experiment?.params?.filter?.(param => param?.kind === "size").length > 1) problems.push("at most one size param");
  for (const field of ["adjust", "decorate", "stats"]) if (experiment?.[field] !== undefined && typeof experiment[field] !== "function") problems.push(`${field} must be a function`);
  for (const field of ["autoplay", "drift"]) if (experiment?.[field] !== undefined && typeof experiment[field] !== "boolean") problems.push(`${field} must be true or false`);
  // Play is common: one label everywhere, so experiments cannot rename it.
  if (experiment?.playLabels !== undefined) problems.push("playLabels is not supported: Play/Pause is the same on every page");
  if (experiment?.seed !== undefined && !experiment?.params?.some?.(param => param?.kind === "seed" && param.key === experiment.seed)) problems.push(`seed must name a seed param`);
  // Another seed's button is "new-<key>": a seed keyed "seed" would take the common New seed's id.
  if (experiment?.params?.some?.(param => param?.kind === "seed" && param.key === "seed" && experiment.seed !== "seed")) problems.push(`a seed keyed "seed" must be the experiment's seed (its button is the common New seed)`);
  if (experiment?.stepSeconds !== undefined && typeof experiment.stepSeconds !== "function" && !(experiment.stepSeconds > 0)) problems.push("stepSeconds must be a positive number or a function");
  if (experiment?.migrate !== undefined && typeof experiment.migrate !== "function") problems.push("migrate must be a function");
  for (const action of experiment?.actions ?? []) {
    if (typeof action?.id !== "string" || !action.id || typeof action.label !== "string" || typeof action.run !== "function") problems.push("every action needs an id, a label and run");
    else if (COMMON_IDS.includes(action.id) || action.id.startsWith("new-")) problems.push(`action id ${action.id} is reserved for the common panel`);
  }
  for (const [id, readout] of Object.entries(experiment?.readouts ?? {})) if (typeof readout !== "function") problems.push(`readout ${id} must be a function`);
  if (!Array.isArray(experiment?.params)) problems.push("params must be an array");
  if (problems.length) throw new Error(`Experiment ${experiment?.id ?? "?"}: ${problems.join("; ")}`);
  return experiment;
}

// Checks a live instance has the four methods.
export function validateInstance(instance) {
  const missing = INSTANCE_METHODS.filter(name => typeof instance?.[name] !== "function");
  if (missing.length) throw new Error(`Experiment instance is missing ${missing.join(", ")}`);
  return instance;
}

export const isSeed = value => Number.isInteger(value) && value >= 0 && value <= SEED_MAX;

export const defaultParams = experiment => Object.fromEntries(experiment.params.map(param => [param.key, param.default]));

// Clean one untrusted value (from a ?p= link, a saved rating or an input): numbers are
// clamped into range, unknown options and bad seeds fall back to `fallback`.
export function cleanParam(param, value, fallback = param.default) {
  if (param.kind === "range") {
    const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return typeof number === "number" && Number.isFinite(number) ? Math.min(param.max, Math.max(param.min, number)) : fallback;
  }
  if (param.kind === "select" || param.kind === "size") return param.options.some(([option]) => option === value) ? value : fallback;
  if (param.kind === "toggle") return typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : fallback;
  const seed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return isSeed(seed) ? seed : fallback;
}

// A full params object from a partial or untrusted one. Missing or bad values keep `base`
// (defaults unless given), and keys the schema does not know are dropped.
export function cleanParams(experiment, raw = {}, base = defaultParams(experiment)) {
  const source = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(experiment.params.map(param => [param.key, cleanParam(param, source[param.key], base[param.key])]));
}

// Settings the common Randomize gives random values: every range (greyed-out and hidden ones
// too), select and toggle, and every seed, except params marked randomize: false and the grid
// size (a performance choice, not part of the picture).
export const randomizableParams = experiment => experiment.params.filter(param => param.kind !== "size" && param.randomize !== false);

// A random value for one param from `random` (() => [0, 1)): a range lands on one of its
// steps, a select on one of its options, a toggle on either side, a seed anywhere 0 … 2³² − 1.
export function randomValue(param, random) {
  const pick = count => Math.min(count - 1, Math.floor(random() * count));
  if (param.kind === "range") {
    const steps = Math.floor((param.max - param.min) / param.step + 1e-9);
    return Math.min(param.max, Number((param.min + pick(steps + 1) * param.step).toFixed(10)));
  }
  if (param.kind === "select" || param.kind === "size") return param.options[pick(param.options.length)][0];
  if (param.kind === "toggle") return random() < 0.5;
  return Math.floor(random() * (SEED_MAX + 1));
}

// Randomize: every randomizable setting of `params` gets a random value. Menus and toggles go
// first and are linked (adjust), so modes are settled before the values that depend on them;
// then every range and seed, greyed-out ones included.
export function randomParams(experiment, params, random) {
  const chosen = randomizableParams(experiment);
  const pickAll = kinds => Object.fromEntries(chosen.filter(param => kinds.includes(param.kind)).map(param => [param.key, randomValue(param, random)]));
  let next = cleanParams(experiment, { ...params, ...pickAll(["select", "toggle"]) }, params);
  if (experiment.adjust) next = cleanParams(experiment, experiment.adjust(next, params), next);
  return cleanParams(experiment, { ...next, ...pickAll(["range", "seed"]) }, next);
}

// Sliders Drift may move: visible ranges not marked drift: false (playback speeds and the like).
export const driftableParams = experiment => experiment.params.filter(param => param.kind === "range" && param.drift !== false && !param.hidden);
