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

  // These are the four condition forms the engine currently interprets. A typo
  // here would otherwise look like an ordinary unmet story prerequisite.
  function conditionProblem(condition, customerIds) {
    if (!object(condition)) return "malformed condition";

    switch (condition.type) {
      case "flag":
        return safeKey(condition.key) && typeof condition.value === "boolean"
          ? null : "flag condition needs a key and Boolean value";

      case "relationship_min":
      case "trust_min":
        return customerIds.has(condition.customerId) && Number.isFinite(condition.value)
          ? null : `${condition.type} needs a known customer and numeric threshold`;

      case "day_min":
        return Number.isInteger(condition.value) && condition.value >= 1
          ? null : "day_min needs a positive day number";

      default:
        return `unknown condition ${condition.type}`;
    }
  }

  function effectProblem(effect) {
    // set_flag is the only implemented effect. Do not invent validators for
    // future effects: add their contract when the engine learns to apply them.
    if (!object(effect) || effect.type !== "set_flag") {
      return `unknown effect ${effect?.type}`;
    }
    if (!safeKey(effect.key) || typeof effect.value !== "boolean") {
      return "set_flag needs a key and Boolean value";
    }
    return null;
  }

  function validateExchange(exchange, game, report) {
    // Validate only what selection, rendering, and effect application consume.
    // The code-authored outfit/card/customer tables are not a second schema here.
    if (!object(exchange)) {
      report("exchange must be an object");
      return;
    }

    if (!text(exchange.id)) report("exchange needs an id");
    if (!game.cards.some(card => card.strategy === exchange.strategy)) report("unknown strategy");
    if (!["success", "failure"].includes(exchange.outcome)) report("unknown outcome");
    if (!Number.isFinite(exchange.priority)) report("priority must be numeric");

    const customerIds = new Set(game.customers.map(customer => customer.id));
    if (exchange.customerId !== undefined && !customerIds.has(exchange.customerId)) {
      report("unknown customer reference");
    }

    if (!Array.isArray(exchange.lines) || !exchange.lines.length) {
      report("dialogue needs at least one line");
    } else {
      for (const line of exchange.lines) {
        if (!object(line) || !text(line.speaker) || !text(line.text)) {
          report("dialogue lines need a speaker and text");
        }
      }
    }

    // Reject the entire exchange if one condition/effect is malformed. This
    // prevents a scene from applying its first effect and losing the rest.
    if (!Array.isArray(exchange.conditions)) {
      report("conditions must be an array");
    } else {
      for (const condition of exchange.conditions) {
        const problem = conditionProblem(condition, customerIds);
        if (problem) report(problem);
      }
    }

    if (!Array.isArray(exchange.effects)) {
      report("effects must be an array");
    } else {
      for (const effect of exchange.effects) {
        const problem = effectProblem(effect);
        if (problem) report(problem);
      }
    }
  }

  function validateContent(game) {
    const issues = [];
    if (!Array.isArray(game.exchanges)) {
      issues.push({ code: "invalid_content", message: "exchanges must be an array", exchangeIndex: null });
      return { issues, validExchanges: [], blocked: true };
    }

    // IDs are used by both the UI and seen-exchange history. Exclude *all*
    // copies of a duplicate so lookup and selection cannot disagree.
    const counts = new Map();
    for (const exchange of game.exchanges) {
      if (object(exchange)) counts.set(exchange.id, (counts.get(exchange.id) || 0) + 1);
    }

    game.exchanges.forEach((exchange, index) => {
      const report = message => issues.push({
        code: "invalid_content",
        message: `exchange ${exchange?.id || index}: ${message}`,
        exchangeIndex: index
      });
      validateExchange(exchange, game, report);
      if (object(exchange) && counts.get(exchange.id) > 1) report("duplicate id");
    });

    const invalid = new Set(issues.map(issue => issue.exchangeIndex));
    const validExchanges = game.exchanges.filter((_, index) => !invalid.has(index));

    // A missing fallback is a build error, but is recoverable in a running
    // session: playCard still produces a result and the UI shows emergency text.
    const strategiesInUse = new Set(game.cards.map(card => card.strategy));
    for (const strategy of strategiesInUse) {
      for (const outcome of ["success", "failure"]) {
        const fallback = validExchanges.find(exchange =>
          !exchange.customerId
          && exchange.strategy === strategy
          && exchange.outcome === outcome
          && exchange.repeatable === true
          && exchange.conditions.length === 0
        );
        if (!fallback) issues.push({
          code: "missing_fallback",
          message: `Missing unconditional repeatable fallback: ${strategy}/${outcome}`,
          exchangeIndex: null
        });
      }
    }

    // Content defects are quarantined per exchange; they do not block the
    // remaining valid scenes. CI reads issues and fails rather than recovering.
    return { issues, validExchanges, blocked: false };
  }

  function validateState(state, game) {
    // These invariants describe today's controller and UI, not anticipated
    // game features. A transaction may commit only if they still hold.
    const require = (test, message) => {
      if (!test) throw new Error(`Invalid state: ${message}`);
    };
    require(object(state) && Number.isInteger(state.day) && state.day >= 1, "day");
    require(["apartment", "work", "endShift"].includes(state.phase), "phase");
    require(object(state.player) && Number.isFinite(state.player.money) && state.player.money >= 0, "player money");
    require(game.outfits.some(o => o.id === state.player.outfit), "outfit reference");

    // Persistent character values must remain usable by card resolution.
    require(object(state.player.skills) && strategies.every(k => Number.isFinite(state.player.skills[k])), "skills");
    require(object(state.customers) && game.customers.every(c => {
      const s = state.customers[c.id];
      return object(s)
        && s.id === c.id
        && Number.isFinite(s.relationship)
        && Number.isFinite(s.trust) && s.trust >= 0
        && Number.isInteger(s.encounters) && s.encounters >= 0
        && object(s.traits)
        && ["humor", "empathy", "flirting"].every(key => Number.isFinite(s.traits[key]));
    }), "customers");
    require(
      object(state.narrative)
      && object(state.narrative.flags)
      && Object.entries(state.narrative.flags).every(([key, value]) => safeKey(key) && typeof value === "boolean"),
      "flags"
    );
    require(
      Array.isArray(state.narrative.seenExchanges)
      && state.narrative.seenExchanges.every(id => game.exchanges.some(exchange => exchange.id === id)),
      "exchange history"
    );

    // At home there is no live shift. At work/endShift, the cursor and completed
    // encounters must agree so Continue cannot skip or pay an encounter twice.
    if (state.phase === "apartment") {
      require(state.currentShift === null, "apartment shift");
      return;
    }

    const shift = state.currentShift;
    require(object(shift) && Array.isArray(shift.encounters) && shift.encounters.length > 0, "shift");
    require(
      Number.isInteger(shift.currentEncounter)
      && shift.currentEncounter >= 0 && shift.currentEncounter <= shift.encounters.length,
      "encounter cursor"
    );
    require(Number.isFinite(shift.totalTips) && shift.totalTips >= 0, "tips");
    shift.encounters.forEach((e, index) => {
      require(object(e) && game.customers.some(c => c.id === e.customerId), "encounter customer");
      require(
        Number.isInteger(e.interactions)
        && e.interactions >= 0 && e.interactions <= game.interactionsPerEncounter
        && Number.isFinite(e.mood)
        && Number.isFinite(e.tip) && e.tip >= 0,
        "encounter values"
      );
      require(
        e.completed === (e.interactions === game.interactionsPerEncounter)
        && e.completed === (index < shift.currentEncounter),
        "completion order"
      );
      // The UI resolves these IDs to display the pending card and dialogue.
      const pending = e.pendingResult;
      require(pending === null || (
        index === shift.currentEncounter
        && object(pending)
        && game.cards.some(card => card.id === pending.cardId)
        && ["success", "failure"].includes(pending.outcome)
        && ["moodChange", "relationshipChange", "trustChange"].every(key => Number.isFinite(pending[key]))
        && (pending.exchangeId === null || game.exchanges.some(exchange => exchange.id === pending.exchangeId))
      ), "pending result");
    });
    require(shift.totalTips === shift.encounters.reduce((total, e) => total + e.tip, 0), "tip accounting");
    require(
      state.phase === "endShift"
        ? shift.currentEncounter === shift.encounters.length
        : shift.currentEncounter < shift.encounters.length,
      "phase/cursor"
    );
  }

  // A content fingerprint catches replay against different authored definitions.
  // The build SHA identifies engine code; this hash is not an integrity signature.
  function contentHash(game) {
    const source = JSON.stringify([game.outfits, game.customers, game.cards, game.exchanges, game.interactionsPerEncounter]);
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619) >>> 0;
    return hash.toString(16).padStart(8, "0");
  }

  // Capture selection reasoning before the chosen exchange applies its effects;
  // otherwise those new flags could change the explanation of eligibility.
  function explainSelection(game, state, customerId, result, selected, candidates) {
    return candidates.filter(e => e.strategy === result.strategy && e.outcome === result.outcome).map(e => {
      const reasons = [];
      if (e.customerId && e.customerId !== customerId) reasons.push("different customer");
      if (!e.repeatable && state.narrative.seenExchanges.includes(e.id)) reasons.push("already seen");
      for (const condition of e.conditions) if (!game.evaluateCondition(condition, state)) reasons.push(`unmet ${JSON.stringify(condition)}`);
      if (!reasons.length && e.id !== selected?.id) reasons.push("lower priority or ID tie-break");
      return { id: e.id, selected: e.id === selected?.id, reasons };
    });
  }

  function createSession(game, options = {}) {
    const state = clone(options.state || game.createState());
    const diagnostics = [];
    // Keep persistent notices separately from the notices emitted by one action.
    // Replay compares the latter, including diagnostics from rejected attempts.
    let emitted = null;
    const record = issue => {
      const entry = clone(issue);
      diagnostics.push(entry);
      if (emitted) emitted.push(entry);
      if (diagnostics.length > 100) diagnostics.shift();
    };

    // Bound the journal. Once a record is dropped, its resulting state becomes
    // the checkpoint from which the remaining records can still be replayed.
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Journal limit must be 1..1000");
    const journal = [];
    let initialState = clone(state);
    let droppedActions = 0;
    let selection = [];
    const content = validateContent(game);
    content.issues.forEach(record);
    validateState(state, game);

    // The UI and replay share this explicit controller-action allowlist.
    const actions = {
      selectOutfit: (working, args) => game.selectOutfit(working, ...args),
      startShift: working => game.startShift(working),
      playCard: (working, args) => game.playCard(working, ...args, content.validExchanges, (at, result, selected) => {
        selection = explainSelection(game, at, game.currentEncounter(at).customerId, result, selected, content.validExchanges);
        if (selected?.coverage === "unwritten") record({ code: "coverage_gap", message: `Unwritten dialogue: ${selected.id}` });
      }),
      continueInteraction: working => game.continueInteraction(working),
      goHome: working => game.goHome(working)
    };

    function dispatch(type, ...args) {
      const before = clone(state);
      emitted = [];
      selection = [];
      let ok = false;
      let resultValue = false;
      try {
        if (content.blocked) throw new Error("Invalid base content; action was not applied");
        if (!Object.hasOwn(actions, type)) throw new Error(`Unknown action ${type}`);
        const expectedArgs = ["selectOutfit", "playCard"].includes(type) ? 1 : 0;
        if (args.length !== expectedArgs || args.some(arg => typeof arg !== "string")) {
          throw new Error("Invalid action arguments");
        }

        // Resolve against a copy. Exceptions or invariant failures cannot leak
        // partial mood, relationship, flag, or tip updates into playable state.
        const working = clone(state);
        const result = actions[type](working, args);
        if (result === false) throw new Error(`Action ${type} is unavailable in this state`);
        validateState(working, game);
        if (type === "playCard" && !game.currentEncounter(working).pendingResult.exchangeId) {
          record({
            code: "missing_dialogue",
            message: "No valid dialogue matched; mechanical result applied with emergency text.",
            action: { type, args },
            before
          });
        }

        // Commit only after validation, keeping the root reference used by UI.
        Object.keys(state).forEach(key => delete state[key]);
        Object.assign(state, working);
        ok = true;
        resultValue = result;
        return result;
      } catch (error) {
        // Preserve the previous playable state and the snapshot for diagnosis.
        record({
          code: "action_failed",
          message: String(error.message || error),
          action: { type, args },
          before
        });
        return false;
      } finally {
        // Record both successes and failures. An unsuccessful action has equal
        // before/after states, which replay checks along with its diagnostic.
        journal.push({
          action: { type, args: clone(args) },
          ok,
          result: clone(resultValue),
          before,
          after: clone(state),
          selection: clone(selection),
          diagnostics: emitted
        });
        emitted = null;
        if (journal.length > limit) {
          initialState = journal.shift().after;
          droppedActions += 1;
        }
      }
    }

    // Export plain data; inspecting a report cannot mutate the active session.
    function report() {
      return clone({ formatVersion: 1, build: options.build || window.WaitingGameBuild || { commit: "development" }, deployment: options.deployment || "local", contentHash: contentHash(game), droppedActions, initialState, entries: journal, diagnostics });
    }
    return { state, diagnostics, dispatch, report, addDiagnostic: record };
  }

  // Imported reports supply data only, never executable callbacks. Check the
  // version first, then execute their actions through the same transaction path.
  function replayReport(game, report, options = {}) {
    if (!object(report) || report.formatVersion !== 1 || !object(report.build) || !text(report.build.commit) || !text(report.deployment) || !Number.isInteger(report.droppedActions) || report.droppedActions < 0 || !Array.isArray(report.entries) || report.entries.length > 1000) throw new Error("Invalid report format");
    if (report.contentHash !== contentHash(game)) throw new Error("Content version mismatch; check out the report's commit");
    if (options.commit && report.build.commit !== options.commit) throw new Error("Commit mismatch; check out the report's commit");
    for (const entry of report.entries) {
      if (!object(entry) || !object(entry.action) || !text(entry.action.type) || !Array.isArray(entry.action.args) || entry.action.args.length > 1 || !entry.action.args.every(a => typeof a === "string") || typeof entry.ok !== "boolean" || !Array.isArray(entry.selection) || !Array.isArray(entry.diagnostics)) throw new Error("Invalid report entry");
    }
    const session = createSession(game, { state: report.initialState, build: report.build, limit: 1000 });
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    report.entries.forEach((entry, index) => {
      if (!equal(session.state, entry.before)) throw new Error(`Replay diverged before action ${index}`);
      session.dispatch(entry.action.type, ...entry.action.args);
      const actual = session.report().entries.at(-1);
      if (!equal(actual, entry)) throw new Error(`Replay diverged at action ${index}`);
    });
    return session;
  }
  window.WaitingGameSafety = { clone, validateContent, validateState, createSession, contentHash, replayReport };
})();
