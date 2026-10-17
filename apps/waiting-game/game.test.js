/*
 * Purpose: Verify narrative rules and executable player journeys.
 * Consumers: Node test runner and CI.
 * Dependencies: game.js, maria-arc.js, testing/journey.cjs, Node built-ins.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = { window: {} };
const gamePath = path.join(__dirname, "game.js");
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "maria-arc.js"), "utf8"), context);
vm.runInNewContext(fs.readFileSync(gamePath, "utf8"), context);
const game = context.window.WaitingGame;
const mariaStoryExchange = "maria-sass-success";
const sassSuccess = { strategy: "sass", outcome: "success" };

test("Maria's follow-up requires the first story flag and Day 2", () => {
  const state = game.createState();
  state.day = 2;

  assert.notEqual(
    game.selectExchange(state, "maria", sassSuccess).id,
    mariaStoryExchange
  );

  state.narrative.flags["maria.discussed_work"] = true;
  state.day = 1;
  assert.notEqual(
    game.selectExchange(state, "maria", sassSuccess).id,
    mariaStoryExchange
  );
});

test("Maria's Day 1 conversation and further listening unlock the follow-up on Day 2", () => {
  const state = game.createState();
  assert.equal(game.startShift(state), true);

  const firstConversation = game.playCard(state, "empathize");
  assert.equal(firstConversation.outcome, "success");
  assert.equal(state.currentShift.encounters[0].pendingResult.exchangeId, "maria-empathy-success");
  assert.equal(state.narrative.flags["maria.discussed_work"], true);
  assert.equal(game.continueInteraction(state), true);

  const playAndContinue = cardId => {
    assert.ok(game.playCard(state, cardId));
    assert.equal(game.continueInteraction(state), true);
  };
  playAndContinue("empathize");
  playAndContinue("sass");
  playAndContinue("sass");
  assert.equal(state.phase, "endShift");
  assert.equal(game.goHome(state), true);
  assert.equal(state.day, 2);
  assert.equal(game.startShift(state), true);

  const secondConversation = game.playCard(state, "sass");
  assert.equal(secondConversation.outcome, "success");
  assert.equal(state.currentShift.encounters[0].pendingResult.exchangeId, mariaStoryExchange);
  assert.equal(state.narrative.flags["maria.considering_quitting"], true);
  assert.ok(state.narrative.seenExchanges.includes(mariaStoryExchange));
});

const { journey } = require("./testing/journey.cjs");
for (const example of context.window.WaitingGameArcs.maria.examples) {
  test(example.name, () => example.run(journey(game)));
}

test("Trust changes only through empathy, floors at zero, and resolution stays pure", () => {
  const state = game.createState();
  const customer = state.customers.alex;
  state.player.outfit = "casual";
  const before = JSON.stringify(state);
  const empathy = game.cards.find(card => card.id === "empathize");
  assert.equal(game.resolveCard(empathy, state.player, customer, {}).trustChange, -1);
  assert.equal(JSON.stringify(state), before);
  game.startShift(state);
  for (const card of ["sass", "sass", "empathize", "empathize"]) {
    assert.ok(game.playCard(state, card));
    assert.equal(game.continueInteraction(state), true);
  }
  assert.equal(customer.trust, 0);
  assert.equal(state.customers.maria.trust, 0);
});

test("Maria follow-up needs sufficient trust even with other prerequisites met", () => {
  const state = game.createState();
  state.day = 2;
  state.narrative.flags["maria.discussed_work"] = true;
  state.customers.maria.trust = 1;
  assert.notEqual(game.selectExchange(state, "maria", sassSuccess).id, mariaStoryExchange);
  state.customers.maria.trust = 2;
  assert.equal(game.selectExchange(state, "maria", sassSuccess).id, mariaStoryExchange);
  state.narrative.seenExchanges.push(mariaStoryExchange);
  assert.notEqual(game.selectExchange(state, "maria", sassSuccess).id, mariaStoryExchange);
});
