/* Purpose: The one hold-to-see mechanism (hold-help.js): a ~400 ms press-and-hold shows a
 *   control's hidden description in the popover without triggering the control; a short press
 *   still clicks; pressing a slider itself never starts a hold, so dragging is untouched;
 *   moving cancels; release, a tap elsewhere or Escape hides it; a mouse resting on it and
 *   keyboard focus show it too. Then the same on a real page's common panel (Sunset).
 * Consumers: Node test runner. Dependencies: node:test (mock timers), node:assert,
 *   hold-help.js, host.js, the Sunset experiment and fake-dom.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHoldHelp, HOLD_MS } from "./hold-help.js";
import { mountExperiment } from "./host.js";
import { sunset } from "../sunset-experiment.js";
import { fakeDocument, fakeCanvas, manualFrames, press } from "./fake-dom.js";

const touch = { pointerType: "touch" }, mouse = { pointerType: "mouse" };

function setup() {
  const doc = fakeDocument([]);
  const help = createHoldHelp(doc);
  const wrap = doc.createElement("span"), button = Object.assign(doc.createElement("button"), { id: "go" });
  wrap.append(button); doc.body.append(wrap);
  let clicks = 0; button.addEventListener("click", () => clicks++);
  help.attach(wrap, "Goes.", button);
  const label = doc.createElement("label"), slider = Object.assign(doc.createElement("input"), { id: "amount", type: "range" });
  label.append(Object.assign(doc.createElement("code"), { textContent: "amount" }), slider); doc.body.append(label);
  help.attach(label, "How much.", slider);
  const elsewhere = doc.createElement("div"); doc.body.append(elsewhere);
  return { doc, help, wrap, button, label, slider, elsewhere, clicks: () => clicks };
}

test("holding a button shows its help and does not press it; a short press still does", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { doc, help, wrap, button, clicks } = setup();
  assert.equal(HOLD_MS, 400);
  assert.equal(help.popover.hidden, true);
  assert.equal(button.attributes["aria-describedby"], "go-help");
  assert.equal(doc.getElementById("go-help").className, "help");

  press(doc, button, "pointerdown", touch);
  t.mock.timers.tick(HOLD_MS - 50); assert.equal(help.popover.hidden, true, "not yet");
  t.mock.timers.tick(50);
  assert.equal(help.popover.hidden, false); assert.equal(help.popover.textContent, "Goes."); assert.equal(help.shown, wrap);
  // The long press would open the phone's menu: prevented.
  assert.equal(press(doc, button, "contextmenu", touch).defaultPrevented, true);
  press(doc, button, "pointerup", touch);
  const click = press(doc, button, "click");
  assert.equal(clicks(), 0, "the hold's click is swallowed"); assert.equal(click.defaultPrevented, true);
  assert.equal(help.popover.hidden, true, "release hides it");

  // A short press is an ordinary click.
  press(doc, button, "pointerdown", touch); t.mock.timers.tick(150); press(doc, button, "pointerup", touch); press(doc, button, "click");
  t.mock.timers.tick(HOLD_MS);
  assert.equal(clicks(), 1); assert.equal(help.popover.hidden, true);
});

test("pressing a slider never starts a hold; holding its label does; moving cancels", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { doc, help, label, slider } = setup();
  // Dragging the slider: no hold, no popover, nothing prevented.
  const down = press(doc, slider, "pointerdown", { ...touch, clientX: 10 });
  for (let x = 12; x < 200; x += 20) press(doc, slider, "pointermove", { ...touch, clientX: x });
  t.mock.timers.tick(HOLD_MS * 3);
  assert.equal(help.popover.hidden, true); assert.equal(down.defaultPrevented, false);
  press(doc, slider, "pointerup", touch);
  // Holding the label's key shows the slider's help.
  const key = label.children[0];
  press(doc, key, "pointerdown", touch); t.mock.timers.tick(HOLD_MS);
  assert.equal(help.popover.textContent, "How much."); assert.equal(help.popover.hidden, false);
  assert.equal(label.attributes["data-help-open"], "true");
  press(doc, key, "pointerup", touch); assert.equal(help.popover.hidden, true);
  // A press that moves (a scroll) is not a hold.
  press(doc, key, "pointerdown", { ...touch, clientX: 0, clientY: 0 });
  press(doc, key, "pointermove", { ...touch, clientX: 0, clientY: 30 });
  t.mock.timers.tick(HOLD_MS * 2);
  assert.equal(help.popover.hidden, true);
  // Small jitter does not cancel it.
  press(doc, key, "pointerdown", { ...touch, clientX: 0, clientY: 0 });
  press(doc, key, "pointermove", { ...touch, clientX: 3, clientY: 4 });
  t.mock.timers.tick(HOLD_MS);
  assert.equal(help.popover.hidden, false);
});

test("a tap elsewhere or Escape hides it; a resting mouse and keyboard focus show it", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { doc, help, wrap, button, elsewhere } = setup();
  // Mouse resting on the button: shown after the same delay; leaving hides it.
  press(doc, button, "pointerenter", mouse); t.mock.timers.tick(HOLD_MS);
  assert.equal(help.shown, wrap);
  wrap.fire("pointerleave", mouse); assert.equal(help.popover.hidden, true);
  // Touch never shows it on enter (only a hold does), nor does a mouse dragging across.
  wrap.fire("pointerenter", touch); wrap.fire("pointerenter", { ...mouse, buttons: 1 }); t.mock.timers.tick(HOLD_MS);
  assert.equal(help.popover.hidden, true);
  // Keyboard focus shows it; blur hides it.
  press(doc, button, "focusin", { target: { ...button, matches: () => true } }); assert.equal(help.shown, wrap);
  press(doc, button, "focusout"); assert.equal(help.popover.hidden, true);
  // Focus from a mouse press (not :focus-visible) does not.
  wrap.fire("focusin", { target: { matches: () => false } }); assert.equal(help.popover.hidden, true);
  // A tap elsewhere hides it.
  help.show(wrap); press(doc, elsewhere, "pointerdown", touch); assert.equal(help.popover.hidden, true);
  // Escape hides it.
  help.show(wrap); for (const fn of doc.listeners.keydown) fn({ key: "Escape" }); assert.equal(help.popover.hidden, true);
});

test("on a page: holding Randomize shows its help and randomizes nothing; a click randomizes", async t => {
  const doc = fakeDocument(); fakeCanvas(doc, 32, 20);
  const { raf, frame } = manualFrames();
  const page = mountExperiment(sunset, { doc, raf, presets: false, serviceWorker: null, playing: false });
  frame();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const $ = id => doc.getElementById(id), before = page.getParams();
  press(doc, $("randomize"), "pointerdown", touch); t.mock.timers.tick(HOLD_MS);
  assert.equal(page.help.popover.hidden, false); assert.match(page.help.popover.textContent, /random value in its range/);
  press(doc, $("randomize"), "pointerup", touch); press(doc, $("randomize"), "click");
  assert.deepEqual(page.getParams(), before, "the hold did not randomize");
  press(doc, $("randomize"), "pointerdown", touch); press(doc, $("randomize"), "pointerup", touch); press(doc, $("randomize"), "click");
  assert.notDeepEqual(page.getParams(), before, "a click does");
  // Holding a slider's key in the experiment's own section shows its help.
  const key = $("extinction").parentNode.children[0];
  press(doc, key, "pointerdown", touch); t.mock.timers.tick(HOLD_MS);
  assert.equal(page.help.popover.textContent, doc.getElementById($("extinction").attributes["aria-describedby"]).textContent);
  page.dispose();
});
