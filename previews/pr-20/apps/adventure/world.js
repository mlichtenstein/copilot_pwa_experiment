/*
 * Fizz & Fortune's world definition.
 * Dependencies: none; this file declares data consumed by game-engine.js.
 * Consumer: adventure-ui.js, which supplies this world to AdventureGame.
 *
 * To make another game, author a similar object and pass it to
 * AdventureGame.createGame(world). The engine expects:
 * - startRoom: the ID of the room where play begins.
 * - rooms: room IDs mapped to names/descriptions, item IDs, and exit records.
 *   An exit's `destination` is another room ID; Use on that exit moves there.
 *   Optional exit `requiresFlags` keep a doorway hidden until flags match.
 * - items: item IDs mapped to the labels and descriptions shown by the UI.
 * - verbs: button labels and allowed noun-kind patterns. Each pattern names
 *   an engine action; Use supports both one exit noun and two item nouns here.
 * - combinations: item pairs, optional inventory/flag requirements, and
 *   declarative effects to apply when a pair is used.
 * - initialFlags: optional starting values for story flags.
 * - messages: initial and fallback text; wonFlag names the success flag.
 *
 * A combination is one piece of game content, not a new engine code path.
 * Its effects can set flags, move items, and show text using the engine's
 * existing effect handlers. Add a new effect handler only when a game needs a
 * new kind of state change, then reuse it in as many world rules as needed.
 */
globalThis.AdventureWorld = {
  startRoom: "kitchen",
  wonFlag: "won",
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
        { id: "door-to-garden", label: "Door to the garden", destination: "garden" },
        { id: "door-to-study", label: "Door to the study", destination: "study" }
      ]
    },
    garden: {
      name: "Garden",
      description: "A small garden with plenty of room for an experiment. A dull lead ingot sits by the path.",
      objects: ["lead"],
      exits: [{ id: "door-to-lounge", label: "Door to the lounge", destination: "lounge" }]
    },
    study: {
      name: "Study",
      description: "A dusty study lined with books. An alchemy manual lies open on the desk.",
      objects: ["manual"],
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
    },
    manual: {
      label: "Alchemy manual",
      description: "A worn manual of alchemy. One chapter explains how to turn lead into gold."
    },
    lead: {
      label: "Lead",
      description: "A heavy, dull ingot of lead."
    },
    gold: {
      label: "Gold",
      description: "A gleaming ingot of pure gold."
    }
  },
  verbs: {
    examine: {
      label: "Look at",
      patterns: [{ nounKinds: ["item"], action: "examine" }, { nounKinds: ["exit"], action: "examine" }]
    },
    take: { label: "Take", patterns: [{ nounKinds: ["item"], action: "take" }] },
    use: {
      label: "Use",
      patterns: [
        { nounKinds: ["exit"], action: "useExit" },
        { nounKinds: ["item", "item"], action: "combine" }
      ]
    }
  },
  combinations: [
    {
      items: ["coke", "mentos"],
      requiresInventory: ["coke", "mentos"],
      effects: [
        { type: "moveItem", item: "mentos", to: "nowhere" },
        { type: "setFlag", name: "won", value: true },
        { type: "showMessage", text: "You drop the Mentos into the Diet Coke. A fizzy fountain erupts! You solved the adventure." }
      ]
    },
    {
      items: ["manual", "lead"],
      effects: [
        { type: "moveItem", item: "lead", to: "nowhere" },
        { type: "moveItem", item: "gold", to: "inventory" },
        { type: "showMessage", text: "Following the manual's instructions, you transmute the lead. It shimmers and becomes a gleaming ingot of gold!" }
      ]
    }
  ],
  messages: {
    initial: "Choose a verb, then choose an object to begin.",
    noCombination: "Those two things don't seem to work together."
  }
};
