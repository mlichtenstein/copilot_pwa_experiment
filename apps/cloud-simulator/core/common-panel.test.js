/* Purpose: Walk every registered experiment page and check the common panel is the same on
 *   each: the same buttons, sliders, labels, tooltips and explanatory texts in the same order;
 *   New seed present exactly when the experiment declares `seed`, the Sun group exactly when
 *   it declares `sun`; and no page has a Play, Pause, Step, Randomize or New seed of its own
 *   (in its generated controls or its HTML).
 * Consumers: Node test runner. Dependencies: node:test, node:assert, node:fs, host.js,
 *   registry.js and fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mountExperiment, PANEL_TEXT } from "./host.js";
import { experiments } from "./registry.js";
import { fakeDocument, fakeCanvas, manualFrames, imageDocument, descendants } from "./fake-dom.js";

// Every page's containers, with canvases that can decode Valley's bitmaps; it remembers every
// element made so the whole page can be searched.
function pageDocument() {
  const doc = fakeDocument(["sky", "presets", "playback", "controls", "stats", "status", "legend", "cloud-status", "patterns", "pattern-buttons"]);
  const images = imageDocument(), make = doc.createElement;
  doc.made = [];
  doc.createElement = tag => {
    const node = make(tag);
    doc.made.push(node);
    if (tag === "canvas") {
      const decoder = images.createElement("canvas").getContext("2d");
      node.getContext = () => ({ ...decoder, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} });
    }
    return node;
  };
  return doc;
}

// One line per element in the panel: what a person sees and reads (tag, id, class, its own
// text, tooltip, input type and range). Slider readouts (output) are left out: they show values.
const describe = node => [node.tagName, node.id ?? "", node.className ?? "", node.tagName === "OUTPUT" ? "" : node.children.length ? "" : node.textContent,
  node.title ?? "", node.type ?? "", node.min ?? "", node.max ?? "", node.step ?? "", node.attributes["aria-label"] ?? ""].join(" | ");
const isSunItem = node => { for (let n = node; n; n = n.parentNode) if (n.className === "panel-sun") return true; return false; };
const isSeedItem = node => { for (let n = node; n; n = n.parentNode) if (n.className === "panel-row new-seed") return true; return false; };

async function mountAll() {
  const pages = [];
  for (const entry of experiments) {
    const experiment = await entry.load();
    const doc = pageDocument(), $ = id => doc.getElementById(id);
    fakeCanvas(doc, 32, 20);
    const { raf, frame } = manualFrames();
    const page = mountExperiment(experiment, { doc, raf, presets: false, serviceWorker: null, playing: false });
    await page.instance.ready; await new Promise(resolve => setTimeout(resolve, 0));
    page.setPlaying(false); frame();
    pages.push({ entry, experiment, doc, $, page, panel: descendants($("playback")) });
  }
  return pages;
}

test("the common panel is identical on every experiment page", async () => {
  const pages = await mountAll();
  assert.equal(pages.length, 7, "all seven experiments are on the shared core");
  const shared = ({ panel }) => panel.filter(node => !isSunItem(node) && !isSeedItem(node)).map(describe);
  const reference = shared(pages[0]);
  // The always-present items, in order.
  assert.deepEqual(reference.filter(line => / \| (play|step|randomize|drift|drift-speed) \| /.test(line)).map(line => line.split(" | ")[1]),
    ["play", "step", "randomize", "drift", "drift-speed"]);
  for (const page of pages) {
    assert.deepEqual(shared(page), reference, `${page.entry.title}: same buttons, labels, tooltips, texts and order`);
    assert.equal(page.$("playback").className, "common-panel");
    assert.equal(page.$("play").textContent, PANEL_TEXT.play);
    // Capability items: New seed exactly with `seed`, the Sun group exactly with `sun`, and
    // they come after the shared items (New seed, then Sun).
    const ids = page.panel.map(node => node.id).filter(Boolean);
    assert.equal(ids.includes("new-seed"), Boolean(page.experiment.seed), `${page.entry.title}: New seed iff seed`);
    assert.equal(ids.includes("reset-sun"), page.experiment.sun, `${page.entry.title}: Sun group iff sun`);
    const order = ["play", "step", "randomize", "drift", "drift-speed", "new-seed", "reset-sun", "sunPhase"].filter(id => ids.includes(id));
    assert.deepEqual(ids.filter(id => order.includes(id)), order, `${page.entry.title}: panel order`);
  }
  // The capability items are the same wherever they appear too.
  for (const pick of [isSeedItem, isSunItem]) {
    const having = pages.map(({ panel }) => panel.filter(pick).map(describe)).filter(lines => lines.length);
    assert.ok(having.length >= 2);
    for (const lines of having) assert.deepEqual(lines, having[0]);
  }
  for (const page of pages) page.page.dispose();
});

test("no experiment page has its own Play, Pause, Step, Randomize or New seed", async () => {
  const pages = await mountAll();
  for (const { entry, doc, $ } of pages) {
    const panel = new Set(descendants($("playback")));
    const own = doc.made.filter(node => !panel.has(node) && node.tagName === "BUTTON" && /^(Play|Pause|Step|Randomize|New seed|Reset sun)\b/.test(node.textContent));
    assert.deepEqual(own.map(node => node.textContent), [], `${entry.title}: no common buttons outside the panel`);
    // Experiment-specific controls sit below, under the experiment's heading.
    assert.equal($("controls").children[0].className, "experiment-heading");
    // The page's HTML leaves the panel to the host: an empty #playback, no hand-made buttons for it.
    const html = readFileSync(new URL(`../${entry.href}`, import.meta.url), "utf8");
    assert.match(html, /<div[^>]*id="playback"[^>]*><\/div>/, `${entry.href} has an empty #playback`);
    assert.doesNotMatch(html, /<button[^>]*id="(play|step|randomize|reset|reset-sun|new-seed)"/, `${entry.href} builds no common buttons`);
    assert.doesNotMatch(html, />\s*(Play|Pause) [a-z]+\s*</, `${entry.href} has no labelled Play`);
  }
  for (const page of pages) page.page.dispose();
});
