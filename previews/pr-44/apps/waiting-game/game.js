/*
 * Waiting Game state and daily-loop rules.
 * Dependencies: maria-arc.js content; no DOM or UI framework.
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
  const exchanges = [
    ...window.WaitingGameArcs.maria.exchanges,
    {
      id: "sass-success-fallback",
      strategy: "sass",
      outcome: "success",
      priority: 0,
      conditions: [],
      lines: [
        { speaker: "Player", text: "I was going to make a joke, but you look like you can handle the truth." },
        { speaker: "Customer", text: "Good save. I'll allow it." }
      ],
      effects: [],
      repeatable: true
    },
    {
      id: "sass-failure-fallback",
      strategy: "sass",
      outcome: "failure",
      priority: 0,
      conditions: [],
      lines: [
        { speaker: "Player", text: "Well, that joke sounded better in my head." },
        { speaker: "Customer", text: "Maybe keep workshopping it." }
      ],
      effects: [],
      repeatable: true
    },
    {
      id: "empathy-success-fallback",
      strategy: "empathy",
      outcome: "success",
      priority: 0,
      conditions: [],
      lines: [
        { speaker: "Player", text: "Sounds like it's been a lot. I'm here if you want to talk." },
        { speaker: "Customer", text: "Thanks. It's nice to be heard." }
      ],
      effects: [],
      repeatable: true
    },
    {
      id: "empathy-failure-fallback",
      strategy: "empathy",
      outcome: "failure",
      priority: 0,
      conditions: [],
      lines: [
        { speaker: "Player", text: "I wanted to help, but I'm not sure I got that right." },
        { speaker: "Customer", text: "It's okay. Let's talk about something else." }
      ],
      effects: [],
      repeatable: true
    },
    {
      id: "flirting-success-fallback",
      strategy: "flirting",
      outcome: "success",
      priority: 0,
      conditions: [],
      lines: [
        { speaker: "Player", text: "Is it always this easy to lose track of time with you?" },
        { speaker: "Customer", text: "Careful, that almost worked." }
      ],
      effects: [],
      repeatable: true
    },
    {
      id: "flirting-failure-fallback",
      strategy: "flirting",
      outcome: "failure",
      priority: 0,
      conditions: [],
      lines: [
        { speaker: "Player", text: "That came out smoother in my head." },
        { speaker: "Customer", text: "Let's pretend you didn't say it." }
      ],
      effects: [],
      repeatable: true
    }
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
        trust: 0,
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
      relationshipChange: success ? 1 : -1,
      trustChange: card.strategy === "empathy" ? (success ? 1 : -1) : 0
    };
  }

  function evaluateCondition(condition, state) {
    if (!condition || typeof condition !== "object") return false;
    if (condition.type === "flag") {
      return state.narrative.flags[condition.key] === condition.value;
    }
    if (condition.type === "relationship_min") {
      const customer = state.customers[condition.customerId];
      return Boolean(customer && customer.relationship >= condition.value);
    }
    if (condition.type === "trust_min") {
      const customer = state.customers[condition.customerId];
      return Boolean(customer && customer.trust >= condition.value);
    }
    if (condition.type === "day_min") {
      return state.day >= condition.value;
    }
    return false;
  }

  function selectExchange(state, customerId, cardResult, availableExchanges = exchanges) {
    return availableExchanges
      .filter(exchange =>
        exchange.strategy === cardResult.strategy
        && exchange.outcome === cardResult.outcome
        && (!exchange.customerId || exchange.customerId === customerId)
        && exchange.conditions.every(condition => evaluateCondition(condition, state))
        && (exchange.repeatable || !state.narrative.seenExchanges.includes(exchange.id)))
      .sort((first, second) =>
        second.priority - first.priority
        || (first.id < second.id ? -1 : first.id > second.id ? 1 : 0))[0] || null;
  }

  function applyNarrativeEffects(state, exchange) {
    exchange.effects.forEach(effect => {
      if (effect.type === "set_flag") {
        state.narrative.flags[effect.key] = effect.value;
      }
    });
  }

  function playCard(state, cardId) {
    const encounter = currentEncounter(state);
    const card = cards.find(option => option.id === cardId);
    if (!encounter || !card || encounter.pendingResult) return false;

    const customer = state.customers[encounter.customerId];
    const result = resolveCard(card, state.player, customer, encounter);
    encounter.mood += result.moodChange;
    customer.relationship += result.relationshipChange;
    customer.trust = Math.max(0, customer.trust + result.trustChange);
    const exchange = selectExchange(state, encounter.customerId, result);
    if (exchange) {
      if (!state.narrative.seenExchanges.includes(exchange.id)) {
        state.narrative.seenExchanges.push(exchange.id);
      }
      applyNarrativeEffects(state, exchange);
    }
    encounter.pendingResult = { cardId, ...result, exchangeId: exchange && exchange.id };
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
    exchanges,
    evaluateCondition,
    selectExchange,
    playCard,
    continueInteraction,
    goHome
  };
})();
