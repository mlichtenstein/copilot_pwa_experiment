/*
 * Reusable text-adventure engine.
 *
 * A designer supplies a `world` object (see world.js): rooms describe where
 * items and exits begin, verbs describe which noun-kind sentence patterns are
 * legal, and combinations describe item interactions and their effects.
 * This file owns the reusable rules for making sentences, validating them,
 * keeping the current room/inventory/flags, and applying effects.
 *
 * The main loop is:
 *   1. The UI creates a Sentence from the selected verb and Noun buttons.
 *   2. perform() checks the sentence against that verb's patterns.
 *   3. A handler runs for the matched action, changing game state.
 *   4. getState() gives the UI a snapshot to render.
 */
(function (global) {
  // A Noun is the engine's typed reference to a thing the player can select.
  // `kind` (such as "item" or "exit") lets verb patterns reject invalid
  // sentence structures before an action is run.
  class Noun {
    constructor(id, kind, label) {
      // Check the data at the boundary so broken designer/UI data fails with a
      // useful message instead of producing a confusing sentence later.
      if (typeof id !== "string" || !id || typeof kind !== "string" || !kind ||
          typeof label !== "string" || !label) {
        throw new TypeError("A noun must have an ID, kind, and label.");
      }
      // Object.assign copies these named properties onto this new Noun object.
      Object.assign(this, { id, kind, label });
      // Freeze this reference so its identity cannot change after selection.
      // Freeze is shallow: it does not freeze other objects referenced inside.
      Object.freeze(this);
    }
  }

  // Sentences are immutable commands. Their nouns are ordered, so an action
  // can distinguish (for example) "put key in box" from another word order.
  class Sentence {
    constructor(verbId, nouns) {
      // A sentence is only valid when every selected object uses the engine's
      // Noun class; the verb's world-defined pattern checks count and kinds.
      if (typeof verbId !== "string" || !verbId || !Array.isArray(nouns) ||
          !nouns.every(noun => noun instanceof Noun)) {
        throw new TypeError("A sentence must have a verb ID and contain Noun instances.");
      }
      this.verbId = verbId;
      // Array spread copies the caller's list, so later edits to it cannot
      // change this sentence. Freeze then prevents changes to the copied list.
      this.nouns = Object.freeze([...nouns]);
      Object.freeze(this);
    }
  }

  // Create one independent play session from one designer-authored world.
  // The `world` definitions remain unchanged; roomId, inventory, itemLocations,
  // flags, and message are private state for this particular play session.
  function createGame(world) {
    let roomId = world.startRoom;
    const wonFlag = world.wonFlag ?? "won";
    const inventory = new Set();
    const flags = Object.create(null);
    const itemLocations = new Map();
    let message = world.messages.initial;
    Object.assign(flags, world.initialFlags ?? {});

    // Record each item's starting room. Later effects can move items into the
    // inventory, to a different room, or out of play without editing `world`.
    Object.entries(world.rooms).forEach(([id, room]) => {
      room.objects.forEach(itemId => itemLocations.set(itemId, id));
    });

    // Build the nouns currently available in this room. An object's location
    // comes from session state, while its label/description come from world data.
    function roomObjects() {
      const room = world.rooms[roomId];
      return [
        // The `...` here is array spread: it puts every mapped item in the
        // returned array. The inner `...world.items[id]` is object spread:
        // it copies an item's designer-defined fields into a fresh object.
        ...Object.keys(world.items)
          .filter(id => itemLocations.get(id) === roomId)
          .map(id => ({ id, kind: "item", ...world.items[id] })),
        // Exits are nouns too. Their destination is the room ID to switch to
        // when a one-noun "Use" sentence is performed on that exit.
        ...room.exits.filter(exit => !exit.requiresFlags ||
          Object.entries(exit.requiresFlags).every(([name, value]) => flags[name] === value)).map(exit => ({
          ...exit,
          kind: "exit",
          description: `This leads to the ${world.rooms[exit.destination].name}.`
        }))
      ];
    }

    // Return a UI-friendly snapshot. Copying these top-level collections keeps
    // rendering code from directly changing the engine's inventory or flags.
    function getState() {
      return {
        roomId,
        room: { ...world.rooms[roomId] },
        objects: roomObjects(),
        inventory: [...inventory].map(id => ({ id, kind: "item", ...world.items[id] })),
        flags: { ...flags },
        message,
        won: Boolean(flags[wonFlag])
      };
    }

    function findNoun(id) {
      const object = roomObjects().find(noun => noun.id === id);
      return object || getState().inventory.find(noun => noun.id === id);
    }

    // Effect types are implemented once here; designers combine these effects
    // in world data instead of adding special-case engine code per puzzle.
    // Object.assign copies the given properties onto the existing flags object.
    // Each effect handler is a reusable state operation. World rules choose
    // which operations to run and with what values; they don't add code here.
    const effectHandlers = {
      setFlag(effect) {
        Object.assign(flags, { [effect.name]: effect.value });
      },
      moveItem(effect) {
        if (!world.items[effect.item] ||
            (effect.to !== "inventory" && effect.to !== "nowhere" && !world.rooms[effect.to])) {
          throw new Error(`Invalid item move: ${effect.item} to ${effect.to}`);
        }
        inventory.delete(effect.item);
        if (effect.to === "inventory") {
          inventory.add(effect.item);
          itemLocations.set(effect.item, "inventory");
        } else {
          itemLocations.set(effect.item, effect.to);
        }
      },
      showMessage(effect) {
        message = effect.text;
      }
    };

    function applyEffects(effects) {
      effects.forEach(effect => {
        const handler = effectHandlers[effect.type];
        if (!Object.hasOwn(effectHandlers, effect.type)) {
          throw new Error(`Unknown world effect: ${effect.type}`);
        }
        handler(effect);
      });
    }

    // Verb patterns point to one of these handlers. This dispatch table keeps
    // action implementation separate from the designer-authored verb list.
    const actionHandlers = {
      examine(noun) {
        message = noun.description;
      },
      take(noun) {
        if (itemLocations.get(noun.id) !== roomId || inventory.has(noun.id)) {
          message = `You can't take ${noun.label}.`;
        } else {
          inventory.add(noun.id);
          itemLocations.set(noun.id, "inventory");
          message = `You put ${noun.label} in your inventory.`;
        }
      },
      useExit(noun) {
        const exit = world.rooms[roomId].exits.find(option => option.id === noun.id);
        if (!exit) {
          message = `${noun.label} doesn't lead anywhere.`;
        } else {
          roomId = exit.destination;
          message = `You enter the ${world.rooms[roomId].name.toLowerCase()}.`;
        }
      },
      combine(first, second) {
        // A combination rule matches the selected item IDs in either order.
        // Requirements gate the rule; effects describe the resulting changes.
        const combination = world.combinations.find(option =>
          ((option.items[0] === first.id && option.items[1] === second.id) ||
            (option.items[0] === second.id && option.items[1] === first.id)) &&
          (!option.requiresInventory || option.requiresInventory.every(id => inventory.has(id))) &&
          (!option.requiresFlags || Object.entries(option.requiresFlags)
            .every(([name, value]) => flags[name] === value))
        );
        if (combination) {
          applyEffects(combination.effects);
        } else {
          message = world.messages.noCombination;
        }
      }
    };

    function perform(sentence) {
      if (!(sentence instanceof Sentence)) return false;
      const verb = world.verbs[sentence.verbId];
      if (!verb) return false;
      // Patterns enforce the complete sentence grammar: exact noun count and
      // a matching kind at every position, e.g. ["item", "item"].
      const pattern = verb.patterns.find(candidate =>
        candidate.nounKinds.length === sentence.nouns.length &&
        candidate.nounKinds.every((kind, index) => kind === sentence.nouns[index].kind)
      );
      if (!pattern) return false;

      const nouns = sentence.nouns.map(noun => findNoun(noun.id));
      const handler = actionHandlers[pattern.action];
      if (!Object.hasOwn(actionHandlers, pattern.action) || nouns.some(noun => !noun)) return false;

      // The UI receives true for a handled sentence and can then render the
      // message and state returned by getState().
      handler(...nouns);
      return true;
    }

    return { getState, perform, verbs: world.verbs };
  }

  // Object.freeze prevents reassignment/addition of these object's own
  // properties; it is shallow, so it does not recursively freeze nested data.
  global.AdventureGame = { createGame, Noun, Sentence };
})(globalThis);
