/* Purpose: Just enough of the DOM for host.js in Node tests: elements with ids, nested
 *   children, listeners (on elements and the document), values, checked/disabled state, a
 *   body (for the hold-help popover) and a 2D canvas that keeps the last drawn pixels.
 *   fire(name, props) dispatches to one node's listeners with an event carrying props (a
 *   target, clientX, pointerType...); press(node, name, props) dispatches like a browser,
 *   capture listeners on the document first, then the node and its ancestors.
 * Consumers: host.test.js and the per-experiment UI tests (../*-ui.test.js).
 * Dependencies: none. */
export function fakeDocument(ids = ["header", "sky", "presets", "playback", "controls", "stats", "status"]) {
  const byId = new Map();
  const register = item => { if (item.id) byId.set(item.id, item); for (const child of item.children ?? []) register(child); };
  const node = tag => ({
    tagName: tag.toUpperCase(), children: [], parentNode: null, listeners: {}, attributes: {}, textContent: "", value: "", checked: false, disabled: false,
    append(...items) { for (const item of items) if (typeof item === "object") { item.parentNode = this; this.children.push(item); register(item); } },
    prepend(...items) { const nodes = items.filter(item => typeof item === "object"); for (const item of nodes) { item.parentNode = this; register(item); } this.children.unshift(...nodes); },
    addEventListener(name, fn, capture = false) { (this.listeners[name] ??= []).push(Object.assign(fn, { capture: capture === true || capture?.capture === true })); },
    fire(name, props = {}) { const event = makeEvent({ target: this, ...props }); for (const fn of this.listeners[name] ?? []) { if (event.stopped) break; fn(event); } return event; },
    contains(other) { for (let item = other; item; item = item.parentNode) if (item === this) return true; return false; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    setCustomValidity() {}, reportValidity() {}
  });
  const doc = { hidden: false, createElement: node, listeners: {}, getElementById: id => byId.get(id) ?? null,
    addEventListener(name, fn, capture = false) { (this.listeners[name] ??= []).push(Object.assign(fn, { capture: capture === true || capture?.capture === true })); } };
  doc.body = node("body");
  for (const id of ids) { const element = node("div"); element.id = id; byId.set(id, element); }
  return doc;
}

const makeEvent = props => ({ isTrusted: true, button: 0, clientX: 0, clientY: 0, defaultPrevented: false, stopped: false,
  preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...props });

// Dispatch `name` at `target` the way a browser would (bubbling events only): the document's
// capture listeners, then capture and plain listeners from the target up through its
// ancestors, then the document's plain listeners; stopPropagation stops it. Returns the event.
export function press(doc, target, name, props = {}) {
  const event = makeEvent({ target, ...props }), path = [];
  for (let item = target; item; item = item.parentNode) path.push(item);
  const run = (holder, capture) => { for (const fn of holder.listeners?.[name] ?? []) { if (event.stopped) return; if (fn.capture === capture) fn(event); } };
  run(doc, true);
  for (const item of [...path].reverse()) run(item, true);
  for (const item of path) run(item, false);
  run(doc, false);
  return event;
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

// The ids of the buttons and inputs inside an element (the common panel is #playback), in order.
export const controlIds = node => descendants(node).filter(child => ["BUTTON", "INPUT", "SELECT"].includes(child.tagName)).map(child => child.id);

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

// The hidden hold-to-see description of a control (via its aria-describedby), or undefined.
export const helpOf = (doc, node) => doc.getElementById(node?.attributes?.["aria-describedby"])?.textContent;
