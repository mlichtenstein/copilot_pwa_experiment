/*
 * Purpose: Author Maria's relationship principles, vignettes, and playable examples.
 * Consumers: game.js in the browser; game.test.js in Node.
 * Dependencies: declarative engine conditions/effects; examples use the journey API.
 */
(() => {
  // PRINCIPLES
  // Maria wants to feel heard about a difficult job. Listening opens the subject;
  // humor on a later visit gives her room to imagine leaving. Other characters
  // can progress independently. These examples are possible journeys, not a script.

  // MECHANICS AND VIGNETTES
  // Mechanical relationship changes happen before eligibility is checked.
  // Exchanges are once-only unless repeatable is true. Flags/history commit when
  // the card is played; Continue acknowledges the result and advances the encounter.
  const exchanges = [
    {
      id: "maria-empathy-success",
      strategy: "empathy",
      outcome: "success",
      customerId: "maria",
      priority: 10,
      conditions: [{ type: "relationship_min", customerId: "maria", value: 1 }],
      lines: [
        { speaker: "Player", text: "You look like you've had a long day." },
        { speaker: "Maria", text: "That's one way to describe it. My boss has been driving me crazy." }
      ],
      effects: [{ type: "set_flag", key: "maria.discussed_work", value: true }]
    },
    {
      id: "maria-sass-success",
      strategy: "sass",
      outcome: "success",
      customerId: "maria",
      priority: 10,
      conditions: [
        { type: "flag", key: "maria.discussed_work", value: true },
        { type: "day_min", value: 2 }
      ],
      lines: [
        { speaker: "Player", text: "So, have you overthrown your terrible boss yet?" },
        { speaker: "Maria", text: "Not yet. But I've started drafting my resignation letter." }
      ],
      effects: [{ type: "set_flag", key: "maria.considering_quitting", value: true }]
    },
  ];

  // EXECUTABLE PLAYER JOURNEYS
  // The browser loads definitions only; the Node test runner executes these.
  const examples = [
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

  window.WaitingGameArcs = { maria: { exchanges, examples } };
})();
