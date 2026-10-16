<!--
  Dependencies: game-engine.js, world.js, adventure-ui.js, and index.html.
  Consumers: contributors extending the engine or authoring another adventure world.
-->
# Text Adventure Engine

This folder contains both a reusable text-adventure engine and the world data
for **Fizz & Fortune**. The engine handles sentences, game state, and common
actions. A game's world file supplies the rooms, items, verbs, and puzzle rules.
That separation lets a future game provide different world data without
rewriting the engine.

## How a turn works

1. The UI displays the current room, its visible objects and exits, the
   inventory, and available verbs.
2. The player selects a verb and one or more nouns. Each noun has an ID, a kind
   (such as `item` or `exit`), and a display label.
3. The UI builds an `AdventureGame.Sentence`. The engine looks up that verb's
   patterns and checks that the sentence has the required noun kinds in order.
4. As soon as the selected nouns complete a valid sentence, the UI performs it.
   The matching action handler changes the current room, inventory, flags, or
   message. For combinations, the world data specifies reusable effects.
5. The UI calls `getState()` and renders the updated game, adding the player's
   command and the game's response to the scrollable transcript.

For example, the Fizz & Fortune world lets `Use` accept either one `exit` noun
to travel, or two `item` nouns to attempt a combination. The door's destination
room ID is where the engine moves the player when that exit is used.

## Fizz & Fortune puzzles

- Diet Coke (kitchen) + Mentos (lounge) makes a fizzy fountain and wins.
- Alchemy manual (study, via the lounge) + Lead (garden) produces Gold. Both can
  be in the room or carried. The
  lead is consumed and the manual is kept. Gold is defined as an item that
  starts `"nowhere"` and is given with `moveItem` to `"inventory"`.

## Files

- `game-engine.js` defines `Noun`, `Sentence`, and `createGame(world)`, along
  with the reusable game-state and action rules.
- `world.js` describes the Fizz & Fortune rooms, items, verbs, and combination
  rules.
- `adventure-ui.js` turns button selections into sentences, automatically
  performs complete sentences, displays the returned state, and keeps an
  oldest-first transcript of commands and responses.
- `index.html` provides the page structure and loads the world, engine, and UI
  in that order.

The app can be opened directly at `index.html`; no build step or dependencies
are required.

## Creating another game

Create another world object following this schema, then load it before
`game-engine.js` and call `AdventureGame.createGame(yourWorld)`.

```js
const world = {
  startRoom: "study",
  wonFlag: "caseSolved",
  initialFlags: { clueFound: false },
  rooms: {
    study: {
      name: "Study",
      description: "A quiet room.",
      objects: ["key", "note"],
      exits: [
        { id: "hall-door", label: "Door to the hall", destination: "hall",
          requiresFlags: { caseSolved: true } }
      ]
    },
    hall: { name: "Hall", description: "A long hall.", objects: [], exits: [] }
  },
  items: {
    key: { label: "Key", description: "A small brass key." },
    note: { label: "Note", description: "A note with a clue." }
  },
  verbs: {
    look: {
      label: "Look at",
      patterns: [{ nounKinds: ["item"], action: "examine" }]
    },
    take: {
      label: "Take",
      patterns: [{ nounKinds: ["item"], action: "take" }]
    },
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
      items: ["key", "note"],
      requiresInventory: ["key"],
      requiresFlags: { clueFound: false },
      effects: [
        { type: "setFlag", name: "clueFound", value: true },
        { type: "showMessage", text: "The note reveals a clue." }
      ]
    },
    {
      items: ["key", "note"],
      requiresInventory: ["key"],
      requiresFlags: { clueFound: true },
      effects: [
        { type: "setFlag", name: "caseSolved", value: true },
        { type: "showMessage", text: "You solved the case." }
      ]
    }
  ],
  messages: {
    initial: "Choose a verb to begin.",
    noCombination: "Those things don't work together."
  }
};
```

The example is illustrative; define only the rooms, items, and rules needed by
your game. Room `objects` lists the item IDs initially in each room. Items can
be moved by effects to `"inventory"`, `"nowhere"`, or a room ID. Exits are
available in their room unless their optional `requiresFlags` don't match the
session's current flags.

### Verb patterns and actions

Each verb has a UI `label` and a list of legal `patterns`. A pattern lists the
required noun `kind`s in order and the engine action to run. The current engine
actions are:

- `examine`: display the selected noun's description.
- `take`: move an item in the current room into the player's inventory.
- `useExit`: travel through a selected exit.
- `combine`: look for a matching item pair in `combinations`.

Use the actions supported by the engine. Adding a brand-new behavior requires
adding one reusable action handler to `game-engine.js`; games can then use it
in any of their verb patterns.

### Combinations and effects

A combination matches the two item IDs in either order. Optional
`requiresInventory` and `requiresFlags` conditions restrict when it matches.
Its `effects` run in order; the provided effect types are:

- `{ type: "setFlag", name, value }` changes story state.
- `{ type: "moveItem", item, to }` relocates an item to a room, `"inventory"`,
  or `"nowhere"` (removes it from play).
- `{ type: "showMessage", text }` sets the message shown by the UI.

Compose these effects for different puzzle outcomes instead of writing
combination-specific logic in the engine. `wonFlag` names the flag exposed as
`state.won`; it defaults to `"won"`.

## Using the engine from a UI

The engine is independent of the DOM. A UI creates nouns and sentences, then
submits them:

```js
const game = AdventureGame.createGame(world);
const item = new AdventureGame.Noun("key", "item", "Key");
const sentence = new AdventureGame.Sentence("take", [item]);

if (game.perform(sentence)) {
  const state = game.getState();
  // Render state.room, state.objects, state.inventory, state.message, etc.
}
```

`perform()` returns `false` when a sentence has an unknown verb, invalid noun
pattern, or nouns that are not visible or carried. `getState()` returns the
current room, visible nouns, inventory, flags, message, and win state.
