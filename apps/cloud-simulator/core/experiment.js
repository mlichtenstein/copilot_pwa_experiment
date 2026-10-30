/*
 * Purpose: The common contract every cloud simulator experiment module meets, plus pure
 *   helpers over its params schema (defaults, cleaning untrusted params, which params drift).
 *   An experiment describes its controls in code and draws pixels; core/host.js turns that
 *   into a page (controls, shared loop and clock, shared sun, rating bar, ?p= links).
 * Consumers: core/host.js, core/registry.js, experiment modules (../sunset-experiment.js),
 *   experiment.test.js.
 * Dependencies: none (pure).
 *
 * An experiment is a plain object:
 *   id            short name, also the page name (sunset → sunset.html)
 *   title         shown in headers and on the front page
 *   app           rating bar app id, e.g. "cloud-simulator/sunset"
 *   width, height native pixel grid
 *   sun           true if it follows the shared sun path (core/sun-path.js)
 *   frameInterval fewest milliseconds between redraws while playing (0 = every frame)
 *   params        the controls, in display order (see PARAM_KINDS)
 *   create({ width, height, params }) → instance
 *   stats(params, frame)  optional one-line status under the buttons
 * An instance is:
 *   update(params)   take a full, cleaned params object (rebuild what depends on it)
 *   step(dt, frame)  advance any simulation by dt clock seconds (still scenes do nothing)
 *   render(frame)    return RGBA pixels (Uint8ClampedArray of width × height × 4)
 *   dispose()        release anything held
 * frame is { time, sun } where time is the shared clock in seconds and sun is
 * sunAt(time) = { phase, azimuth, elevation } (degrees).
 */

// range:  { key, help, min, max, step, default, drift? }  a slider; drifts unless drift: false
// select: { key, label, options: [[value, label], …], default }
// seed:   { key, help, default, newLabel, newTitle }       integer 0 … 2³² − 1 with a "new" button
export const PARAM_KINDS = ["range", "select", "seed"];
export const SEED_MAX = 4294967295;

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
    else if (["sunPhase", "resolution"].includes(param.key)) problems.push(`param ${name} is reserved for the host`);
    keys.add(param?.key);
    if (!PARAM_KINDS.includes(param?.kind)) problems.push(`param ${name} has unknown kind ${param?.kind}`);
    if (param?.kind === "range") {
      if (!(param.min < param.max) || !(param.step > 0)) problems.push(`range ${name} needs min < max and step > 0`);
      if (!(param.default >= param.min && param.default <= param.max)) problems.push(`range ${name} default is out of range`);
    }
    if (param?.kind === "select" && !param.options?.some(([value]) => value === param.default)) problems.push(`select ${name} default is not an option`);
    if (param?.kind === "seed" && !isSeed(param.default)) problems.push(`seed ${name} default must be an integer 0 to ${SEED_MAX}`);
  }
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
  if (param.kind === "select") return param.options.some(([option]) => option === value) ? value : fallback;
  const seed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return isSeed(seed) ? seed : fallback;
}

// A full params object from a partial or untrusted one. Missing or bad values keep `base`
// (defaults unless given), and keys the schema does not know are dropped.
export function cleanParams(experiment, raw = {}, base = defaultParams(experiment)) {
  const source = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(experiment.params.map(param => [param.key, cleanParam(param, source[param.key], base[param.key])]));
}

// Sliders Drift may move: ranges not marked drift: false (playback speeds and the like).
export const driftableParams = experiment => experiment.params.filter(param => param.kind === "range" && param.drift !== false);
