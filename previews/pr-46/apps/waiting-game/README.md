<!--
Purpose: Explain the narrative authoring pilot and executable examples.
Consumers: Writers, developers, and reviewers.
Dependencies: maria-arc.js, game.js, testing/journey.cjs, game.test.js.
-->
# Writing a character arc

Read `maria-arc.js` top to bottom: relationship principles, mechanics and authored
exchanges, then playable example journeys. The engine uses the same exchanges that
the examples exercise. Browser scripts load the arc before `game.js`; examples
are inert definitions in the browser and execute only under Node tests.

Run `node --test apps/waiting-game/game.test.js` from the repository root (Node 22+).
CI runs the same command. No dependencies, custom language, or build step are required.
This JavaScript pilot deliberately preserves the static runtime; TypeScript remains
a design target rather than a prerequisite for testing the authoring experience.

`beginDay(outfit)` chooses clothes and starts work. `meet(id)` checks the current
customer; it never schedules or teleports to a customer. `play(card)` plays and
acknowledges a card through the controller. `expectDialogue(id)` checks the actual
selected exchange. `finishDay(cards)` requires every remaining choice explicitly
and goes home only after the engine completes the shift. Helpers expose no mutable
state. New scheduling will require journeys to follow the real scheduling rules.

Examples prove particular journeys are reachable. They do not enumerate every
possible story. Pair them with focused rule tests and negative journeys. When a
rule changes intentionally, update the principles and examples together. Do not
change expectations just to make a failing test green without explaining why.

Generic fallback exchanges remain in `game.js`; Maria-specific writing belongs in
her arc module. New arc assets must be loaded before the engine and included in the
service worker asset list. Cache namespace isolation is tracked separately in #40.

## Diagnostics and safe recovery

Run `node apps/waiting-game/testing/validate.cjs` and
`node --test apps/waiting-game/*.test.js`. Both Test and Deploy execute these;
publication stops on failure. Closed-PR cleanup skips validation.

The browser UI uses `WaitingGameSafety.createSession`: each action runs against a
copy, validates its resulting state, and commits only on success. Failures retain
the prior state and add a persistent, nonblocking notice with expandable details.
Malformed exchanges are reported and excluded as whole units (including effects).
If none matches, emergency text accompanies the mechanical result and Continue
remains available. Generic fallbacks are explicitly marked `coverage: "intentional"`;
authors can mark future placeholders `"unwritten"` for coverage reporting.

Content validation rejects unknown conditions/effects, duplicate IDs, malformed
lines, bad customer references, and missing unconditional repeatable fallbacks.
Direct engine evaluation throws on unknown conditions/effects. The safety layer
handles runtime recovery; tests and CI treat content errors as failures. Syntax
errors that prevent scripts loading are not recoverable content diagnostics.
