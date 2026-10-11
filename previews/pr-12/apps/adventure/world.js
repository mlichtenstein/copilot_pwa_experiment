globalThis.AdventureWorld = {
  startRoom: "kitchen",
  rooms: {
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
  },
  items: {
    coke: {
      label: "Diet Coke",
      description: "A sealed bottle of Diet Coke. It looks like it could make a spectacular fountain."
    },
    mentos: {
      label: "Mentos",
      description: "A roll of Mentos. They might make an interesting combination with Diet Coke."
    }
  },
  verbs: {
    examine: { label: "Look at", nounCount: 1, action: "examine" },
    take: { label: "Take", nounCount: 1, action: "take" },
    go: { label: "Go through", nounCount: 1, action: "go" },
    use: { label: "Use", nounCount: 2, action: "combine" }
  },
  combinations: [
    {
      items: ["coke", "mentos"],
      requiresInventory: ["coke", "mentos"],
      message: "You drop the Mentos into the Diet Coke. A fizzy fountain erupts! You solved the adventure.",
      won: true
    }
  ],
  messages: {
    initial: "Choose a verb, then choose an object to begin.",
    noCombination: "Those two things don't seem to work together."
  }
};
