(function (global) {
  function createGame(world) {
    let roomId = world.startRoom;
    const inventory = new Set();
    let message = world.messages.initial;
    let won = false;

    function roomObjects() {
      const room = world.rooms[roomId];
      return [
        ...room.objects.filter(id => !inventory.has(id)).map(id => ({ id, ...world.items[id] })),
        ...room.exits.map(exit => ({
          ...exit,
          description: `This leads to the ${world.rooms[exit.destination].name}.`
        }))
      ];
    }

    function getState() {
      return {
        roomId,
        room: { ...world.rooms[roomId] },
        objects: roomObjects(),
        inventory: [...inventory].map(id => ({ id, ...world.items[id] })),
        message,
        won
      };
    }

    function perform(verbId, firstId, secondId) {
      const verb = world.verbs[verbId];
      if (!verb || !firstId || (verb.nouns === 2 && !secondId)) return false;

      const objects = roomObjects();
      const carried = getState().inventory;
      const first = objects.find(object => object.id === firstId) || carried.find(object => object.id === firstId);
      const second = secondId && (
        objects.find(object => object.id === secondId) || carried.find(object => object.id === secondId)
      );
      if (!first || (verb.nouns === 2 && !second)) return false;

      if (verb.action === "examine") {
        message = first.description;
      } else if (verb.action === "take") {
        if (!world.rooms[roomId].objects.includes(firstId) || inventory.has(firstId)) {
          message = `You can't take ${first.label}.`;
        } else {
          inventory.add(firstId);
          message = `You put ${first.label} in your inventory.`;
        }
      } else if (verb.action === "go") {
        const exit = world.rooms[roomId].exits.find(option => option.id === firstId);
        if (!exit) {
          message = `${first.label} doesn't lead anywhere.`;
        } else {
          roomId = exit.destination;
          message = `You enter the ${world.rooms[roomId].name.toLowerCase()}.`;
        }
      } else if (verb.action === "combine") {
        const combination = world.combinations.find(option =>
          (option.items[0] === firstId && option.items[1] === secondId) ||
          (option.items[0] === secondId && option.items[1] === firstId)
        );
        if (combination && (!combination.requiresInventory ||
            combination.requiresInventory.every(id => inventory.has(id)))) {
          won = won || Boolean(combination.won);
          message = combination.message;
        } else {
          message = world.messages.noCombination;
        }
      }
      return true;
    }

    return { getState, perform, verbs: world.verbs };
  }

  global.AdventureGame = { createGame };
})(globalThis);
