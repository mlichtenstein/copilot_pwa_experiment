/* Game state and daily-loop rules for Waiting Game. */
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
  const interactionsPerEncounter = 2;
  const placeholderTip = 5;

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

  function continueInteraction(state) {
    const encounter = currentEncounter(state);
    if (!encounter) return false;

    encounter.interactions += 1;
    if (encounter.interactions === interactionsPerEncounter) {
      encounter.completed = true;
      encounter.tip = placeholderTip;
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
    interactionsPerEncounter,
    createState,
    selectCustomers,
    currentEncounter,
    selectOutfit,
    startShift,
    continueInteraction,
    goHome
  };
})();
