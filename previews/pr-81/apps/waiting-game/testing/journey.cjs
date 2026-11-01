/*
 * Purpose: Execute readable player journeys using real game actions.
 * Consumers: story examples and Node tests.
 * Dependencies: node:assert; WaitingGame controller. No direct state edits.
 */
const assert = require('node:assert/strict');
function journey(game) {
  const state = game.createState();
  let lastExchange;
  const player = {
    beginDay(outfit = 'uniform') {
      assert.equal(game.selectOutfit(state, outfit), true);
      assert.equal(game.startShift(state), true);
    },
    meet(customerId) {
      assert.equal(game.currentEncounter(state)?.customerId, customerId);
    },
    play(cardId) {
      assert.ok(game.playCard(state, cardId), `Cannot play ${cardId}`);
      lastExchange = game.currentEncounter(state).pendingResult.exchangeId;
      assert.equal(game.continueInteraction(state), true);
    },
    expectDialogue(id) { assert.equal(lastExchange, id); },
    expectFlag(key, value) { assert.equal(state.narrative.flags[key] ?? false, value); },
    expectDay(day) { assert.equal(state.day, day); },
    finishDay(cards) {
      // Every remaining play is explicit: no automatic choices or skipped encounters.
      for (const card of cards) player.play(card);
      assert.equal(state.phase, 'endShift', 'Supply all remaining card plays');
      assert.equal(game.goHome(state), true);
    }
  };
  return player;
}
module.exports = { journey };
