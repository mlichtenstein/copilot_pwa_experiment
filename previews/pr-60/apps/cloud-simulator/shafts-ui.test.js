/* Purpose: Regression check for the simple controls, per-layer patterns and reset.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, shafts.js and a minimal DOM harness. */
import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "./shafts-model.js";
import { visibilityDefaults } from "./visibility-model.js";
const controlDefaults = { ...defaults, ...visibilityDefaults };
test("sun slider redraws; pattern buttons change one layer; reset restores the original experiment", async () => {
  const originalDocument = globalThis.document, originalRAF = globalThis.requestAnimationFrame;
  let callback, pixels;
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: String(controlDefaults[id] ?? ""), checked: id === "strategy-visibility",
      textContent: "", listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; }, setAttribute() {} });
    return elements.get(id);
  };
  Object.assign(get("sky"), { width: 128, height: 80, getContext: () => ({
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: image => { pixels = image.data; }
  }) });
  globalThis.document = { hidden: false, getElementById: get, addEventListener() {} };
  globalThis.requestAnimationFrame = handler => { callback = handler; };
  try {
    await import("./shafts.js"); callback(0);
    const first = pixels.slice(), originalPatterns = get("patterns").textContent;
    get("strategy-visibility").checked = false; get("strategy-geometric").checked = true;
    get("strategy-geometric").listeners.change(); callback(4);
    assert.notDeepEqual(pixels, first);
    assert.equal(get("sourceRadius").disabled, true);
    assert.equal(get("edgeFeather").disabled, true);
    assert.equal(get("patterns").textContent, originalPatterns);
    get("strategy-visibility").checked = true; get("strategy-geometric").checked = false;
    get("strategy-visibility").listeners.change(); callback(8);
    assert.deepEqual(pixels, first);
    get("strategy-layered").checked = true; get("strategy-visibility").checked = false;
    get("strategy-layered").listeners.change(); callback(9);
    const layered = pixels.slice();
    assert.notDeepEqual(layered, first);
    assert.equal(get("patterns").textContent, originalPatterns);
    get("reset").listeners.click(); callback(9.5);
    assert.equal(get("strategy-layered").checked, true);
    assert.deepEqual(pixels, layered);
    get("strategy-layered").checked = false; get("strategy-visibility").checked = true;
    get("strategy-visibility").listeners.change(); callback(9.75);
    assert.deepEqual(pixels, first);
    assert.equal(get("sourceRadius").disabled, false);
    assert.equal(get("edgeFeather").disabled, false);
    get("edgeFeather").value = "0"; get("edgeFeather").listeners.input(); callback(9.8);
    assert.notDeepEqual(pixels, first);
    get("edgeFeather").value = "2"; get("edgeFeather").listeners.input(); callback(9.9);
    assert.deepEqual(pixels, first);
    get("sourceRadius").value = "0"; get("sourceRadius").listeners.input(); callback(10);
    assert.notDeepEqual(pixels, first);
    get("sourceRadius").value = "6"; get("sourceRadius").listeners.input(); callback(12);
    assert.deepEqual(pixels, first);
    get("sunAzimuth").value = "20"; get("sunAzimuth").listeners.input(); callback(16);
    assert.notDeepEqual(pixels, first);
    get("pattern-0").listeners.click(); callback(32);
    assert.equal(get("patterns").textContent, "near: 43 · middle: 1039 · far: 2036");
    get("cloudSharpness").value = "8"; get("cloudSharpness").listeners.input(); callback(40);
    get("reset").listeners.click(); callback(48);
    assert.ok(!elements.has("shadowSmoothing"));
    assert.equal(Number(get("cloudSharpness").value), 1);
    assert.equal(get("patterns").textContent, originalPatterns);
    assert.deepEqual(pixels, first);
    assert.ok(!elements.has("slice"));
    assert.equal(get("strategy-visibility").checked, true);
  } finally { globalThis.document = originalDocument; globalThis.requestAnimationFrame = originalRAF; }
});
