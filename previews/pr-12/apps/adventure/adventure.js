(function (global) {
  const rooms = {
    kitchen: {
      name: "Kitchen",
      description: "A sunny kitchen. A can of Diet Coke rests on the counter.",
      objects: ["coke"],
      exits: [{ id: "door-to-lounge", label: "Door to the lounge", destination: "lounge" }]
    },
    lounge: {
      name: "Lounge",
      description: "A quiet lounge. A packet of Mentos sits on the coffee table.",
      objects: ["mentos"],
      exits: [
        { id: "door-to-kitchen", label: "Door to the kitchen", destination: "kitchen" },
        { id: "door-to-garden", label: "Door to the garden", destination: "garden" }
      ]
    },
    garden: {
      name: "Garden",
      description: "A small garden with plenty of room for an experiment.",
      objects: [],
      exits: [{ id: "door-to-lounge", label: "Door to the lounge", destination: "lounge" }]
    }
  };
  const items = {
    coke: {
      label: "Diet Coke",
      description: "A sealed bottle of Diet Coke. It looks like it could make a spectacular fountain."
    },
    mentos: {
      label: "Mentos",
      description: "A roll of Mentos. They might make an interesting combination with Diet Coke."
    }
  };
  const verbs = {
    examine: { label: "Look at", nouns: 1 },
    take: { label: "Take", nouns: 1 },
    go: { label: "Go through", nouns: 1 },
    use: { label: "Use", nouns: 2 }
  };

  function createGame() {
    let roomId = "kitchen";
    const inventory = new Set();
    let message = "Choose a verb, then choose an object to begin.";
    let won = false;

    function roomObjects() {
      const room = rooms[roomId];
      return [
        ...room.objects.filter(id => !inventory.has(id)).map(id => ({ id, ...items[id] })),
        ...room.exits.map(exit => ({ ...exit, description: `This leads to the ${rooms[exit.destination].name}.` }))
      ];
    }

    function getState() {
      return {
        roomId,
        room: { ...rooms[roomId] },
        objects: roomObjects(),
        inventory: [...inventory].map(id => ({ id, ...items[id] })),
        message,
        won
      };
    }

    function perform(verb, firstId, secondId) {
      const action = verbs[verb];
      if (!action || !firstId || (action.nouns === 2 && !secondId)) return false;

      const visible = roomObjects();
      const first = visible.find(object => object.id === firstId) || getState().inventory.find(object => object.id === firstId);
      const second = secondId && (
        visible.find(object => object.id === secondId) || getState().inventory.find(object => object.id === secondId)
      );
      if (!first || (action.nouns === 2 && !second)) return false;

      if (verb === "examine") {
        message = first.description;
      } else if (verb === "take") {
        if (!rooms[roomId].objects.includes(firstId) || inventory.has(firstId)) {
          message = `You can't take ${first.label}.`;
        } else {
          inventory.add(firstId);
          message = `You put ${first.label} in your inventory.`;
        }
      } else if (verb === "go") {
        const exit = rooms[roomId].exits.find(option => option.id === firstId);
        if (!exit) {
          message = `${first.label} doesn't lead anywhere.`;
        } else {
          roomId = exit.destination;
          message = `You enter the ${rooms[roomId].name.toLowerCase()}.`;
        }
      } else if (verb === "use") {
        if (inventory.has("coke") && inventory.has("mentos") &&
            ((firstId === "coke" && secondId === "mentos") || (firstId === "mentos" && secondId === "coke"))) {
          won = true;
          message = "You drop the Mentos into the Diet Coke. A fizzy fountain erupts! You solved the adventure.";
        } else {
          message = `Those two things don't seem to work together.`;
        }
      }
      return true;
    }

    return { getState, perform, verbs };
  }

  global.AdventureGame = { createGame };
})(globalThis);
