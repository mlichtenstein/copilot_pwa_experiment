/*
 * Waiting Game state and daily-loop rules.
 * Dependencies: browser JavaScript only; no DOM or UI framework.
 * Consumer: ui.js, which calls these state and progression functions.
 */
(() => {
  const outfits = [
    { id: "uniform", name: "Work Uniform", tags: ["professional", "formal"] },
    { id: "casual", name: "Casual Outfit", tags: ["casual", "stylish"] }
  ];

  const customers = [
    { id: "maria", name: "Maria", traits: { humor: 3, empathy: 4, flirting: 1 } },
    { id: "alex", name: "Alex", traits: { humor: 4, empathy: 2, flirting: 3 } },
    { id: "jordan", name: "Jordan", traits: { humor: 2, empathy: 3, flirting: 4 } }
  ];
  const cards = [
    { id: "sass", name: "Sass", description: "Try some irreverent humor.", strategy: "sass" },
    { id: "empathize", name: "Empathize", description: "Offer understanding and support.", strategy: "empathy" },
    { id: "flirt", name: "Flirt", description: "Make a playful romantic advance.", strategy: "flirting" }
  ];
  const interactionsPerEncounter = 2;

  function createState() {
    return {
      day: 1,
      player: {
        money: 0,
        outfit: "uniform",
        skills: { sass: 1, empathy: 1, flirting: 1 }
      },
      customers: Object.fromEntries(customers.map(customer => [customer.id, {
        id: customer.id,
        relationship: 0,
        encounters: 0,
        traits: { ...customer.traits }
      }])),
      narrative: { flags: {}, seenExchanges: [] },
      currentShift: null,
      phase: "apartment"
    };
  }

  function selectCustomers(day) {
    const guest = customers[1 + ((day - 1) % (customers.length - 1))];
    return [customers[0], guest];
  }

  function createShift(state) {
    const shiftCustomers = selectCustomers(state.day);
    shiftCustomers.forEach(customer => {
      state.customers[customer.id].encounters += 1;
    });
    state.currentShift = {
      encounters: shiftCustomers.map(customer => ({
        customerId: customer.id,
        interactions: 0,
        mood: 0,
        pendingResult: null,
        completed: false,
        tip: 0
      })),
      currentEncounter: 0,
      totalTips: 0
    };
    state.phase = "work";
  }

  function currentEncounter(state) {
    if (state.phase !== "work" || !state.currentShift) return null;
    return state.currentShift.encounters[state.currentShift.currentEncounter] || null;
  }

  function startShift(state) {
    if (state.phase !== "apartment" || !outfits.some(outfit => outfit.id === state.player.outfit)) return false;
    createShift(state);
    return true;
  }

  function selectOutfit(state, outfitId) {
    if (state.phase !== "apartment" || !outfits.some(outfit => outfit.id === outfitId)) return false;
    state.player.outfit = outfitId;
    return true;
  }

  function resolveCard(card, player, customer, encounter) {
    const preference = card.strategy === "sass" ? "humor" : card.strategy;
    const outfitModifier = (player.outfit === "uniform" && card.strategy === "empathy")
      || (player.outfit === "casual" && card.strategy === "flirting") ? 1 : 0;
    const score = (player.skills[card.strategy] || 0)
      + (customer.traits[preference] || 0)
      + outfitModifier;
    const success = score >= 4;
    return {
      strategy: card.strategy,
      outcome: success ? "success" : "failure",
      moodChange: success ? 2 : -1,
      relationshipChange: success ? 1 : -1
    };
  }

  function playCard(state, cardId) {
    const encounter = currentEncounter(state);
    const card = cards.find(option => option.id === cardId);
    if (!encounter || !card || encounter.pendingResult) return false;

    const customer = state.customers[encounter.customerId];
    const result = resolveCard(card, state.player, customer, encounter);
    encounter.mood += result.moodChange;
    customer.relationship += result.relationshipChange;
    encounter.pendingResult = { cardId, ...result };
    return result;
  }

  function continueInteraction(state) {
    const encounter = currentEncounter(state);
    if (!encounter || !encounter.pendingResult) return false;

    encounter.interactions += 1;
    encounter.pendingResult = null;
    if (encounter.interactions === interactionsPerEncounter) {
      encounter.completed = true;
      encounter.tip = Math.max(0, 5 + encounter.mood);
      state.currentShift.totalTips += encounter.tip;
      state.currentShift.currentEncounter += 1;
      if (state.currentShift.currentEncounter === state.currentShift.encounters.length) {
        state.player.money += state.currentShift.totalTips;
        state.phase = "endShift";
      }
    }
    return true;
  }

  function goHome(state) {
    if (state.phase !== "endShift") return false;
    state.day += 1;
    state.currentShift = null;
    state.phase = "apartment";
    return true;
  }

  window.WaitingGame = {
    outfits,
    customers,
    cards,
    interactionsPerEncounter,
    createState,
    selectCustomers,
    currentEncounter,
    selectOutfit,
    startShift,
    resolveCard,
    playCard,
    continueInteraction,
    goHome
  };
})();
