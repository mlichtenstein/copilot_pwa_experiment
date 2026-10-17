/*
 * Purpose: Fail CI on malformed game content and initial state.
 * Consumers: Test and Deploy workflows; developers.
 * Dependencies: load.cjs and safety validators.
 */
const { game, safety } = require("./load.cjs")();
const { issues } = safety.validateContent(game);
for (const issue of issues) console.error(issue.message);
safety.validateState(game.createState(), game);
if (issues.length) process.exitCode = 1;
else console.log(`Validated ${game.exchanges.length} exchanges and initial state.`);
