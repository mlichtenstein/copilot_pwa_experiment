/*
 * Purpose: Verify loud diagnostics, safe content exclusion, and atomic recovery.
 * Consumers: Node runner and CI.
 * Dependencies: testing/load.cjs and Node test/assert.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./testing/load.cjs");

test("unknown conditions are reported and excluded while fallback remains playable", () => {
  const { game, safety } = load();
  game.exchanges[0].conditions.push({ type: "trust_mim", value: 2 });
  const session = safety.createSession(game);
  assert.match(session.diagnostics[0].message, /trust_mim/);
  session.dispatch("startShift");
  assert.ok(session.dispatch("playCard", "empathize"));
  assert.equal(game.currentEncounter(session.state).pendingResult.exchangeId, "empathy-success-fallback");
  assert.equal(session.state.narrative.flags["maria.discussed_work"], undefined);
  assert.equal(session.dispatch("continueInteraction"), true);
});

test("duplicate IDs, malformed lines, invalid references/effects, and fallback holes fail validation", () => {
  for (const change of [
    g => g.exchanges.push(g.exchanges[0]),
    g => { g.exchanges[0].lines = null; },
    g => { g.exchanges[0].customerId = "missing"; },
    g => { g.exchanges[0].effects.push({ type: "typo" }); },
    g => { g.exchanges = g.exchanges.filter(e => e.id !== "sass-success-fallback"); }
  ]) {
    const { game, safety } = load(); change(game);
    assert.ok(safety.validateContent(game).issues.length);
  }
});

test("partial mutation and invalid results never commit; retry remains possible", () => {
  for (const throws of [true, false]) {
    const { game, safety } = load();
    const original = game.startShift;
    game.startShift = state => { state.player.money = NaN; if (throws) throw new Error("boom"); return true; };
    const session = safety.createSession(game);
    const before = JSON.stringify(session.state);
    assert.equal(session.dispatch("startShift"), false);
    assert.equal(JSON.stringify(session.state), before);
    assert.equal(JSON.stringify(session.diagnostics.at(-1).before), before);
    game.startShift = original;
    assert.equal(session.dispatch("startShift"), true);
  }
});

test("unavailable actions and unknown conditions fail visibly", () => {
  const { game, safety } = load();
  const session = safety.createSession(game);
  assert.equal(session.dispatch("playCard", "sass"), false);
  assert.equal(session.diagnostics.at(-1).code, "action_failed");
  assert.throws(() => game.evaluateCondition({ type: "typo" }, session.state), /Unknown/);
});
