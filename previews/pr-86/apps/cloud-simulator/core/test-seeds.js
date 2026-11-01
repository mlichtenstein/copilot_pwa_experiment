/* Purpose: Pinned seeds for the model tests, so every run checks the same cases and a failure
 *   reproduces. The list was drawn once at random (not tuned to pass); tests use its first few.
 *   Opt-in fuzzing: FUZZ_SEEDS=1 draws fresh random seeds (same count) and names them in the
 *   test titles; FUZZ_SEEDS=123,456 runs exactly those.
 * Consumers: noise-model.test.js, convection-model.test.js, lightning-model.test.js.
 * Dependencies: node:crypto (only when fuzzing). */
import { randomInt } from "node:crypto";

export const PINNED_SEEDS = Object.freeze([1888362168, 173332986, 1930826849, 1745531485, 1708796547, 2871060533, 3584093193, 3729086382]);

const fuzz = process.env.FUZZ_SEEDS ?? "";
const listed = /\d/.test(fuzz) && fuzz !== "1" ? fuzz.split(",").map(Number).filter(Number.isFinite) : null;

// `count` seeds: the first `count` pinned ones, or, when fuzzing, fresh or listed ones
// (a listed set repeats to fill `count`).
export function testSeeds(count, pinned = PINNED_SEEDS) {
  if (listed?.length) return Array.from({ length: count }, (_, i) => listed[i % listed.length] >>> 0);
  if (fuzz === "1") return Array.from({ length: count }, () => randomInt(0, 2 ** 32));
  if (count > pinned.length) throw new Error(`only ${pinned.length} pinned seeds`);
  return pinned.slice(0, count);
}
export const fuzzing = fuzz !== "" && fuzz !== "0";
