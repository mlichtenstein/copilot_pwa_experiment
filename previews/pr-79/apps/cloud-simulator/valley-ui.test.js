/* Purpose: Check Valley textures on the shared host: controls stay locked until the sourced
 *   textures load, previews draw, switching textures keeps the wind clock, Step pauses and
 *   moves it one second, New seed counts the brush layout up, Randomize moves only the sliders, hidden
 *   tabs bank no time, and a failed load says so.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, valley-experiment.js,
 *   core/host.js and core/fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { valley } from "./valley-experiment.js";
import { mountExperiment } from "./core/host.js";
import { fakeDocument, fakeCanvas, manualFrames, imageDocument, controlIds } from "./core/fake-dom.js";

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
  const buttons = () => ["play", "step", "randomize", "new-seed"].map($);
  assert.deepEqual(controlIds($("playback")), ["play", "step", "randomize", "new-seed", "drift", "drift-speed", "reset-sun", "timeOfDay", "sunPathWidth", "sunPathHeight", "sunPathX", "sunPathY"]);
  assert.ok(buttons().every(button => button.disabled), "locked while textures load");
  frame();
  assert.equal($("stats").textContent, "", "no stats before the textures arrive");
  await page.instance.ready; await settle(); frame();
  assert.ok(buttons().every(button => !button.disabled));
  assert.ok($("preview-a").drawn >= 1 && $("preview-b").drawn >= 1, "previews drawn");
  assert.equal($("preview-a").parentNode, $("textureA").parentNode, "preview sits with its picker");
  assert.match($("stats").textContent, /^Sculpted bank · photo mask → Billowy bank · 0% B · seed 1 · t 0\.0 s · \d+ ms\/frame$/);

  $("step").fire("click"); frame(); assert.match($("stats").textContent, /t 1\.0 s/);
  $("textureA").value = "bank"; $("textureA").fire("change");
  $("textureB").value = "veil"; $("textureB").fire("change");
  $("textureBlend").value = "0.5"; $("textureBlend").fire("input"); frame();
  assert.match($("stats").textContent, /^Soft bank → Thin veil · 50% B · seed 1 · t 1\.0 s/);

  $("play").fire("click"); assert.equal($("play").textContent, "Pause");
  frame(100); assert.match($("stats").textContent, /t 1\.1 s/);
  doc.hidden = true; frame(5000); doc.hidden = false; frame(16); frame(16);
  assert.match($("stats").textContent, /t 1\.1 s/, "hidden tabs bank no time");

  $("windwardClearance").value = "0.2"; $("windwardClearance").fire("input");
  $("leewardClearance").value = "0"; $("leewardClearance").fire("input");
  $("new-seed").fire("click"); frame();
  assert.match($("stats").textContent, /seed 2/);

  // Randomize moves everything: sliders, the textures, the landscape and the brush layout.
  const before = page.getParams();
  $("randomize").fire("click"); frame();
  const after = page.getParams();
  assert.notEqual(after.seed, before.seed); assert.match($("stats").textContent, new RegExp(`seed ${after.seed} · t `));
  assert.equal($("textureA").value, after.textureA); assert.equal($("textureB").value, after.textureB);
  assert.equal($(`horizon-${after.horizon}`).checked, true);

  // Ratings save every control (not the wind clock); a saved run restores them.
  page.applyParams({ ...page.getParams(), horizon: "open", shape: "ribbon", seed: 5 }); frame();
  assert.equal($("horizon-open").checked, true); assert.equal($("shape").value, "ribbon"); assert.match($("stats").textContent, /seed 5/);
  assert.deepEqual(Object.keys(page.getParams()).sort(), [...valley.params.map(param => param.key), "sunPhase", "sunPathWidth", "sunPathHeight", "sunPathX", "sunPathY", "resolution", "drift", "driftSpeed"].sort());
  // Links saved before the layout was called `seed` stored it as brushSeed; they still load.
  const { seed, ...old } = page.getParams();
  page.applyParams({ ...old, brushSeed: 7 }); frame();
  assert.equal(page.getParams().seed, 7); assert.equal("brushSeed" in page.getParams(), false); assert.match($("stats").textContent, /seed 7/);
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
