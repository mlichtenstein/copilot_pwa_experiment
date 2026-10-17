/*
 * Purpose: Verify bounded, reproducible action reports and selection explanations.
 * Consumers: Node test runner and CI.
 * Dependencies: testing/load.cjs; Node test/assert.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./testing/load.cjs");

test("journals replay successes, failed actions, and rolling checkpoints exactly", () => {
  const { game, safety } = load();
  const session = safety.createSession(game, { limit: 3, build: { commit: "test" } });
  session.dispatch("startShift");
  session.dispatch("playCard", "empathize");
  session.dispatch("playCard", "sass"); // invalid while awaiting Continue
  session.dispatch("continueInteraction");
  session.dispatch("playCard", "sass");
  const report = JSON.parse(JSON.stringify(session.report()));
  assert.equal(report.entries.length, 3);
  assert.equal(report.droppedActions, 2);
  assert.equal(report.entries[0].ok, false);
  assert.deepEqual(report.entries[0].before, report.entries[0].after);
  assert.deepEqual(safety.replayReport(game, report, { commit: "test" }).state, session.state);
  assert.throws(() => safety.replayReport(game, report, { commit: "other" }), /Commit mismatch/);
  report.entries[1].after.day = 99;
  assert.throws(() => safety.replayReport(game, report), /diverged/);
});

test("selection traces explain unmet prerequisites and authored coverage gaps", () => {
  const { game, safety } = load();
  game.exchanges.find(e => e.id === "sass-success-fallback").coverage = "unwritten";
  const session = safety.createSession(game);
  session.dispatch("startShift");
  session.dispatch("playCard", "sass");
  const entry = session.report().entries.at(-1);
  const maria = entry.selection.find(e => e.id === "maria-sass-success");
  assert.ok(maria.reasons.some(r => r.includes("trust_min")));
  assert.equal(session.diagnostics.at(-1).code, "coverage_gap");
  assert.equal(safety.replayReport(game, session.report()).report().entries.at(-1).diagnostics[0].code, "coverage_gap");
});

test("malformed reports and wrong content versions are rejected", () => {
  const { game, safety } = load();
  assert.throws(() => safety.replayReport(game, {}), /format/);
  const session = safety.createSession(game);
  session.dispatch("startShift");
  const report = session.report();
  report.entries[0].action.args = [{}];
  assert.throws(() => safety.replayReport(game, report), /entry/);
  const changed = session.report();
  game.exchanges[0].lines[0].text += " changed";
  assert.throws(() => safety.replayReport(game, changed), /Content version mismatch/);
});
