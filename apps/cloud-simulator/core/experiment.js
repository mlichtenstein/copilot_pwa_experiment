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
 *                 adds the sunPhase and sunPath* sliders and the Play sun / Reset sun buttons
 *   frameInterval fewest milliseconds between redraws while playing (0 = every frame)
 *   params        the controls, in display order (see PARAM_KINDS)
 *   create({ width, height, params, doc }) → instance
 * Optional capabilities (each generic; an experiment uses only what it needs):
 *   autoplay      start playing on load (unless the reader prefers reduced motion)
 *   playLabels    [play, pause] button text, e.g. ["Play wind", "Pause wind"]
 *   drift         true to offer the shared Drift checkbox (../../shared/drift.js) over
 *                 driftableParams; the checkbox is saved as `drift`
 *   actions       extra buttons, [{ id, label, title, run(page) }] (Step, Reset, …); page is
 *                 { instance, params, setPlaying, resetToDefaults({ keep }), redraw }
 *   readouts      { elementId: (params, frame, instance) => text } filled on each redraw
 *                 (legends, status lines)
 *   adjust(next, previous) → params   link params, e.g. a resolution switch sets pixelArt
 *   decorate({ doc, controlFor }) → refresh(params, instance)   add custom pieces next to
 *                 generated controls (previews); refresh runs after params change or load
 *   stats(params, frame, instance)    one-line status under the buttons
 * An instance is:
 *   update(params, { playing })  take a full, cleaned params object (rebuild what depends on it)
 *   step(dt, frame)  advance any simulation by dt clock seconds; return false if nothing
 *                    visible changed (a fixed-rate simulation between its ticks)
 *   render(frame)    return RGBA pixels (Uint8ClampedArray of width × height × 4), or null
 *                    while not ready
 *   dispose()        release anything held
 *   ready            optional promise; the host keeps playback disabled until it settles
 * frame is { time, sun } where time is the shared clock in seconds and sun is
 * sunAt(time, shape) = { phase, azimuth, elevation } (degrees) on the shared vertical
 * figure-eight, sized and placed by the host-owned sunPath* settings.
 */

// Every kind takes { key, help?, group?, enabled?(params), hidden? }: group puts it in a
// fieldset with that legend, enabled greys it out when it does nothing, hidden keeps it in
// params (saved, restored) with no visible input (a seed with only its "new" button).
// range:  { min, max, step, default, drift? }        a slider; drifts unless drift: false
// select: { label, options: [[value, label], …], default, display?: "menu" | "radio", wide? }
// toggle: { default: true | false }                  a checkbox
// seed:   { default, newLabel, newTitle, random?, next?(value) }
//         integer 0 … 2³² − 1 with a "new" button: random (or next(value)); random: true also
//         starts each page load on a random seed
// size:   { key: "resolution", options: [["WxH", label], …], default }   grid size radios;
//         switching rebuilds the instance at that size
export const PARAM_KINDS = ["range", "select", "toggle", "seed", "size"];
export const SEED_MAX = 4294967295;
// Saved by the host itself: the sun's place on the shared path and the path's four shape
// settings (core/sun-path.js), the grid size (unless a size param owns it) and Drift.
export const RESERVED_KEYS = ["sunPhase", "sunPathWidth", "sunPathHeight", "sunPathX", "sunPathY", "resolution", "drift"];
const SIZE = /^(\d+)x(\d+)$/;
export const parseSize = value => { const match = SIZE.exec(value); return match ? { width: Number(match[1]), height: Number(match[2]) } : null; };

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
  if (experiment?.playLabels !== undefined && !(Array.isArray(experiment.playLabels) && experiment.playLabels.length === 2)) problems.push("playLabels must be [play, pause]");
  for (const action of experiment?.actions ?? []) {
    if (typeof action?.id !== "string" || !action.id || typeof action.label !== "string" || typeof action.run !== "function") problems.push("every action needs an id, a label and run");
    else if (["play", "reset", "drift"].includes(action.id) || action.id.startsWith("new-")) problems.push(`action id ${action.id} is reserved for the host`);
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

// Sliders Drift may move: visible ranges not marked drift: false (playback speeds and the like).
export const driftableParams = experiment => experiment.params.filter(param => param.kind === "range" && param.drift !== false && !param.hidden);
