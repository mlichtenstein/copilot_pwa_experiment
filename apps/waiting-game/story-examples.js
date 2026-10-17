/*
 * Purpose: Describe executable journeys through Maria's existing story.
 * Consumers: game.test.js.
 * Dependencies: journey player API; no direct state access.
 */
module.exports = [
  {
    name: 'Listening today opens a conversation about leaving work tomorrow',
    run(player) {
      player.beginDay();
      player.meet('maria');
      player.play('empathize');
      player.expectDialogue('maria-empathy-success');
      player.finishDay(['sass', 'sass', 'sass']);
      player.expectDay(2);
      player.beginDay();
      player.meet('maria');
      player.play('sass');
      player.expectDialogue('maria-sass-success');
      player.expectFlag('maria.considering_quitting', true);
    }
  },
  {
    name: 'Humor cannot skip the first conversation, even on a later day',
    run(player) {
      player.beginDay();
      player.play('sass');
      player.expectDialogue('sass-success-fallback');
      player.finishDay(['sass', 'sass', 'sass']);
      player.beginDay();
      player.play('sass');
      player.expectDialogue('sass-success-fallback');
      player.expectFlag('maria.considering_quitting', false);
    }
  },
  {
    name: 'Maria does not decide to quit during the first visit',
    run(player) {
      player.beginDay();
      player.play('empathize');
      player.play('sass');
      player.expectDialogue('sass-success-fallback');
      player.expectFlag('maria.considering_quitting', false);
    }
  }
];
