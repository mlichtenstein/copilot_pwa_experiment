/*
 * Purpose: Getting from one page to another without losing the sky. Random (a random experiment,
 *   opened with ?random=1 so its host presses Randomize), a random ❤️ (a random "love" rating
 *   from everyone, opened with its settings in ?p=), and the sun carry-over: the time of day,
 *   the sun path's shape and Drift (with its speed) follow the visitor from page to page for
 *   the rest of the browser tab's session. A ?p= link always wins over the carry-over.
 * Consumers: header.js (the Random and ❤️ buttons on every page), host.js (?random=1 and the
 *   carry-over), ../home.js (the front page), launch.test.js.
 * Dependencies: registry.js, sun-path.js (SUN_PATH_PARAMS), ../../shared/presets.js (the
 *   ratings table, read only, and ?p= links); a sessionStorage-like store.
 */
import { experiments } from "./registry.js";
import { SUN_PATH_PARAMS } from "./sun-path.js";
import { createPresetStore, urlWithParams, isPlainParams } from "../../shared/presets.js";

export const RANDOM_KEY = "random";
export const CARRY_KEY = "cloud-simulator:carry";
export const APP_PREFIX = "cloud-simulator/";
// What crosses from page to page: where the sun is, its path, and Drift.
export const CARRY_KEYS = ["sunPhase", ...SUN_PATH_PARAMS.map(param => param.key), "drift", "driftSpeed"];
// Any of these in a rating means it has its own sun (older ones saved a fixed one).
const SUN_KEYS = ["sunPhase", "sunAzimuth", "sunElevation", ...SUN_PATH_PARAMS.map(param => param.key)];
const DRIFT_KEYS = ["drift", "driftSpeed"];

export const LAUNCH_TEXT = {
  random: "🎲 Random",
  randomNote: "Opens a random experiment with every setting randomized (Randomize). The time of day, the sun's path and Drift come along from the page you are on.",
  loved: "❤️ Random",
  lovedNote: "Opens a random look someone rated ❤️ (Love it), with its saved settings. Needs the network.",
  looking: "Finding a ❤️…",
  none: "No ❤️ ratings yet. Rate a look you love, or try 🎲 Random.",
  offline: "Can't reach the ratings right now. Try 🎲 Random instead."
};

// Each experiment page's address with Randomize asked for.
export const randomHref = entry => `${entry.href}?${RANDOM_KEY}=1`;
export const pickRandom = (list, random = Math.random) => list.length ? list[Math.min(list.length - 1, Math.floor(random() * list.length))] : null;
export const randomExperiment = (random = Math.random) => pickRandom(experiments, random);
export const wantsRandom = url => { try { return new URL(url).searchParams.get(RANDOM_KEY) === "1"; } catch { return false; } };

const finite = value => typeof value === "number" && Number.isFinite(value);
const cleanCarry = raw => {
  if (!isPlainParams(raw)) return null;
  const carry = {};
  for (const key of CARRY_KEYS) {
    if (key === "drift" ? typeof raw[key] === "boolean" : finite(raw[key])) carry[key] = raw[key];
  }
  return Object.keys(carry).length ? carry : null;
};
// The carried sun and Drift, or null when there is none (a new tab, or storage blocked).
export function readCarry(storage) {
  try { return cleanCarry(JSON.parse(storage?.getItem(CARRY_KEY) ?? "null")); } catch { return null; }
}
// Remember a page's sun and Drift (from its getParams()); keys it lacks keep their carried
// value, so a page without a sun path (Lightning) passes the path on untouched.
export function writeCarry(storage, params) {
  const next = cleanCarry({ ...readCarry(storage), ...cleanCarry(params) });
  try { if (next) storage?.setItem(CARRY_KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
  return next;
}
// A rating's settings with the carried sun and Drift filled in where it says nothing: a rating
// with any sun of its own keeps all of it (old ones rely on the path they were made with).
export function withCarry(params, carry) {
  if (!carry) return { ...params };
  const has = keys => keys.some(key => key in params);
  const pick = keys => Object.fromEntries(keys.filter(key => key in carry).map(key => [key, carry[key]]));
  return { ...(has(SUN_KEYS) ? {} : pick(SUN_KEYS)), ...(has(DRIFT_KEYS) ? {} : pick(DRIFT_KEYS)), ...params };
}

/*
 * A random ❤️: one random "love" rating of any cloud simulator experiment, as
 * { entry, params, href }, or null when nobody has rated anything ❤️ yet. Rejects with the
 * store's PresetError (kind "offline" and so on) when the ratings can't be read.
 */
export async function pickLoved({ store = createPresetStore({ app: APP_PREFIX }), random = Math.random, carry = null, base } = {}) {
  const rows = await store.listRated("love", { appPrefix: APP_PREFIX, limit: 200 });
  const usable = (Array.isArray(rows) ? rows : []).map(row => ({ row, entry: experiments.find(item => APP_PREFIX + item.id === row?.app_id) }))
    .filter(({ row, entry }) => entry && isPlainParams(row.params));
  const choice = pickRandom(usable, random);
  if (!choice) return null;
  const params = withCarry(choice.row.params, carry);
  return { entry: choice.entry, params, href: urlWithParams(new URL(choice.entry.href, base), params) };
}

// What a launch button shows when the ❤️ can't be had: no hearts, or no network.
export const lovedProblem = error => error ? LAUNCH_TEXT.offline : LAUNCH_TEXT.none;
