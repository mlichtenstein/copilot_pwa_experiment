/* Purpose: Verify source loading and interactive texture/clock controls in a DOM harness.
 * Consumers: Node test runner. Dependencies: node:test, node:assert and valley.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "./valley-model.js";
test("textures load; switching keeps time; step pauses, reset restores defaults", async () => {
  const original = { document: globalThis.document, Image: globalThis.Image, raf: globalThis.requestAnimationFrame };
  let callback, pixels, stamp = 0, drawn;
  const items = new Map(), listeners = {};
  const get = id => {
    if (!items.has(id)) items.set(id, { value: String(defaults[id] ?? (id === "shape" ? "noise" : id === "placement" ? "full" : id === "texture-a" ? "rose" : id === "texture-b" ? "billow" : "")), checked: id === "horizon-hills", disabled: true,
      textContent: "", handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; }, setAttribute() {} });
    return items.get(id);
  };
  Object.assign(get("sky"), { width: 48, height: 30, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: image => { pixels = image.data; } }) });
  for (const slot of ["a", "b"]) Object.assign(get("preview-" + slot), { width: 96, height: 60, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) });
  globalThis.Image = class { async decode() {} };
  globalThis.document = { hidden: false, getElementById: get, addEventListener(name, fn) { listeners[name] = fn; }, createElement: () => ({ getContext: () => ({
    drawImage: image => { drawn = image.src; }, getImageData: () => {
      const data = new Uint8ClampedArray(512 * 512 * 4), offset = drawn.includes("01") ? 31 : drawn.includes("06") ? 79 : 143;
      for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = (i / 4 + offset) % 256; data[i + 3] = 255; }
      return { data };
    }
  }) }) };
  globalThis.requestAnimationFrame = fn => { callback = fn; };
  const frame = (dt = 16) => { stamp += dt; callback(stamp); };
  try {
    const app = await import("./valley.js"); await app.ready; frame();
    assert.equal(get("play").disabled, false);
    const first = pixels.slice();
    get("step").handlers.click(); frame(); assert.ok(get("stats").textContent.includes("t 1.0 s"));
    get("texture-a").value = "bank"; get("texture-a").handlers.change(); frame();
    get("texture-b").value = "veil"; get("texture-b").handlers.change();
    get("textureBlend").value = "0.5"; get("textureBlend").handlers.input(); frame();
    assert.ok(get("stats").textContent.includes("Soft bank → Thin veil · 50% B · layout 1 · t 1.0 s"));
    get("play").handlers.click(); frame(); frame(100);
    assert.ok(get("stats").textContent.includes("t 1.1 s"));
    globalThis.document.hidden = true; listeners.visibilitychange(); frame(5000);
    globalThis.document.hidden = false; listeners.visibilitychange(); frame();
    assert.ok(get("stats").textContent.includes("t 1.1 s"));
    get("windwardClearance").value = "0.2"; get("windwardClearance").handlers.input(); frame();
    get("leewardClearance").value = "0"; get("leewardClearance").handlers.input(); frame();
    get("shuffle").handlers.click(); frame();
    assert.ok(get("stats").textContent.includes("layout 2"));
    assert.ok(get("stats").textContent.includes("t 1.1 s"));
    get("reset").handlers.click(); frame();
    assert.ok(get("stats").textContent.includes("layout 1"));
    assert.equal(Number(get("windwardClearance").value), defaults.windwardClearance);
    assert.equal(Number(get("leewardClearance").value), defaults.leewardClearance);
    assert.equal(get("play").textContent, "Play wind"); assert.equal(get("texture-a").value, "rose"); assert.equal(get("texture-b").value, "billow"); assert.equal(Number(get("textureBlend").value), 0);
    assert.deepEqual(pixels, first);
  } finally { globalThis.document = original.document; globalThis.Image = original.Image; globalThis.requestAnimationFrame = original.raf; }
});
