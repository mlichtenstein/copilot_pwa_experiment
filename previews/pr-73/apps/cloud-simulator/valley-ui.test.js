/* Purpose: Check Valley textures on the shared host: controls stay locked until the sourced
 *   textures load, previews draw, switching textures keeps the wind clock, Step pauses and
 *   moves it one second, New brush layout counts up, Randomize moves only the sliders, hidden
 *   tabs bank no time, and a failed load says so.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, valley-experiment.js,
 *   core/host.js and core/fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { valley } from "./valley-experiment.js";
import { mountExperiment } from "./core/host.js";
import { fakeDocument, fakeCanvas, manualFrames, imageDocument } from "./core/fake-dom.js";

// The page document plus canvases that can both decode bitmaps (getImageData) and show previews.
function valleyDocument() {
  const doc = fakeDocument(["sky", "presets", "playback", "controls", "stats", "status"]), images = imageDocument(), make = doc.createElement;
  doc.createElement = tag => {
    const node = make(tag);
    if (tag === "canvas") {
      const decoder = images.createElement("canvas").getContext("2d");
      node.drawn = 0;
      node.getContext = () => ({ ...decoder, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => { node.drawn += 1; } });
    }
    return node;
  };
  return doc;
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test("Valley textures: loading lock, previews, wind clock, Step, brush layout, Randomize", async () => {
  const doc = valleyDocument(), canvas = fakeCanvas(doc, 48, 30), { raf, frame } = manualFrames(), $ = id => doc.getElementById(id);
  const page = mountExperiment(valley, { doc, raf, presets: false, serviceWorker: null });
  assert.deepEqual($("playback").children.map(node => node.textContent), ["Play wind", "Step 1 second", "New brush layout"]);
  assert.ok($("playback").children.every(button => button.disabled), "locked while textures load");
  frame();
  assert.equal($("stats").textContent, "", "no stats before the textures arrive");
  await page.instance.ready; await settle(); frame();
  assert.ok($("playback").children.every(button => !button.disabled));
  assert.ok($("preview-a").drawn >= 1 && $("preview-b").drawn >= 1, "previews drawn");
  assert.equal($("preview-a").parentNode, $("textureA").parentNode, "preview sits with its picker");
  assert.match($("stats").textContent, /^Sculpted bank · photo mask → Billowy bank · 0% B · layout 1 · t 0\.0 s · \d+ ms\/frame$/);

  $("step").fire("click"); frame(); assert.match($("stats").textContent, /t 1\.0 s/);
  $("textureA").value = "bank"; $("textureA").fire("change");
  $("textureB").value = "veil"; $("textureB").fire("change");
  $("textureBlend").value = "0.5"; $("textureBlend").fire("input"); frame();
  assert.match($("stats").textContent, /^Soft bank → Thin veil · 50% B · layout 1 · t 1\.0 s/);

  $("play").fire("click"); assert.equal($("play").textContent, "Pause wind");
  frame(100); assert.match($("stats").textContent, /t 1\.1 s/);
  doc.hidden = true; frame(5000); doc.hidden = false; frame(16); frame(16);
  assert.match($("stats").textContent, /t 1\.1 s/, "hidden tabs bank no time");

  $("windwardClearance").value = "0.2"; $("windwardClearance").fire("input");
  $("leewardClearance").value = "0"; $("leewardClearance").fire("input");
  $("new-brushSeed").fire("click"); frame();
  assert.match($("stats").textContent, /layout 2/);

  // Randomize moves the sliders; the textures, the brush layout and the wind clock stay.
  const before = page.getParams();
  $("randomize").fire("click"); frame();
  assert.match($("stats").textContent, /layout 2 · t /);
  assert.equal($("textureA").value, before.textureA); assert.equal($("textureB").value, before.textureB);
  assert.notDeepEqual(page.getParams(), before);

  // Ratings save every control (not the wind clock); a saved run restores them.
  page.applyParams({ ...page.getParams(), horizon: "open", shape: "ribbon", brushSeed: 5 }); frame();
  assert.equal($("horizon-open").checked, true); assert.equal($("shape").value, "ribbon"); assert.match($("stats").textContent, /layout 5/);
  assert.deepEqual(Object.keys(page.getParams()).sort(), [...valley.params.map(param => param.key), "resolution", "drift", "driftSpeed"].sort());
});

test("Valley textures: a failed load says so", async () => {
  const doc = valleyDocument(), original = globalThis.Image;
  fakeCanvas(doc, 48, 30);
  globalThis.Image = class { async decode() { throw new Error("offline"); } };
  const errors = console.error; console.error = () => {};
  try {
    const page = mountExperiment(valley, { doc, raf: () => {}, presets: false, serviceWorker: null });
    await page.instance.ready.catch(() => {}); await settle();
    assert.equal(doc.getElementById("status").textContent, "Cloud textures could not load. Reload online to try again.");
    assert.equal(doc.getElementById("play").disabled, true);
  } finally { globalThis.Image = original; console.error = errors; }
});
