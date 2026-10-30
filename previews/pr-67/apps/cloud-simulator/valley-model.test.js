/* Purpose: Verify texture transport, reveal masks, terrain clearance and source immutability.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, valley-model.js and source JPEGs. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaults, sampleTexture, revealFields, mountainRidge, terrainProfile, renderValley, textureOptions } from "./valley-model.js";
import { decodeCloudTexture } from "./valley-textures.js";
function texture(seed) {
  let state = seed;
  return { width: 32, height: 32, pixels: Float32Array.from({ length: 1024 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296;
  }) };
}
test("texture sampling wraps horizontally in either direction and is empty outside its height", () => {
  const image = texture(123);
  assert.equal(sampleTexture(image, -0.75, 0.5), sampleTexture(image, 0.25, 0.5));
  assert.equal(sampleTexture(image, 1.25, 0.5), sampleTexture(image, 0.25, 0.5));
  assert.equal(sampleTexture(image, 0.5, -0.01), 0);
  assert.equal(sampleTexture(image, 0.5, 1.01), 0);
});
test("slope pockets swap with wind, stay partial and let zero-clearance clouds reach terrain", () => {
  let active = 0, untouched = 0;
  for (let i = 0; i < 100; i++) {
    const x = -1 + i * 0.02, opts = { wind: 4, windwardClearance: 0.15, leewardClearance: 0 };
    const a = terrainProfile(x, opts, 1), b = terrainProfile(x, { ...opts, wind: -4, windwardClearance: 0, leewardClearance: 0.15 }, 1);
    assert.ok(Math.abs(a.width - b.width) < 1e-12);
    if (a.width > 0.001) {
      active++;
      const f = revealFields(x, a.ridge - a.width / 2, 0, opts, "combined", 1);
      assert.ok(f.clearance > 0 && f.clearance < 1);
    } else untouched++;
    assert.equal(revealFields(x, a.ridge + 0.01, 0, opts, "combined", 1).clearance, 0);
    assert.equal(revealFields(x, a.ridge - 0.00001, 0, { ...opts, windwardClearance: 0, leewardClearance: 0 }, "combined", 1).clearance, 1);
    assert.equal(terrainProfile(x, { ...opts, wind: 0 }, 1).width, 0);
    assert.equal(terrainProfile(x, { ...opts, horizon: "open" }, 1).width, 0);
  }
  assert.ok(active > 0 && untouched > 0);
});
test("wind and formation can be stopped independently without altering any texture", () => {
  for (const seed of [123, 5821, 93473]) {
    const image = texture(seed), original = image.pixels.slice();
    assert.deepEqual(renderValley(image, 0, { wind: 0, formationSpeed: 0 }, "combined", 48, 30), renderValley(image, 50, { wind: 0, formationSpeed: 0 }, "combined", 48, 30));
    assert.notDeepEqual(renderValley(image, 0, { formationSpeed: 0 }, "combined", 48, 30), renderValley(image, 20, { formationSpeed: 0 }, "combined", 48, 30));
    assert.notDeepEqual(renderValley(image, 0, { wind: 0, coverage: 0.5 }, "combined", 48, 30), renderValley(image, 40, { wind: 0, coverage: 0.5 }, "combined", 48, 30));
    assert.deepEqual(image.pixels, original);
  }
});
test("zero coverage or opacity removes cloud influence and reveal shapes produce different results", () => {
  const a = texture(1), b = texture(2);
  for (const options of [{ coverage: 0 }, { opacity: 0 }]) assert.deepEqual(renderValley(a, 0, options, "combined", 48, 30), renderValley(b, 20, options, "combined", 48, 30));
  assert.notDeepEqual(renderValley(a, 0, { coverage: 0.5 }, "ribbon", 48, 30), renderValley(a, 0, { coverage: 0.5 }, "pockets", 48, 30));
});
test("all extreme masks stay bounded and selected JPEG sources exist", () => {
  for (const shape of ["combined", "ribbon", "pockets"]) for (const x of [-1, 0, 1]) for (const y of [0, 0.5, 1]) {
    const fields = revealFields(x, y, 10000, { windwardClearance: 0, leewardClearance: 0, maskSoftness: 0.02, bandWidth: 0.08 }, shape);
    assert.ok(Object.values(fields).every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  }
  for (const option of textureOptions) {
    const bytes = readFileSync(new URL(option.file, import.meta.url));
    assert.equal(bytes[0], 255); assert.equal(bytes[1], 216);
  }
});

test("Perlin product evolves smoothly, freezes with formationSpeed=0, and reveals all heights", () => {
  const options = { horizon: "open", placement: "full", coverage: 0.5 };
  for (const y of [0.05, 0.3, 0.6, 0.85]) {
    const a = revealFields(0.24, y, 1, options, "noise");
    const b = revealFields(0.24, y, 1.001, options, "noise");
    assert.equal(a.band, 1); assert.ok(a.formation > 0);
    assert.ok(Math.abs(a.formation - b.formation) < 0.01);
    assert.deepEqual(revealFields(0.24, y, 1, { ...options, formationSpeed: 0 }, "noise"), revealFields(0.24, y, 20, { ...options, formationSpeed: 0 }, "noise"));
  }
  assert.notEqual(revealFields(0.24, 0.3, 1, options, "noise").formation, revealFields(0.24, 0.3, 20, options, "noise").formation);
  const image = texture(7);
  for (const horizon of ["valley", "hills", "open"]) for (const placement of ["full", "spread", "high", "low", "band"]) {
    const pixels = renderValley(image, 2, { ...options, horizon, placement }, "noise", 32, 20);
    assert.equal(pixels.length, 32 * 20 * 4);
  }
  assert.ok(mountainRidge(1, 2, "hills") > mountainRidge(1, 2, "valley"));
  assert.ok(revealFields(0, 0.2, 0, { placement: "high" }).band > revealFields(0, 0.2, 0, { placement: "low" }).band);
});
test("photo processing removes sky, retains cloud shading and never passes RGB to rendering", () => {
  for (const [profile, cloud, sky] of [["rose", [90,90,90], [70,120,190]], ["embers", [35,30,25], [255,140,40]]]) {
    const source = new Uint8ClampedArray([...cloud,255,...sky,255,...cloud,0]), before = source.slice();
    const decoded = decodeCloudTexture(source, 3, 1, profile);
    assert.equal(decoded.pixels[0], 1); assert.equal(decoded.pixels[1], 0); assert.equal(decoded.pixels[2], 0);
    assert.equal(decoded.rgb, undefined); assert.ok(decoded.shading[0] > 0); assert.deepEqual(source, before);
  }
  const empty = decodeCloudTexture(new Uint8ClampedArray([70,120,190,255]), 1, 1, "rose");
  const opts = { horizon: "open", placement: "full", coverage: 1 };
  assert.deepEqual(renderValley(empty, 0, opts, "noise", 32, 20), renderValley(texture(8), 0, { ...opts, opacity: 0 }, "noise", 32, 20));
  // Different source hues with identical grayscale + alpha have identical rendered output.
  const a = { width: 1, height: 1, pixels: new Float32Array([1]), shading: new Float32Array([0.4]), mirrored: true };
  assert.deepEqual(renderValley({ ...a, rgb: new Uint8Array([255,0,0]) }, 0, opts, "noise", 32, 20), renderValley({ ...a, rgb: new Uint8Array([0,0,255]) }, 0, opts, "noise", 32, 20));
});
