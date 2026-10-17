/*
 * Purpose: Explore reproducible legal journeys and save coverage/failure reports.
 * Consumers: Test/Deploy workflows and developers.
 * Dependencies: load.cjs, Node fs/path; deterministic seeded choices.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { game, safety } = require("./load.cjs")();
const dir = process.env.WAITING_GAME_ARTIFACTS || path.join("artifacts", "waiting-game");
fs.mkdirSync(dir, { recursive: true });
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const coverage = { runs: 128, daysPerRun: 3, actions: 0, exchanges: {}, combinations: {}, gaps: [], failures: 0 };
const issues = safety.validateContent(game).issues;
if (issues.length) throw new Error(JSON.stringify(issues));
for (let seed = 1; seed <= coverage.runs; seed++) {
  let rng = seed;
  const pick = list => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return list[(rng >>> 0) % list.length]; };
  const session = safety.createSession(game, { build: { commit }, deployment: "ci-exploration" });
  try {
    while (session.state.day <= coverage.daysPerRun) {
      const state = session.state;
      const encounter = game.currentEncounter(state);
      let type, args = [];
      if (state.phase === "apartment") {
        if (!session.dispatch("selectOutfit", pick(game.outfits).id)) throw new Error("Outfit selection failed");
        coverage.actions++;
        type = "startShift";
      } else if (state.phase === "endShift") type = "goHome";
      else if (encounter.pendingResult) type = "continueInteraction";
      else { type = "playCard"; args = [pick(game.cards).id]; }
      if (!session.dispatch(type, ...args)) throw new Error(`Legal action failed: ${type}`);
      coverage.actions++;
      if (coverage.actions > 20000) throw new Error("Exploration action budget exceeded (possible stuck encounter)");
      const entry = session.report().entries.at(-1);
      if (entry.diagnostics.some(d => d.code !== "coverage_gap")) throw new Error("Unexpected diagnostic");
      if (type === "playCard") {
        const e = game.currentEncounter(state);
        const id = e.pendingResult.exchangeId;
        coverage.exchanges[id] = (coverage.exchanges[id] || 0) + 1;
        const key = [state.day, state.player.outfit, e.customerId, args[0], e.pendingResult.outcome, id].join("|");
        coverage.combinations[key] = (coverage.combinations[key] || 0) + 1;
        for (const gap of entry.diagnostics) coverage.gaps.push({ seed, key, ...gap });
      }
    }
    safety.replayReport(game, session.report(), { commit });
  } catch (error) {
    coverage.failures++;
    fs.writeFileSync(path.join(dir, `failure-seed-${seed}.json`), JSON.stringify({ ...session.report(), exploration: { seed, error: error.message } }, null, 2));
    break;
  }
}
coverage.unvisitedExchanges = game.exchanges.filter(e => !coverage.exchanges[e.id]).map(e => e.id);
fs.writeFileSync(path.join(dir, "coverage.json"), JSON.stringify(coverage, null, 2));
console.log(`${coverage.actions} actions across up to ${coverage.runs} seeded three-day journeys; ${coverage.failures} failures; ${coverage.gaps.length} unwritten situations.`);
if (coverage.failures) process.exitCode = 1;
