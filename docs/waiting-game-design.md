# Narrative Deck-Builder — Hello World Technical Design Document

Version: 0.1 | Status: Proposed | Target: Existing GitHub Pages PWA | Implementation: TypeScript | Narrative engine: Custom minimal storylet system

> Note: the source issue text was truncated partway through section 4.1 (Game State). Sections 4.1 onward must be filled in from the original document.

## 1. Project Overview

### 1.1 Concept

A small, playable prototype of a narrative-driven deck-building game. The player is a waiter at a restaurant. Each day they select an outfit, go to work, interact with customers using conversational strategy cards, earn tips, and return home.

Three systems:

1. **Repeating gameplay loop** — each day follows a predictable structure, but customers and encounters can vary.
2. **Conversational deck-builder** — cards represent conversational strategies such as Sass, Flirt, and Empathize.
3. **Modular narrative system** — playing cards reveals authored dialogue selected by game state, character traits, and narrative history.

The long-term vision is a nonlinear narrative game inspired by Hades, where characters have evolving story arcs across repeated sessions. The prototype should establish the architecture for that.

### 1.2 Primary Goal

Demonstrate that a player can use a conversational strategy card to trigger context-sensitive dialogue, change game state, and influence an encounter on a subsequent day. It should be genuinely playable, but need not be entertaining or polished. The goal is to validate the architecture.

### 1.3 Non-Goals

- A sophisticated graphical interface
- Animations or sound
- A full deck-building progression system
- A large inventory or equipment system
- A complete restaurant simulation
- Procedurally generated or AI-generated dialogue
- A dedicated narrative scripting language such as Yarn or Ink
- Complex character relationships
- A sophisticated encounter scheduling algorithm

## 2. Technology and Architecture

### 2.1 Platform

The game runs inside the existing PWA repository and deployment workflow, using TypeScript and the repository's existing frontend framework, build system, and testing tools wherever practical. Do not introduce Godot, Ren'Py, or another standalone engine. Do not replace the existing PWA infrastructure. It must remain compatible with static hosting on GitHub Pages.

### 2.2 Architecture

```
                  GAME UI
                     |
                     v
               GAME CONTROLLER
                     |
         +-----------+-----------+
         |           |           |
         v           v           v
     GAME STATE   CARD ENGINE  NARRATIVE
                               ENGINE
         |           |           |
         +-----------+-----------+
                     |
                     v
                 GAME STATE
```

- **Game State** — current state of the player, customers, restaurant, and narrative history.
- **Game Controller** — manages the daily loop, phase transitions, and player actions.
- **Card Engine** — determines the mechanical outcome of playing conversational strategy cards.
- **Narrative Engine** — selects an authored dialogue exchange based on the action, its outcome, and the current game state.

The game rules must not depend on the UI framework. This separation is a fundamental architectural requirement.

## 3. The Daily Gameplay Loop

### 3.1 Phases

```
APARTMENT --Choose outfit--> START SHIFT --Generate customers--> WORK
WORK --Play cards, complete encounters--> END SHIFT
END SHIFT --Calculate tips, advance day--> APARTMENT
```

Each phase corresponds to a simple UI screen.

### 3.2 Apartment Phase

Display the current day number, total money, available outfits, and a "Go to Work" button.

Two outfits for the prototype:

- **Work Uniform** — tags: "professional", "formal"
- **Casual Outfit** — tags: "casual", "stylish"

The selected outfit becomes part of the player's game state and may influence dialogue selection and card effectiveness. No inventory UI or equipment management yet.

### 3.3 Start Shift

When the player selects "Go to Work":

1. Create a new shift.
2. Select customers for the shift.
3. Initialize their temporary encounter state.
4. Transition to the Work phase.

Each shift has two customer encounters. At least one is a recurring named character; the second may come from a small predefined pool. Customer selection is a separate function, not hardcoded in the UI.

### 3.4 Work Phase

Display the current customer and the player's available conversational cards. When the player selects a card, the game:

1. Evaluates the card against the current customer.
2. Determines a mechanical outcome.
3. Selects an eligible dialogue exchange.
4. Displays the dialogue.
5. Applies the resulting state changes.
6. Updates the encounter.

Each encounter consists of two card plays. After the second, the encounter ends, the player receives a tip, and the game advances to the next customer.

### 3.5 End Shift

After both encounters, display tips from each customer, total tips, and the updated money balance. A "Go Home" button advances the day number and returns to the Apartment phase. Persistent character relationships and narrative history must survive this transition.

## 4. Game State

### 4.1 State Structure

Use a single canonical game-state object. Conceptually:

```ts
interface GameState {
    day: number;

    player: PlayerState;

    customers: Record<...>  // truncated in source issue
}
```

_(Remainder of the document was truncated in the source issue.)_
