/* Purpose: Check horizon controls, two-axis sunset playback and reset independently of browser.
 * Consumers: Node test runner. Dependencies: node:test, node:assert and horizon.js with minimal DOM harness. */
import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "./horizon-model.js";
test("altitude redraws, both sun angles move, manual edits pause and reset restores defaults", async () => {
  const originalDocument = globalThis.document, originalRAF = globalThis.requestAnimationFrame;
  let callback, pixels, time = 0;
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: String(defaults[id] ?? ""), listeners: {}, textContent: "",
      addEventListener(name, handler) { this.listeners[name] = handler; }, setAttribute() {} });
    return elements.get(id);
  };
  Object.assign(get("sky"), { width: 32, height: 20, getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: image => { pixels = image.data; }
  }) });
  globalThis.document = { hidden: false, getElementById: get, addEventListener() {} };
  globalThis.requestAnimationFrame = handler => { callback = handler; };
  const frame = (dt = 16) => { time += dt; callback(time); };
  try {
    await import("./horizon.js"); frame(); const initial = pixels.slice();
    get("cloudAltitude").value = "7"; get("cloudAltitude").listeners.input(); frame(); assert.notDeepEqual(pixels, initial);
    get("play").listeners.click(); frame(); frame(220);
    assert.ok(Number(get("sunElevation").value) < defaults.sunElevation);
    assert.ok(Number(get("sunAzimuth").value) > defaults.sunAzimuth);
    get("sunElevation").listeners.input(); frame(); assert.equal(get("play").textContent, "Play sunset");
    const angle = get("sunElevation").value; frame(220); assert.equal(get("sunElevation").value, angle);
    get("reset").listeners.click(); frame(); assert.deepEqual(pixels, initial);
    assert.ok(get("cloud-status").textContent.includes("km away"));
  } finally { globalThis.document = originalDocument; globalThis.requestAnimationFrame = originalRAF; }
});
