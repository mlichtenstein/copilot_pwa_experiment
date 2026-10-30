/* Purpose: Regression check for the slice control's view switching and redraw.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, shafts.js and a minimal DOM harness. */
import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "./shafts-model.js";
test("moving slice pauses animation, selects sunlight view and redraws the requested depth", async () => {
  const originalDocument = globalThis.document, originalRAF = globalThis.requestAnimationFrame;
  let callback, pixels;
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: String(defaults[id] ?? (id === "seed" ? 42 : id === "view" ? "light" : 12)),
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
    await import("./shafts.js");
    callback(0);
    get("play").listeners.click();
    get("slice").value = "0"; get("slice").listeners.input(); callback(16);
    assert.equal(get("view").value, "slice");
    assert.equal(get("play").textContent, "Play sun");
    assert.equal(get("slice-value").textContent, "0 · z = 2");
    const first = pixels.slice();
    get("slice").value = "23"; get("slice").listeners.input(); callback(32);
    assert.equal(get("slice-value").textContent, "23 · z = 94");
    assert.notDeepEqual(pixels, first);
  } finally {
    globalThis.document = originalDocument; globalThis.requestAnimationFrame = originalRAF;
  }
});
