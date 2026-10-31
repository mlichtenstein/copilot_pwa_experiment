/* Purpose: Just enough of the DOM for host.js in Node tests: elements with ids, nested
 *   children, listeners, values, checked/disabled state and a 2D canvas that keeps the last
 *   drawn pixels.
 * Consumers: host.test.js and the per-experiment UI tests (../*-ui.test.js).
 * Dependencies: none. */
export function fakeDocument(ids = ["sky", "presets", "playback", "controls", "stats", "status"]) {
  const byId = new Map();
  const register = item => { if (item.id) byId.set(item.id, item); for (const child of item.children ?? []) register(child); };
  const node = tag => ({
    tagName: tag.toUpperCase(), children: [], parentNode: null, listeners: {}, attributes: {}, textContent: "", value: "", checked: false, disabled: false,
    append(...items) { for (const item of items) if (typeof item === "object") { item.parentNode = this; this.children.push(item); register(item); } },
    prepend(...items) { const nodes = items.filter(item => typeof item === "object"); for (const item of nodes) { item.parentNode = this; register(item); } this.children.unshift(...nodes); },
    addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); },
    fire(name) { for (const fn of this.listeners[name] ?? []) fn({ isTrusted: true }); },
    setAttribute(name, value) { this.attributes[name] = value; },
    setCustomValidity() {}, reportValidity() {}
  });
  const doc = { hidden: false, createElement: node, addEventListener() {}, getElementById: id => byId.get(id) ?? null };
  for (const id of ids) { const element = node("div"); element.id = id; byId.set(id, element); }
  return doc;
}

// A canvas that records what was drawn: canvas.pixels() is the last frame's RGBA.
export function fakeCanvas(doc, width, height, id = "sky") {
  let pixels = null;
  return Object.assign(doc.getElementById(id), { width, height, pixels: () => pixels, getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: image => { pixels = image.data.slice(); } }) });
}

// A requestAnimationFrame you drive by hand: frame(ms) runs one frame ms after the last.
export function manualFrames() {
  let callback, stamp = 0;
  return { raf: fn => { callback = fn; }, frame: (dt = 16) => { stamp += dt; callback(stamp); } };
}

// Every descendant of a node, depth first.
export const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);

// A document whose canvases decode any image into a deterministic grey ramp (offset by the
// image file name), and a stand-in Image class, for experiments that load bitmaps
// (Valley). Installs globalThis.Image if there is none.
export function imageDocument() {
  globalThis.Image ??= class { async decode() {} };
  let drawn = "";
  return { createElement: () => ({ width: 0, height: 0, getContext: () => ({
    drawImage: image => { drawn = String(image.src); },
    getImageData: (x, y, width, height) => {
      const data = new Uint8ClampedArray(width * height * 4), offset = [...drawn].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 256;
      for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = (i / 4 + offset) % 256; data[i + 3] = 255; }
      return { data };
    }
  }) }) };
}
