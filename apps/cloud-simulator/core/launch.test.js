/* Purpose: The ways between pages (launch.js): 🎲 Random picks among every experiment and its
 *   ?random=1 page comes up randomized with valid settings; the random ❤️ picker against a
 *   mocked ratings table (hearts, none, unreachable) and the header buttons' messages; the sun
 *   carry-over (time of day, path shape, Drift) from page to page, with ?p= winning.
 * Consumers: Node test runner.
 * Dependencies: node:test, node:assert, launch.js, header.js, host.js, experiment.js,
 *   registry.js, sun-path.js, fake-dom.js, ../../shared/presets.js and ../../shared/drift.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { CARRY_KEY, LAUNCH_TEXT, pickLoved, pickRandom, randomExperiment, randomHref, readCarry, wantsRandom, withCarry, writeCarry } from "./launch.js";
import { launchButtons } from "./header.js";
import { mountExperiment } from "./host.js";
import { cleanParams, defaultParams, randomizableParams } from "./experiment.js";
import { experiments, findExperiment } from "./registry.js";
import { SUN_PATH_PARAMS } from "./sun-path.js";
import { pageDocument, fakeDocument, fakeCanvas, manualFrames, descendants } from "./fake-dom.js";
import { PresetError, paramsFromUrl, urlWithParams } from "../../shared/presets.js";
import { seededRandom } from "../../shared/drift.js";

const BASE = "https://example.com/apps/cloud-simulator/";
const memory = (initial = {}) => { const map = new Map(Object.entries(initial)); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }; };
const carried = { sunPhase: 0.6, sunPathWidth: 50, sunPathHeight: 20, sunPathX: -10, sunPathY: 12, drift: false, driftSpeed: 3 };

async function mount(entry, { url = null, session = memory(), seed = 3 } = {}) {
  const experiment = await entry.load();
  const doc = pageDocument();
  fakeCanvas(doc, 32, 20);
  const { raf, frame } = manualFrames();
  const page = mountExperiment(experiment, { doc, raf, presets: false, serviceWorker: null, playing: false, random: seededRandom(seed), url, session, navigate: () => {} });
  await page.instance.ready; await new Promise(resolve => setTimeout(resolve, 0));
  frame();
  return { experiment, doc, page, session };
}

test("🎲 Random can land on every experiment and opens it with ?random=1", () => {
  assert.equal(randomExperiment(() => 0).id, experiments[0].id);
  assert.equal(randomExperiment(() => 0.999999).id, experiments.at(-1).id);
  const seen = new Set(), random = seededRandom(1);
  for (let i = 0; i < 200; i++) seen.add(randomExperiment(random).id);
  assert.deepEqual([...seen].sort(), experiments.map(entry => entry.id).sort());
  assert.equal(pickRandom([]), null);
  for (const entry of experiments) {
    assert.equal(randomHref(entry), `${entry.href}?random=1`);
    assert.ok(wantsRandom(BASE + randomHref(entry)));
  }
  assert.equal(wantsRandom(BASE + "noise.html"), false);
});

test("?random=1 opens every experiment randomized, every setting valid", async () => {
  for (const entry of experiments) {
    const fresh = await mount(entry);
    const { experiment, page } = await mount(entry, { url: BASE + randomHref(entry), seed: 11 });
    const params = page.getParams(), defaults = defaultParams(experiment);
    assert.deepEqual(cleanParams(experiment, params, defaults), page.params, `${experiment.title}: valid`);
    const moved = randomizableParams(experiment).filter(param => params[param.key] !== defaults[param.key]);
    assert.ok(moved.length >= Math.ceil(randomizableParams(experiment).length / 2), `${experiment.title}: randomized (${moved.length} moved)`);
    assert.notEqual(params.sunPhase, fresh.page.getParams().sunPhase, `${experiment.title}: arriving fresh, the sun is random too`);
    fresh.page.dispose(); page.dispose();
  }
});

test("🎲 Random keeps the carried sun and Drift and randomizes the rest", async () => {
  for (const id of ["noise", "lightning"]) {
    const entry = findExperiment(id);
    const { experiment, page } = await mount(entry, { url: BASE + randomHref(entry), session: memory({ [CARRY_KEY]: JSON.stringify(carried) }) });
    const params = page.getParams();
    assert.ok(Math.abs(params.sunPhase - carried.sunPhase) < 1e-9, `${id}: time of day carried`);
    if (experiment.sun) for (const param of SUN_PATH_PARAMS) assert.equal(params[param.key], carried[param.key], `${id}: ${param.key} carried`);
    assert.equal(params.drift, false); assert.equal(params.driftSpeed, 3);
    page.dispose();
  }
});

test("the sun, its path and Drift carry from page to page; a ?p= link wins", async () => {
  const session = memory();
  const shafts = await mount(findExperiment("shafts"), { session });
  shafts.page.applyParams({ ...shafts.page.getParams(), ...carried });
  shafts.page.saveCarry();
  assert.deepEqual(readCarry(session), carried);
  // Lightning has no path: it takes the time and Drift, and passes the path on untouched.
  const lightning = await mount(findExperiment("lightning"), { session });
  assert.ok(Math.abs(lightning.page.getParams().sunPhase - 0.6) < 1e-9);
  assert.equal(lightning.page.getParams().driftSpeed, 3);
  lightning.page.clock.set(lightning.page.clock.time + 9);
  lightning.page.saveCarry();
  assert.equal(readCarry(session).sunPathWidth, 50);
  assert.notEqual(readCarry(session).sunPhase, 0.6);
  const valley = await mount(findExperiment("valley"), { session });
  for (const param of SUN_PATH_PARAMS) assert.equal(valley.page.getParams()[param.key], carried[param.key], `valley: ${param.key}`);
  assert.equal(valley.page.getParams().drift, false);
  // A ?p= link: its own settings, none of the carried ones (missing keys take defaults).
  const link = urlWithParams(BASE + "valley.html", { sunPhase: 0.3 });
  const linked = await mount(findExperiment("valley"), { session, url: link });
  assert.notEqual(linked.page.getParams().sunPathWidth, 50);
  // Junk in storage is ignored, and nothing is carried without storage.
  assert.equal(readCarry(memory({ [CARRY_KEY]: "{oops" })), null);
  assert.equal(readCarry(null), null);
  assert.equal(writeCarry(null, carried).sunPhase, 0.6);
  for (const page of [shafts, lightning, valley, linked]) page.page.dispose();
});

test("a ❤️ keeps its own sun and Drift; the carried ones fill in only what it lacks", () => {
  assert.deepEqual(withCarry({ a: 1 }, carried), { ...carried, a: 1 });
  assert.deepEqual(withCarry({ a: 1, sunPhase: 0.2 }, carried), { a: 1, sunPhase: 0.2, drift: false, driftSpeed: 3 });
  assert.deepEqual(withCarry({ a: 1, sunAzimuth: 10, sunElevation: 5, drift: true }, carried), { a: 1, sunAzimuth: 10, sunElevation: 5, drift: true });
  assert.deepEqual(withCarry({ a: 1 }, null), { a: 1 });
});

// A fake ratings store: listRated answers rows, or fails.
const storeOf = answer => ({ calls: [], async listRated(rating, options) { this.calls.push([rating, options]); if (answer instanceof Error) throw answer; return answer; } });

test("the random ❤️ picker opens a loved look, and says so gently when there is none or no network", async () => {
  const rows = [
    { app_id: "cloud-simulator/noise", params: { cloudiness: 0.7, sunPhase: 0.4 } },
    { app_id: "cloud-simulator/horizon", params: { layers: 3 } },
    { app_id: "cloud-simulator/retired", params: { x: 1 } },
    { app_id: "cloud-simulator/valley", params: "broken" }
  ];
  const store = storeOf(rows);
  const first = await pickLoved({ store, random: () => 0, base: BASE, carry: carried });
  assert.deepEqual(store.calls[0], ["love", { appPrefix: "cloud-simulator/", limit: 200 }]);
  assert.equal(first.entry.id, "noise");
  assert.equal(new URL(first.href).pathname, "/apps/cloud-simulator/noise.html");
  assert.deepEqual(paramsFromUrl(first.href), { cloudiness: 0.7, sunPhase: 0.4, drift: false, driftSpeed: 3 });
  const last = await pickLoved({ store, random: () => 0.99, base: BASE, carry: carried });
  assert.equal(last.entry.id, "horizon", "unknown experiments and broken rows are skipped");
  assert.deepEqual(paramsFromUrl(last.href), { ...carried, layers: 3 });
  assert.equal(await pickLoved({ store: storeOf([]), base: BASE }), null);
  await assert.rejects(pickLoved({ store: storeOf(new PresetError("offline", "x")), base: BASE }), { kind: "offline" });

  // The buttons: ❤️ goes to the pick, or explains; 🎲 goes to a random page. Both save first.
  const cases = [[storeOf(rows), null], [storeOf([]), LAUNCH_TEXT.none], [storeOf(new PresetError("offline", "x")), LAUNCH_TEXT.offline]];
  for (const [answer, message] of cases) {
    const doc = fakeDocument(), went = [];
    let saved = 0;
    const buttons = launchButtons({ doc, store: answer, base: BASE, random: () => 0, storage: memory(), navigate: href => went.push(href), beforeLeave: () => saved++ });
    const [random, loved] = buttons.buttons;
    await loved.listeners.click[0]();
    assert.equal(saved, 1);
    if (message) { assert.deepEqual(went, []); assert.equal(buttons.status.textContent, message); assert.equal(loved.disabled, false); }
    else { assert.equal(went.length, 1); assert.match(went[0], /noise\.html\?p=/); assert.equal(buttons.status.textContent, ""); }
    random.listeners.click[0]();
    assert.equal(went.at(-1), randomHref(experiments[0]));
    assert.equal(saved, 2);
    assert.ok(descendants(buttons.random).includes(random) && descendants(buttons.loved).includes(loved));
  }
});
