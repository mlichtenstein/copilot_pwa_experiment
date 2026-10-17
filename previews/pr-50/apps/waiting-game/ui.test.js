/*
 * Purpose: Smoke-check visible recovery, UI actions, export, and storage failures.
 * Consumers: Node test runner and CI (not a browser/layout/offline substitute).
 * Dependencies: browser scripts and a minimal DOM/browser API harness.
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
function browser({ brokenContent = false, storageFails = false } = {}) {
  const downloads = [];
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; }
    append(...children) { this.children.push(...children); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(event, action) { this.listeners[event] = action; }
    querySelectorAll(tag) { return this.children.filter(c => c.tag === tag); }
    querySelector(tag) { return this.querySelectorAll(tag)[0]; }
    remove() { main.children = main.children.filter(c => c !== this); }
    click() { this.listeners.click?.(); }
  }
  const main = new Element("main");
  const storage = new Map();
  const context = {
    document: { createElement: tag => new Element(tag), querySelector: () => main },
    location: { pathname: "/preview/apps/waiting-game/" },
    localStorage: {
      getItem: key => storage.get(key),
      setItem: (key, value) => { if (storageFails) throw new Error("storage disabled"); storage.set(key, value); }
    },
    Blob: class { constructor(parts) { this.text = parts.join(""); } },
    URL: { createObjectURL: blob => { downloads.push(blob.text); return "blob:test"; }, revokeObjectURL() {} },
    setTimeout: fn => fn()
  };
  context.window = context;
  vm.createContext(context);
  for (const name of ["maria-arc.js", "game.js", "build-info.js", "safety.js", "ui.js"]) {
    if (name === "ui.js" && brokenContent) context.WaitingGame.exchanges[0].conditions.push({ type: "trust_mim" });
    vm.runInContext(fs.readFileSync(path.join(__dirname, name), "utf8"), context, { filename: name });
  }
  const nodes = node => [node, ...node.children.flatMap(nodes)];
  return {
    context, downloads,
    text: () => nodes(main).map(n => n.textContent || "").join("\n"),
    click(label) {
      const node = nodes(main).find(n => n.tag === "button" && (n.textContent === label || n.children.some(c => c.textContent === label)));
      assert.ok(node, `Missing button ${label}`);
      node.click();
    }
  };
}

test("bad content is visible, fallback keeps playing, and exported actions replay", () => {
  const app = browser({ brokenContent: true });
  assert.match(app.text(), /trust_mim/);
  app.click("Go to Work");
  app.click("Empathize");
  assert.match(app.text(), /nice to be heard/);
  app.click("Continue");
  app.click("Sass");
  app.click("Download debug report");
  const report = JSON.parse(app.downloads[0]);
  assert.equal(report.entries.length, 4);
  assert.equal(report.diagnostics[0].code, "invalid_content");
  assert.doesNotThrow(() => app.context.WaitingGameSafety.replayReport(app.context.WaitingGame, report));
});

test("storage failure is visible without preventing play or download", () => {
  const app = browser({ storageFails: true });
  app.click("Go to Work");
  assert.match(app.text(), /storage disabled/);
  app.click("Empathize");
  assert.match(app.text(), /My boss has been driving me crazy/);
  app.click("Download debug report");
  assert.equal(JSON.parse(app.downloads[0]).entries.length, 2);
});
