/* Purpose: Walk every registered experiment page and check the common parts are the same on
 *   each. The header: the same lines and the same nav (every experiment, same labels, hrefs
 *   and order, Lightning included), only the current-page marker moving, and no hand-written
 *   header or nav left in the HTML. The common panel: the same buttons, sliders, labels and
 *   (hidden) explanatory texts in the same order; New seed present exactly when the
 *   experiment declares `seed`, the Sun group exactly when it declares `sun`; no page has a
 *   Play, Pause, Step, Randomize or New seed of its own (in its generated controls or its
 *   HTML). Descriptions everywhere are hidden until held (hold-help.test.js covers the hold).
 * Consumers: Node test runner. Dependencies: node:test, node:assert, node:fs, host.js,
 *   header.js, registry.js and fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mountExperiment, PANEL_TEXT } from "./host.js";
import { experiments } from "./registry.js";
import { SITE_NAME } from "./header.js";
import { fakeDocument, fakeCanvas, manualFrames, pageDocument, descendants, helpOf } from "./fake-dom.js";

// One line per element in the panel: what a person sees and reads (tag, id, class, its own
// text, tooltip, input type and range). Slider readouts (output) are left out: they show values.
const describe = node => [node.tagName, node.id ?? "", node.className ?? "", node.tagName === "OUTPUT" ? "" : node.children.length ? "" : node.textContent,
  node.title ?? "", node.type ?? "", node.min ?? "", node.max ?? "", node.step ?? "", node.attributes["aria-label"] ?? ""].join(" | ");
const isSunItem = node => { for (let n = node; n; n = n.parentNode) if (n.className === "panel-sun") return true; return false; };
const isTimeItem = node => { for (let n = node; n; n = n.parentNode) if (/(^| )time-row( |$)/.test(n.className ?? "")) return true; return false; };
const isSeedItem = node => { for (let n = node; n; n = n.parentNode) if (/(^| )new-seed( |$)/.test(n.className ?? "")) return true; return false; };

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
  assert.equal(pages.length, 8, "all eight experiments are on the shared core");
  const shared = ({ panel }) => panel.filter(node => !isSunItem(node) && !isSeedItem(node) && !isTimeItem(node)).map(describe);
  const reference = shared(pages[0]);
  // The always-present items, in order.
  assert.deepEqual(reference.filter(line => / \| (play|step|randomize|drift|drift-speed) \| /.test(line)).map(line => line.split(" | ")[1]),
    ["play", "step", "randomize", "drift", "drift-speed"]);
  // Compact rows: the buttons on one row, Drift and its speed on the next, the sun's path
  // shape folded away.
  const rows = pages[0].$("playback").children.map(child => child.className);
  assert.deepEqual(rows.slice(0, 3), ["panel-heading", "panel-row buttons", "panel-row drift-row"]);
  for (const page of pages) {
    assert.deepEqual(shared(page), reference, `${page.entry.title}: same buttons, labels, tooltips, texts and order`);
    assert.equal(page.$("playback").className, "common-panel");
    assert.equal(page.$("play").textContent, PANEL_TEXT.play);
    // Capability items: New seed exactly with `seed`, the Sun group exactly with `sun`, and
    // they come after the shared items (New seed, then Sun).
    const ids = page.panel.map(node => node.id).filter(Boolean);
    assert.equal(ids.includes("new-seed"), Boolean(page.experiment.seed), `${page.entry.title}: New seed iff seed`);
    assert.equal(ids.includes("reset-sun"), page.experiment.sun, `${page.entry.title}: Sun group iff sun`);
    const order = ["play", "step", "randomize", "new-seed", "drift", "drift-speed", "reset-sun", "timeOfDay"].filter(id => ids.includes(id));
    assert.deepEqual(ids.filter(id => order.includes(id)), order, `${page.entry.title}: panel order`);
    // The time of day is on every page: in the Sun group with `sun`, on its own row without.
    assert.ok(ids.includes("timeOfDay"), `${page.entry.title}: time of day`);
    assert.equal(helpOf(page.doc, page.$("timeOfDay")), PANEL_TEXT.timeOfDayNote);
    assert.equal(page.$("timeOfDay").parentNode.parentNode.className, page.experiment.sun ? "panel-row sun-row" : "panel-row time-row");
    const sunPath = page.panel.find(node => node.tagName === "DETAILS");
    if (page.experiment.sun) assert.ok(sunPath && !sunPath.open && descendants(sunPath).some(node => node.id === "sunPathWidth"), `${page.entry.title}: sun path shape folded`);
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

// The header's lines, and its nav as "label -> href" (or "[label]" for the current page).
const navOf = header => descendants(header.children.find(child => child.tagName === "NAV"))
  .filter(node => node.tagName === "A" || node.attributes["aria-current"]).map(node => node.attributes["aria-current"] ? `[${node.textContent}]` : `${node.textContent} -> ${node.href}`);

test("every page has the same header and nav, built from the registry", async () => {
  const pages = await mountAll();
  const all = experiments.map(entry => `${entry.nav} -> ${entry.href}`);
  assert.deepEqual(experiments.map(entry => entry.nav), ["Weather", "Sunset", "Convection", "Horizon", "Shafts", "Noise", "Valley", "Lightning"]);
  for (const { entry, $ } of pages) {
    const header = $("header");
    assert.equal(header.className, "experiment-header");
    assert.deepEqual(header.children.map(child => `${child.tagName}.${child.className ?? ""}`), ["P.eyebrow", "H1.", "P.tagline", "NAV.experiment-nav"], `${entry.title}: same lines`);
    assert.equal(header.children[0].textContent, SITE_NAME);
    assert.equal(header.children[1].textContent, entry.title);
    assert.equal(header.children[2].textContent, entry.tagline);
    // Every experiment, same order, labels and hrefs; only the current one is marked, not a link.
    assert.deepEqual(navOf(header), all.map(line => line.startsWith(`${entry.nav} ->`) ? `[${entry.nav}]` : line), `${entry.title}: nav`);
    // The HTML leaves the header to the host: an empty <header id="header">, no nav of its own.
    const html = readFileSync(new URL(`../${entry.href}`, import.meta.url), "utf8");
    assert.match(html, /<header id="header" class="experiment-header"><\/header>/, `${entry.href}: empty header`);
    assert.doesNotMatch(html, /<nav\b/, `${entry.href}: no hand-written nav`);
    for (const other of experiments) assert.doesNotMatch(html, new RegExp(`href="${other.href}"`), `${entry.href}: no hand-written link to ${other.href}`);
  }
  for (const page of pages) page.page.dispose();
});

test("descriptions are hidden by default, in the common panel and in every experiment's own controls", async () => {
  const pages = await mountAll();
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  assert.match(css, /\.help \{ display: none; \}/, "style.css hides .help");
  assert.match(css, /\.help-pop\[hidden\] \{ display: none; \}/);
  for (const { entry, doc, $, page } of pages) {
    const nodes = [...descendants($("playback")), ...descendants($("controls"))];
    const notes = nodes.filter(node => node.tagName === "SMALL");
    assert.ok(notes.length >= 6, `${entry.title}: has descriptions`);
    // Every description is a hidden .help, referenced by the control it describes.
    const described = new Set(nodes.map(node => node.attributes["aria-describedby"]).filter(Boolean));
    for (const note of notes) {
      assert.equal(note.className, "help", `${entry.title}: "${note.textContent}" is hidden`);
      assert.ok(described.has(note.id), `${entry.title}: "${note.textContent}" describes a control`);
    }
    // One popover, hidden until a hold; no tooltips doubling the held text.
    assert.equal(page.help.popover.hidden, true);
    assert.deepEqual(doc.body.children.filter(node => node.className === "help-pop"), [page.help.popover]);
    for (const node of nodes) if (node.attributes["aria-describedby"]) assert.ok(!node.title, `${entry.title}: #${node.id} has no title as well`);
  }
  for (const page of pages) page.page.dispose();
});

// CODING_STANDARDS.md "Control labels are code names": every slider, menu, radio group,
// toggle and seed box shows its param key, and the common sliders (timeOfDay, driftSpeed,
// the sun path) theirs.
test("every control's label is its code name, on every page", async () => {
  const pages = await mountAll();
  const codeIn = node => descendants(node).filter(child => child.tagName === "CODE").map(child => child.textContent);
  for (const { entry, experiment, $, page } of pages) {
    for (const param of experiment.params) {
      if (param.hidden) continue;
      const labelled = param.kind === "size" || (param.kind === "select" && param.display === "radio")
        ? $(param.key + "-label") : $(param.key)?.parentNode;
      assert.ok(labelled, `${entry.title}: ${param.key} is on the page`);
      assert.deepEqual(codeIn(labelled), [param.key], `${entry.title}: ${param.key}'s label is its code name`);
    }
    assert.deepEqual(codeIn($("timeOfDay").parentNode), ["timeOfDay"], `${entry.title}: timeOfDay`);
    if ($("drift-speed")) assert.deepEqual(codeIn($("drift-speed").parentNode), ["driftSpeed"], `${entry.title}: driftSpeed`);
  }
  for (const page of pages) page.page.dispose();
});
