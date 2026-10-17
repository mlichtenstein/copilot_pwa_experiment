/*
 * Purpose: Validate content/state and apply actions atomically with visible diagnostics.
 * Consumers: ui.js, Node validation, tests, and later report/replay tooling.
 * Dependencies: WaitingGame controller; JSON-serializable canonical state.
 */
(() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const text = value => typeof value === "string" && value.length > 0;
  const safeKey = value => text(value) && !["__proto__", "constructor", "prototype"].includes(value);
  const strategies = ["sass", "empathy", "flirting"];

  function validateContent(game) {
    const issues = [];
    const add = (message, exchangeIndex = null) => issues.push({ code: "invalid_content", message, exchangeIndex });
    for (const name of ["outfits", "customers", "cards", "exchanges"]) {
      const list = game[name];
      if (!Array.isArray(list) || !list.length) { add(`${name}: expected a nonempty array`); continue; }
      const counts = new Map();
      list.forEach(item => { if (object(item)) counts.set(item.id, (counts.get(item.id) || 0) + 1); });
      list.forEach((item, index) => {
        const at = name === "exchanges" ? index : null;
        if (!object(item) || !safeKey(item.id)) { add(`${name}[${index}]: invalid id`, at); return; }
        if (counts.get(item.id) > 1) add(`${name}: duplicate id ${item.id}`, at);
        if (name !== "exchanges" && !text(item.name)) add(`${name}.${item.id}: missing name`);
        if (name === "cards" && (!strategies.includes(item.strategy) || !text(item.description))) add(`cards.${item.id}: invalid strategy/description`);
        if (name === "outfits" && (!Array.isArray(item.tags) || !item.tags.every(text))) add(`outfits.${item.id}: invalid tags`);
        if (name === "customers" && (!object(item.traits) || !["humor", "empathy", "flirting"].every(key => Number.isFinite(item.traits[key])))) add(`customers.${item.id}: invalid traits`);
      });
    }
    const customerIds = new Set((Array.isArray(game.customers) ? game.customers : []).filter(object).map(c => c.id));
    (Array.isArray(game.exchanges) ? game.exchanges : []).forEach((exchange, index) => {
      if (!object(exchange)) return;
      const fail = message => add(`exchange ${exchange.id || index}: ${message}`, index);
      if (!strategies.includes(exchange.strategy) || !["success", "failure"].includes(exchange.outcome)) fail("invalid strategy/outcome");
      if (exchange.customerId !== undefined && !customerIds.has(exchange.customerId)) fail("unknown customer reference");
      if (!Number.isFinite(exchange.priority)) fail("priority must be finite");
      if (exchange.repeatable !== undefined && typeof exchange.repeatable !== "boolean") fail("repeatable must be boolean");
      if (exchange.coverage !== undefined && !["intentional", "unwritten"].includes(exchange.coverage)) fail("unknown coverage classification");
      if (!Array.isArray(exchange.lines) || !exchange.lines.length || !exchange.lines.every(line => object(line) && text(line.speaker) && text(line.text))) fail("malformed dialogue lines");
      if (!Array.isArray(exchange.conditions)) fail("conditions must be an array");
      else exchange.conditions.forEach(condition => {
        if (!object(condition)) { fail("malformed condition"); return; }
        if (condition.type === "flag") {
          if (!safeKey(condition.key) || typeof condition.value !== "boolean") fail("invalid flag condition");
        } else if (["relationship_min", "trust_min"].includes(condition.type)) {
          if (!customerIds.has(condition.customerId) || !Number.isFinite(condition.value)) fail(`invalid ${condition.type} condition`);
        } else if (condition.type === "day_min") {
          if (!Number.isInteger(condition.value) || condition.value < 1) fail("invalid day_min condition");
        } else fail(`unknown condition ${condition.type}`);
      });
      if (!Array.isArray(exchange.effects)) fail("effects must be an array");
      else exchange.effects.forEach(effect => {
        if (!object(effect) || effect.type !== "set_flag" || !safeKey(effect.key) || typeof effect.value !== "boolean") fail(`invalid/unknown effect ${effect?.type}`);
      });
    });
    const invalid = new Set(issues.filter(i => i.exchangeIndex !== null).map(i => i.exchangeIndex));
    const validExchanges = (Array.isArray(game.exchanges) ? game.exchanges : []).filter((_, i) => !invalid.has(i));
    for (const strategy of strategies) for (const outcome of ["success", "failure"]) {
      if (!validExchanges.some(e => !e.customerId && e.strategy === strategy && e.outcome === outcome && e.repeatable === true && e.conditions.length === 0)) {
        issues.push({ code: "missing_fallback", message: `Missing unconditional repeatable fallback: ${strategy}/${outcome}`, exchangeIndex: null });
      }
    }
    return { issues, validExchanges, blocked: issues.some(i => i.code === "invalid_content" && i.exchangeIndex === null) };
  }

  function validateState(state, game) {
    const require = (test, message) => { if (!test) throw new Error(`Invalid state: ${message}`); };
    require(object(state) && Number.isInteger(state.day) && state.day >= 1, "day");
    require(["apartment", "work", "endShift"].includes(state.phase), "phase");
    require(object(state.player) && Number.isFinite(state.player.money) && state.player.money >= 0, "player money");
    require(game.outfits.some(o => o.id === state.player.outfit), "outfit reference");
    require(object(state.player.skills) && strategies.every(k => Number.isFinite(state.player.skills[k])), "skills");
    require(object(state.customers) && game.customers.every(c => {
      const s = state.customers[c.id];
      return object(s) && s.id === c.id && Number.isFinite(s.relationship) && Number.isFinite(s.trust) && s.trust >= 0 && Number.isInteger(s.encounters) && s.encounters >= 0 && object(s.traits) && ["humor", "empathy", "flirting"].every(k => Number.isFinite(s.traits[k]));
    }), "customers");
    require(object(state.narrative) && object(state.narrative.flags) && Object.entries(state.narrative.flags).every(([k,v]) => safeKey(k) && typeof v === "boolean"), "flags");
    require(Array.isArray(state.narrative.seenExchanges) && state.narrative.seenExchanges.every(id => game.exchanges.some(e => e.id === id)), "exchange history");
    if (state.phase === "apartment") { require(state.currentShift === null, "apartment shift"); return; }
    const shift = state.currentShift;
    require(object(shift) && Array.isArray(shift.encounters) && shift.encounters.length > 0, "shift");
    require(Number.isInteger(shift.currentEncounter) && shift.currentEncounter >= 0 && shift.currentEncounter <= shift.encounters.length, "encounter cursor");
    require(Number.isFinite(shift.totalTips) && shift.totalTips >= 0, "tips");
    shift.encounters.forEach((e, index) => {
      require(object(e) && game.customers.some(c => c.id === e.customerId), "encounter customer");
      require(Number.isInteger(e.interactions) && e.interactions >= 0 && e.interactions <= game.interactionsPerEncounter && Number.isFinite(e.mood) && Number.isFinite(e.tip) && e.tip >= 0, "encounter values");
      require(e.completed === (e.interactions === game.interactionsPerEncounter) && e.completed === (index < shift.currentEncounter), "completion order");
      require(e.pendingResult === null || (index === shift.currentEncounter && object(e.pendingResult) && game.cards.some(c => c.id === e.pendingResult.cardId) && ["success", "failure"].includes(e.pendingResult.outcome) && ["moodChange", "relationshipChange", "trustChange"].every(k => Number.isFinite(e.pendingResult[k])) && (e.pendingResult.exchangeId === null || game.exchanges.some(x => x.id === e.pendingResult.exchangeId))), "pending result");
    });
    require(shift.totalTips === shift.encounters.reduce((total, e) => total + e.tip, 0), "tip accounting");
    require(state.phase === "endShift" ? shift.currentEncounter === shift.encounters.length : shift.currentEncounter < shift.encounters.length, "phase/cursor");
  }

  function createSession(game, options = {}) {
    const state = clone(options.state || game.createState());
    const diagnostics = [];
    const record = issue => { diagnostics.push(clone(issue)); if (diagnostics.length > 100) diagnostics.shift(); };
    const content = validateContent(game);
    content.issues.forEach(record);
    validateState(state, game);
    const actions = {
      selectOutfit: (working, args) => game.selectOutfit(working, ...args),
      startShift: working => game.startShift(working),
      playCard: (working, args) => game.playCard(working, ...args, content.validExchanges),
      continueInteraction: working => game.continueInteraction(working),
      goHome: working => game.goHome(working)
    };
    function dispatch(type, ...args) {
      const before = clone(state);
      try {
        if (content.blocked) throw new Error("Invalid base content; action was not applied");
        if (!Object.hasOwn(actions, type)) throw new Error(`Unknown action ${type}`);
        if (args.length !== (["selectOutfit", "playCard"].includes(type) ? 1 : 0) || args.some(a => typeof a !== "string")) throw new Error("Invalid action arguments");
        const working = clone(state);
        const result = actions[type](working, args);
        if (result === false) throw new Error(`Action ${type} is unavailable in this state`);
        validateState(working, game);
        if (type === "playCard" && !game.currentEncounter(working).pendingResult.exchangeId) record({ code: "missing_dialogue", message: "No valid dialogue matched; mechanical result applied with emergency text.", action: { type, args }, before });
        Object.keys(state).forEach(key => delete state[key]);
        Object.assign(state, working);
        return result;
      } catch (error) {
        record({ code: "action_failed", message: String(error.message || error), action: { type, args }, before });
        return false;
      }
    }
    return { state, diagnostics, dispatch };
  }
  window.WaitingGameSafety = { clone, validateContent, validateState, createSession };
})();
