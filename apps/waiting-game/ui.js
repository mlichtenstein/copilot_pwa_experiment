/*
 * Waiting Game browser UI.
 * Dependencies: WaitingGame from game.js and the <main> element in index.html.
 * Consumer: the browser, through the script element in index.html.
 */
(() => {
  const game = WaitingGame;
  const state = game.createState();
  const app = document.querySelector("main");

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function button(text, action, className) {
    const node = element("button", text);
    node.type = "button";
    if (className) node.className = className;
    node.addEventListener("click", action);
    return node;
  }

  function renderApartment() {
    const section = element("section");
    section.append(element("h2", "At Home"));
    section.append(element("p", `Day ${state.day} · Money: $${state.player.money}`));
    section.append(element("p", "Choose an outfit before work."));
    const choices = element("div", null, "choices");
    game.outfits.forEach(outfit => {
      const choice = button(outfit.name, () => {
        game.selectOutfit(state, outfit.id);
        render();
      });
      choice.setAttribute("aria-pressed", String(state.player.outfit === outfit.id));
      choices.append(choice);
    });
    section.append(choices);
    section.append(button("Go to Work", () => {
      game.startShift(state);
      render();
    }));
    app.append(section);
  }

  function renderWork() {
    const shift = state.currentShift;
    const encounter = game.currentEncounter(state);
    const customer = game.customers.find(person => person.id === encounter.customerId);
    const customerState = state.customers[encounter.customerId];
    const section = element("section");
    section.append(element("h2", "At Work"));
    section.append(element("p", `Day ${state.day} · Encounter ${shift.currentEncounter + 1} of ${shift.encounters.length}`));
    section.append(element("h3", customer.name));
    section.append(element("p", `Mood: ${encounter.mood} · Relationship: ${customerState.relationship}`));
    if (encounter.pendingResult) {
      const card = game.cards.find(option => option.id === encounter.pendingResult.cardId);
      const result = encounter.pendingResult;
      section.append(element("h4", `${card.name}: ${result.outcome}`));
      section.append(element("p", `Mood ${result.moodChange > 0 ? "+" : ""}${result.moodChange} · Relationship ${result.relationshipChange > 0 ? "+" : ""}${result.relationshipChange}`));
      section.append(button("Continue", () => {
        game.continueInteraction(state);
        render();
      }));
    } else {
      section.append(element("p", `Conversation ${encounter.interactions + 1} of ${game.interactionsPerEncounter}`));
      section.append(element("p", "Play a conversational strategy card."));
      const choices = element("div", null, "conversation-cards");
      game.cards.forEach(card => {
        const choice = button("", () => {
          game.playCard(state, card.id);
          render();
        }, "card-button");
        choice.setAttribute("aria-label", `${card.name}: ${card.description}`);
        choice.append(element("span", card.name, "card-title"));
        choice.append(element("span", card.description, "card-description"));
        choices.append(choice);
      });
      section.append(choices);
    }
    app.append(section);
  }

  function renderEndShift() {
    const section = element("section");
    section.append(element("h2", "Shift Complete"));
    section.append(element("p", `Tips earned: $${state.currentShift.totalTips}`));
    section.append(element("ul", null, "tips"));
    const list = section.querySelector("ul");
    state.currentShift.encounters.forEach(encounter => {
      const customer = game.customers.find(person => person.id === encounter.customerId);
      list.append(element("li", `${customer.name}: $${encounter.tip}`));
    });
    section.append(element("p", `Money: $${state.player.money}`));
    section.append(button("Go Home", () => {
      game.goHome(state);
      render();
    }));
    app.append(section);
  }

  function render() {
    app.querySelectorAll("section").forEach(section => section.remove());
    if (state.phase === "apartment") renderApartment();
    if (state.phase === "work") renderWork();
    if (state.phase === "endShift") renderEndShift();
  }

  render();
})();
