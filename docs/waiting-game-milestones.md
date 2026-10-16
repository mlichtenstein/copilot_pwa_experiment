# Waiting Game — Milestones and Issues

One GitHub milestone per milestone in section 15 of [waiting-game-design.md](waiting-game-design.md), each with one issue. Implement in order.

## M1: Game State and Daily Loop
Design sections: 2, 3, 4, 12, 15.
Implement initial game state, apartment phase, outfit selection, shift creation, encounter progression, end shift, day advancement. Placeholder customer interactions. Game logic separate from UI.
**Acceptance:** the player can complete two days.

## M2: Conversational Cards
Design sections: 5, 6, 9.
Three card definitions, card selection UI, deterministic card resolution, mood and relationship changes, tip calculation.
**Acceptance:** different cards and outfits produce different mechanical outcomes.

## M3: Narrative Exchanges
Design section: 7.
Exchange definitions, condition evaluation, exchange selection, dialogue display, narrative effects, generic fallback dialogue.
**Acceptance:** playing a card reveals appropriate authored dialogue.

## M4: Persistent Story Progression
Design sections: 8, 13.
Maria's two-part arc, persistent narrative flags, exchange history, cross-day progression.
**Acceptance:** a conversation on Day 1 changes the dialogue available on Day 2.

## M5: Tests and Deployment
Design sections: 10, 11, 16.
Unit and integration tests, basic mobile layout, production build validation, deploy via the existing GitHub Pages workflow.
**Acceptance:** playable in the deployed PWA and all automated tests pass.
