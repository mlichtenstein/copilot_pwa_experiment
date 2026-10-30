/* Purpose: Regression checks for strategies, patterns, playback axes/speed and reset.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, shafts.js and a minimal DOM harness. */
import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "./shafts-model.js";
import { visibilityDefaults } from "./visibility-model.js";
const controlDefaults = { ...defaults, ...visibilityDefaults, sunSpeed: 3 };
test("default layered strategy, controls, two-axis playback speed and reset work together", async () => {
  const originalDocument = globalThis.document, originalRAF = globalThis.requestAnimationFrame;
  let callback, pixels, time = 0;
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: String(controlDefaults[id] ?? ""), checked: id === "strategy-layered",
      textContent: "", listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; }, setAttribute() {} });
    return elements.get(id);
  };
  Object.assign(get("sky"), { width: 128, height: 80, getContext: () => ({
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: image => { pixels = image.data; }
  }) });
  globalThis.document = { hidden: false, getElementById: get, addEventListener() {} };
  globalThis.requestAnimationFrame = handler => { callback = handler; };
  const frame = (dt = 16) => { time += dt; callback(time); };
  const input = (id, value) => { get(id).value = String(value); get(id).listeners.input(); frame(); };
  const strategy = name => {
    for (const mode of ["visibility", "layered", "geometric"]) get("strategy-" + mode).checked = mode === name;
    get("strategy-" + name).listeners.change(); frame();
  };
  try {
    await import("./shafts.js"); frame();
    const first = pixels.slice(), originalPatterns = get("patterns").textContent;
    assert.equal(Number(get("edgeFeather").value), 4);
    assert.equal(get("strategy-layered").checked, true);
    strategy("geometric"); assert.notDeepEqual(pixels, first);
    assert.equal(get("sourceRadius").disabled, true); assert.equal(get("edgeFeather").disabled, true);
    strategy("visibility"); assert.notDeepEqual(pixels, first);
    strategy("layered"); assert.deepEqual(pixels, first);
    assert.equal(get("sourceRadius").disabled, false);
    input("edgeFeather", 0); assert.notDeepEqual(pixels, first);
    input("edgeFeather", 4); assert.deepEqual(pixels, first);
    input("sourceRadius", 0); assert.notDeepEqual(pixels, first);
    input("sourceRadius", 6); assert.deepEqual(pixels, first);
    get("pattern-0").listeners.click(); frame();
    assert.equal(get("patterns").textContent, "near: 43 · middle: 1039 · far: 2036");
    get("reset").listeners.click(); frame();
    assert.deepEqual(pixels, first); assert.equal(get("patterns").textContent, originalPatterns);
    const startAz = Number(get("sunAzimuth").value), startEl = Number(get("sunElevation").value);
    get("play").listeners.click(); frame(); frame(200);
    const azStep = Number(get("sunAzimuth").value) - startAz, elStep = Number(get("sunElevation").value) - startEl;
    assert.ok(azStep > 0 && elStep > 0);
    assert.ok(Math.abs(elStep / azStep - 0.4) < 1e-8);
    get("play").listeners.click(); frame();
    const paused = [get("sunAzimuth").value, get("sunElevation").value]; frame(200);
    assert.deepEqual([get("sunAzimuth").value, get("sunElevation").value], paused);
    get("reset").listeners.click(); frame(); input("sunSpeed", 6);
    get("play").listeners.click(); frame(); frame(200);
    assert.ok(Math.abs((Number(get("sunAzimuth").value) - startAz) / azStep - 2) < 1e-8);
    input("sunElevation", 34.9); assert.equal(get("play").textContent, "Play sun");
    input("sunAzimuth", 39.9); input("sunSpeed", 15);
    get("play").listeners.click(); frame(); frame(200); frame(200);
    assert.ok(Number(get("sunAzimuth").value) < 40 && Number(get("sunAzimuth").value) >= -40);
    assert.ok(Number(get("sunElevation").value) < 35 && Number(get("sunElevation").value) >= 1);
    get("reset").listeners.click(); frame();
    assert.equal(Number(get("sunSpeed").value), 3); assert.equal(get("strategy-layered").checked, true);
    assert.deepEqual(pixels, first);
    assert.ok(!elements.has("slice") && !elements.has("shadowSmoothing"));
  } finally { globalThis.document = originalDocument; globalThis.requestAnimationFrame = originalRAF; }
});
