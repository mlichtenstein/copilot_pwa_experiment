/* Purpose: Offline coverage: everything a page needs is in the service worker's precache list
 *   (cloud-sw.js FILES): each page's scripts and styles, every module they import (followed
 *   through static and dynamic imports), the front page's pictures and the texture files; and
 *   every listed file exists.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, node:fs, cloud-sw.js,
 *   core/registry.js, home.js (thumbnailFor). */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { experiments } from "./core/registry.js";
import { thumbnailFor } from "./home.js";

const root = new URL("./", import.meta.url);
const sw = readFileSync(new URL("cloud-sw.js", root), "utf8");
const FILES = JSON.parse(sw.match(/const FILES = (\[[^\]]*\]);/)[1]);
// A path as cloud-sw.js lists it (relative to this folder, ../shared/ for the shared modules).
const listed = url => url.href.startsWith(root.href) ? url.href.slice(root.href.length) : "../" + url.href.slice(new URL("../", root).href.length);

function reachable() {
  const seen = new Set(), queue = [];
  const add = url => { const key = listed(url); if (!seen.has(key)) { seen.add(key); if (key.endsWith(".js")) queue.push(url); } };
  for (const page of ["index.html", ...experiments.map(entry => entry.href)]) {
    add(new URL(page, root));
    const html = readFileSync(new URL(page, root), "utf8");
    for (const [, src] of html.matchAll(/(?:src|href)="([^":#?]+\.(?:js|css|json|svg))"/g)) add(new URL(src, new URL(page, root)));
  }
  while (queue.length) {
    const url = queue.shift();
    const code = readFileSync(url, "utf8");
    for (const [, path] of code.matchAll(/(?:from|import\()\s*["'](\.[^"']+)["']/g)) add(new URL(path, url));
  }
  return [...seen];
}

test("the service worker precaches every file a page needs, and only files that exist", () => {
  assert.match(sw, /CACHE_PREFIX \+ "v7"/);
  const needed = [...reachable(), ...experiments.map(thumbnailFor)];
  for (const path of needed) assert.ok(FILES.includes(path), `${path} is precached`);
  for (const path of FILES.filter(path => path !== "./")) assert.ok(existsSync(new URL(path, root)), `${path} exists`);
  assert.equal(new Set(FILES).size, FILES.length, "no duplicates");
});
