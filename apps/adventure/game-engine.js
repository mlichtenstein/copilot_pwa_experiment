(function (global) {
  class Noun {
    constructor(id, kind, label) {
      if (typeof id !== "string" || !id || typeof kind !== "string" || !kind ||
          typeof label !== "string" || !label) {
        throw new TypeError("A noun must have an ID, kind, and label.");
      }
      Object.assign(this, { id, kind, label });
      Object.freeze(this);
    }
  }

  class Sentence {
    constructor(verbId, nouns) {
      if (typeof verbId !== "string" || !verbId || !Array.isArray(nouns) ||
          !nouns.every(noun => noun instanceof Noun)) {
        throw new TypeError("A sentence must have a verb ID and contain Noun instances.");
      }
      this.verbId = verbId;
      this.nouns = Object.freeze([...nouns]);
      Object.freeze(this);
    }
  }

  function createGame(world) {
    let roomId = world.startRoom;
    const inventory = new Set();
    let message = world.messages.initial;
    let won = false;

    function roomObjects() {
      const room = world.rooms[roomId];
      return [
        ...room.objects.filter(id => !inventory.has(id)).map(id => ({ id, kind: "item", ...world.items[id] })),
        ...room.exits.map(exit => ({
          ...exit,
          kind: "exit",
          description: `This leads to the ${world.rooms[exit.destination].name}.`
        }))
      ];
    }

    function getState() {
      return {
        roomId,
        room: { ...world.rooms[roomId] },
        objects: roomObjects(),
        inventory: [...inventory].map(id => ({ id, kind: "item", ...world.items[id] })),
        message,
        won
      };
    }

    function findNoun(id) {
      const object = roomObjects().find(noun => noun.id === id);
      return object || getState().inventory.find(noun => noun.id === id);
    }

    const actionHandlers = {
      examine(noun) {
        message = noun.description;
      },
      take(noun) {
        if (!world.rooms[roomId].objects.includes(noun.id) || inventory.has(noun.id)) {
          message = `You can't take ${noun.label}.`;
        } else {
          inventory.add(noun.id);
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
        const combination = world.combinations.find(option =>
          (option.items[0] === first.id && option.items[1] === second.id) ||
          (option.items[0] === second.id && option.items[1] === first.id)
        );
        if (combination && (!combination.requiresInventory ||
            combination.requiresInventory.every(id => inventory.has(id)))) {
          won = won || Boolean(combination.won);
          message = combination.message;
        } else {
          message = world.messages.noCombination;
        }
      }
    };

    function perform(sentence) {
      if (!(sentence instanceof Sentence)) return false;
      const verb = world.verbs[sentence.verbId];
      if (!verb) return false;
      const pattern = verb.patterns.find(candidate =>
        candidate.nounKinds.length === sentence.nouns.length &&
        candidate.nounKinds.every((kind, index) => kind === sentence.nouns[index].kind)
      );
      if (!pattern) return false;

      const nouns = sentence.nouns.map(noun => findNoun(noun.id));
      const handler = actionHandlers[pattern.action];
      if (!Object.hasOwn(actionHandlers, pattern.action) || nouns.some(noun => !noun)) return false;

      handler(...nouns);
      return true;
    }

    return { getState, perform, verbs: world.verbs };
  }

  global.AdventureGame = { createGame, Noun, Sentence };
})(globalThis);
