/*
 * Purpose: Load the same browser game modules in an isolated Node VM.
 * Consumers: validation, tests, replay, and exploration commands.
 * Dependencies: Node fs/path/vm and the browser scripts listed below.
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
module.exports = function load() {
  const context = { window: {} };
  for (const name of ["maria-arc.js", "game.js", "safety.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", name), "utf8"), context, { filename: name });
  }
  return { game: context.window.WaitingGame, safety: context.window.WaitingGameSafety };
};
