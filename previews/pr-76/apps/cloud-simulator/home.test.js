/* Purpose: The front page (index.html, home.js) lists every registered experiment with its
 *   picture, title, one line and link; has the shared header, 🎲 Random and ❤️ Random; explains
 *   the common panel, hold for help, ratings and 🔗; and no longer redirects.
 * Consumers: Node test runner.
 * Dependencies: node:test, node:assert, node:fs, home.js, core/registry.js, core/launch.js,
 *   core/fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mountHome, thumbnailFor, HOME_TITLE } from "./home.js";
import { experiments } from "./core/registry.js";
import { LAUNCH_TEXT, randomHref } from "./core/launch.js";
import { fakeDocument, descendants } from "./core/fake-dom.js";

test("the front page lists every experiment with a picture, its line and a link", () => {
  const doc = fakeDocument(["header", "launch", "experiments", "status"]);
  const went = [];
  mountHome({ doc, serviceWorker: null, launch: { navigate: href => went.push(href), random: () => 0, storage: null } });
  const cards = doc.getElementById("experiments").children;
  assert.equal(cards.length, experiments.length);
  experiments.forEach((entry, i) => {
    const [link] = cards[i].children;
    assert.equal(link.href, entry.href);
    const [frame, title, line] = link.children;
    const [img] = frame.children;
    assert.equal(img.src, thumbnailFor(entry));
    assert.ok(existsSync(new URL(thumbnailFor(entry), import.meta.url)), `${entry.id}: thumbnail file`);
    assert.equal(title.textContent, entry.title);
    assert.equal(line.textContent, entry.tagline);
  });
  assert.equal(doc.getElementById("header").children.find(node => node.tagName === "H1").textContent, HOME_TITLE);
  const buttons = descendants(doc.getElementById("launch")).filter(node => node.tagName === "BUTTON");
  assert.deepEqual(buttons.map(node => node.textContent), [LAUNCH_TEXT.random, LAUNCH_TEXT.loved]);
  assert.ok(buttons.every(node => node.attributes["aria-describedby"]), "hold for help on both");
  buttons[0].listeners.click[0]();
  assert.deepEqual(went, [randomHref(experiments[0])]);
});

test("index.html explains the pages and no longer redirects", () => {
  const html = readFileSync(new URL("index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /http-equiv="refresh"|location\.replace/);
  assert.match(html, /<script type="module" src="home.js">/);
  for (const words of [/Play<\/b>/, /Step<\/b>/, /Randomize<\/b>/, /Drift<\/b>/, /driftSpeed/, /New seed<\/b>/, /timeOfDay/, /Hold for help/, /❤️ 🎨 🤮/, /🔗/]) assert.match(html, words);
});
