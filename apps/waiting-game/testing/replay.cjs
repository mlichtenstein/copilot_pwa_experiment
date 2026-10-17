/*
 * Purpose: Replay a downloaded report against the matching checked-out game.
 * Consumers: developers and future regression-fixture checks.
 * Dependencies: load.cjs, Node fs/child_process; JSON input only, never evaluated.
 */
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { game, safety } = require("./load.cjs")();
const filename = process.argv[2];
if (!filename) throw new Error("Usage: node apps/waiting-game/testing/replay.cjs report.json [--allow-version-mismatch]");
if (fs.statSync(filename).size > 10 * 1024 * 1024) throw new Error("Report exceeds 10 MiB");
const report = JSON.parse(fs.readFileSync(filename, "utf8"));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const options = process.argv.includes("--allow-version-mismatch") ? {} : { commit };
safety.replayReport(game, report, options);
console.log(`Replayed ${report.entries.length} actions from ${report.build.commit}; ${report.droppedActions} earlier actions replaced by checkpoint.`);
