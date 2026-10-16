Narrative Deck-Builder

Hello World — Technical Design Document

Version: 0.1
Status: Proposed
Target: Existing GitHub Pages PWA
Implementation: TypeScript
Narrative engine: Custom minimal storylet system

---

1. Project Overview

1.1 Concept

Build a small, playable prototype of a narrative-driven deck-building game.

The player works as a waiter at a restaurant. Each day, they select an outfit, go to work, interact with customers using conversational strategy cards, earn tips, and return home.

The game combines three systems:

1. A repeating gameplay loop: Each day follows a predictable structure, but the customers and encounters can vary.
2. A conversational deck-builder: The player uses cards representing conversational strategies, such as Sass, Flirt, and Empathize.
3. A modular narrative system: Playing cards reveals authored dialogue selected according to game state, character traits, and narrative history.

The long-term vision is a nonlinear narrative game inspired by the structure of Hades, where individual characters have evolving story arcs that progress across repeated gameplay sessions.

This prototype should establish the architecture necessary for that vision.

1.2 Primary Goal

Demonstrate that a player can use a conversational strategy card to trigger context-sensitive dialogue, change game state, and influence an encounter on a subsequent day.

The prototype should be genuinely playable, but does not need to be particularly entertaining or polished.

The goal is to validate the underlying architecture.

1.3 Non-Goals

The initial implementation does not require:

- A sophisticated graphical interface.
- Animations or sound.
- A full deck-building progression system.
- A large inventory or equipment system.
- A complete restaurant simulation.
- Procedurally generated dialogue.
- AI-generated dialogue.
- A dedicated narrative scripting language such as Yarn or Ink.
- Complex character relationships.
- A sophisticated encounter scheduling algorithm.

These may be added later.

---

2. Technology and Architecture

2.1 Platform

The game must run inside the existing PWA repository and deployment workflow.

Implementation should use TypeScript and the repository's existing frontend framework, build system, and testing tools wherever practical.

Do not introduce Godot, Ren'Py, or another standalone game engine.

Do not replace the existing PWA infrastructure.

The application must remain compatible with static hosting on GitHub Pages.

2.2 Architecture

The game should separate its logic into four major components.

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

Game State

Stores the current state of the player, customers, restaurant, and narrative history.

Game Controller

Manages the daily loop, phase transitions, and player actions.

Card Engine

Determines the mechanical outcome of playing conversational strategy cards.

Narrative Engine

Selects an appropriate authored dialogue exchange based on the action, its outcome, and the current game state.

The game rules must not depend on the UI framework.

This separation is a fundamental architectural requirement.

---

3. The Daily Gameplay Loop

3.1 Phases

The game has four phases.

APARTMENT
    |
    | Choose outfit
    v
START SHIFT
    |
    | Generate customers
    v
WORK
    |
    | Play conversational cards
    | Complete customer encounters
    v
END SHIFT
    |
    | Calculate tips
    | Advance day
    v
APARTMENT

Each phase corresponds to a simple UI screen.

3.2 Apartment Phase

The player begins in their apartment.

Display:

- Current day number.
- Total money.
- Available outfits.
- A button labeled "Go to Work."

For the prototype, provide two outfits:

Work Uniform

- Tags: "professional", "formal"

Casual Outfit

- Tags: "casual", "stylish"

The selected outfit becomes part of the player's game state.

Outfit tags may influence dialogue selection and card effectiveness.

There is no need for an inventory UI or equipment management system yet.

3.3 Start Shift

When the player selects "Go to Work":

1. Create a new shift.
2. Select customers for the shift.
3. Initialize their temporary encounter state.
4. Transition to the Work phase.

For the prototype, each shift contains two customer encounters.

At least one customer should be a recurring named character.

The second customer may be selected from a small predefined pool.

Customer selection should be performed by a separate function rather than hardcoded directly into the UI.

3.4 Work Phase

Display the current customer and the player's available conversational cards.

The player selects a card.

The game:

1. Evaluates the card against the current customer.
2. Determines a mechanical outcome.
3. Selects an eligible dialogue exchange.
4. Displays the dialogue.
5. Applies the resulting state changes.
6. Updates the encounter.

For the prototype, each customer encounter consists of two card plays.

After the second card, the encounter ends and the player receives a tip.

The game then advances to the next customer.

3.5 End Shift

After both customer encounters:

Display:

- Tips earned from each customer.
- Total tips earned.
- Updated money balance.

Provide a button labeled "Go Home."

Selecting it advances the day number and returns the player to the Apartment phase.

Persistent character relationships and narrative history must survive this transition.

---

4. Game State

4.1 State Structure

Use a single canonical game-state object.

Conceptually:

interface GameState {
    day: number;

    player: PlayerState;

    customers: Record<string, CustomerState>;

    narrative: NarrativeState;

    currentShift: ShiftState | null;

    phase: GamePhase;
}

4.2 Player State

interface PlayerState {
    money: number;

    outfit: string;

    skills: {
        sass: number;
        empathy: number;
        flirting: number;
    };
}

Initial values:

const initialPlayer = {
    money: 0,

    outfit: "uniform",

    skills: {
        sass: 1,
        empathy: 1,
        flirting: 1
    }
};

The skill system should be extensible, but no skill advancement is required in the first implementation.

4.3 Customer State

Customers have two categories of state.

Persistent State

Information that survives between shifts:

interface CustomerState {
    id: string;

    relationship: number;

    encounters: number;

    traits: {
        humor: number;
        empathy: number;
        flirting: number;
    };
}

The "traits" object describes how receptive the customer is to different conversational strategies.

For the prototype, trait values range from 0 to 5.

Relationship values may range from -10 to +10.

Encounter State

Temporary information associated with the current visit:

interface CustomerEncounter {
    customerId: string;

    mood: number;
    patience: number;

    cardsPlayed: number;

    completed: boolean;

    tip: number;
}

Temporary encounter state resets when the customer returns on a later day.

Persistent customer state does not.

4.4 Narrative State

Narrative history should be represented separately from simulation state.

interface NarrativeState {
    flags: Record<string, boolean>;

    seenExchanges: string[];
}

Examples:

flags: {
    "maria.met": true,
    "maria.discussed_work": false,
    "maria.shared_secret": false
}

For the initial prototype, a simple flag dictionary is sufficient.

However, the architecture should not assume that all future narrative conditions will be Boolean flags.

Narrative conditions must eventually be able to inspect arbitrary game state.

---

5. Conversational Cards

5.1 Design Principle

Cards represent conversational strategies, not specific lines of dialogue.

The player selects how they want to interact.

The game determines what their character actually says.

This distinction is essential.

A Sass card should not always produce the same dialogue.

Its effects and dialogue should depend on the customer, the situation, and the game's history.

5.2 Initial Cards

Implement three cards.

Sass

A humorous or irreverent conversational strategy.

Potentially effective with customers who appreciate humor.

Potentially irritating to customers who dislike sarcasm.

Empathize

A supportive conversational strategy.

Effective with customers who appreciate kindness or emotional attention.

Flirt

A playful or romantic conversational strategy.

Effectiveness depends on customer traits and relationship state.

All three cards should always be available during the prototype.

There is no need to implement drawing, shuffling, discarding, or deck construction yet.

5.3 Card Definition

interface ConversationCard {
    id: string;

    name: string;

    description: string;

    strategy: string;
}

Cards should be defined as data rather than embedded in UI components.

For example:

const cards: ConversationCard[] = [
    {
        id: "sass",
        name: "Sass",
        description: "Try some irreverent humor.",
        strategy: "sass"
    },
    {
        id: "empathize",
        name: "Empathize",
        description: "Offer understanding and support.",
        strategy: "empathy"
    },
    {
        id: "flirt",
        name: "Flirt",
        description: "Make a playful romantic advance.",
        strategy: "flirting"
    }
];

---

6. Card Resolution

6.1 Resolution Function

Implement a pure function:

function resolveCard(
    card: ConversationCard,
    player: PlayerState,
    customer: CustomerState,
    encounter: CustomerEncounter
): CardResult

The function must not directly modify its arguments.

It returns a result describing the mechanical outcome.

6.2 Card Result

interface CardResult {
    strategy: string;

    outcome: "success" | "failure";

    moodChange: number;

    relationshipChange: number;
}

6.3 Initial Resolution Rules

For the prototype, use a simple deterministic system.

Calculate:

score =
    player skill
    + customer preference
    + outfit modifier

A score of 4 or greater succeeds.

Otherwise, the card fails.

Outfit modifiers:

- Work Uniform: +1 to Empathize.
- Casual Outfit: +1 to Flirt.
- No outfit modifier for Sass.

Successful cards:

- Mood +2.
- Relationship +1.

Failed cards:

- Mood -1.
- Relationship -1.

These numbers are placeholders, not final game balance.

The important requirement is that different player and customer states produce different results.

6.4 Randomness

Do not introduce randomness into card resolution yet.

Deterministic resolution makes the initial system easier to test.

Randomized encounters and dialogue selection may be introduced independently.

When randomness is added, it should use an injectable random-number source so tests can reproduce outcomes.

---

7. Modular Narrative System

This is the most important subsystem to validate.

7.1 Design Principle

Narrative exchanges are small, independently authored pieces of dialogue.

They are not necessarily arranged in a single branching tree.

Each exchange defines:

- When it is eligible.
- Which conversational strategy it responds to.
- Which mechanical outcome it represents.
- The dialogue to display.
- Any additional narrative effects.

The narrative engine selects an appropriate exchange after a card is played.

7.2 Exchange Definition

interface NarrativeExchange {
    id: string;

    strategy: string;

    outcome: "success" | "failure";

    customerId?: string;

    priority: number;

    conditions: Condition[];

    lines: DialogueLine[];

    effects: NarrativeEffect[];
}

The "customerId" field is optional.

Exchanges without a customer ID can serve as generic fallback dialogue.

7.3 Dialogue Lines

interface DialogueLine {
    speaker: string;
    text: string;
}

For example:

lines: [
    {
        speaker: "Player",
        text: "Rough day?"
    },
    {
        speaker: "Maria",
        text: "You have no idea."
    }
]

The player should see the dialogue only after playing the card.

7.4 Conditions

Conditions determine whether an exchange is eligible.

Use a small, declarative condition system rather than embedding arbitrary JavaScript functions inside narrative data.

For example:

type Condition =
    | {
        type: "flag";
        key: string;
        value: boolean;
    }
    | {
        type: "relationship_min";
        customerId: string;
        value: number;
    }
    | {
        type: "day_min";
        value: number;
    };

Implement:

function evaluateCondition(
    condition: Condition,
    state: GameState
): boolean

All conditions must be satisfied for an exchange to become eligible.

This system should be easy to extend with new condition types.

7.5 Narrative Effects

Narrative effects modify persistent narrative state.

For the prototype:

type NarrativeEffect = {
    type: "set_flag";
    key: string;
    value: boolean;
};

For example:

{
    type: "set_flag",
    key: "maria.discussed_work",
    value: true
}

Narrative effects should be applied by the game controller, not directly by the UI.

7.6 Exchange Selection

Implement:

function selectExchange(
    state: GameState,
    customerId: string,
    cardResult: CardResult,
    exchanges: NarrativeExchange[]
): NarrativeExchange

The selection algorithm:

1. Filter exchanges by conversational strategy.
2. Filter by mechanical outcome.
3. Filter by customer ID, allowing generic exchanges.
4. Remove exchanges whose conditions are not satisfied.
5. Remove previously seen exchanges, unless explicitly marked repeatable.
6. Select the eligible exchange with the highest priority.

Use a stable, deterministic tie-breaking rule.

The initial implementation does not require weighted random selection.

7.7 Fallback Dialogue

Every card/outcome combination must have a generic fallback exchange.

Fallback exchanges should be repeatable.

This ensures that the player can always receive dialogue, even when no special narrative content is eligible.

7.8 Narrative Selection Must Not Control Card Resolution

The mechanical result is determined first.

The narrative engine then selects dialogue appropriate to that result.

This separation must be preserved.

For example:

Player plays Sass
        |
        v
Card Engine
        |
        v
Success
        |
        v
Narrative Engine
        |
        +-- Generic Sass success
        |
        +-- Maria-specific Sass success
        |
        +-- Special story exchange
        |
        v
Selected dialogue

The narrative engine may apply additional narrative effects, but it should not independently recalculate the card's mechanical outcome.

---

8. Example: Maria's Story

Implement one recurring character with a small narrative arc.

8.1 Character

Maria

Traits:

{
    humor: 4,
    empathy: 3,
    flirting: 1
}

Initial relationship: 0.

Maria is having difficulties at work.

The player can gradually learn about her situation through ordinary interactions.

8.2 First Encounter

When the player first meets Maria, she has a generic greeting.

If the player successfully uses Empathize, an eligible exchange reveals that she has had a difficult day.

Example:

Player: "You look like you've had a long day."

Maria: "That's one way to describe it. My boss has been driving me crazy."

The exchange sets:

maria.discussed_work = true

8.3 Subsequent Encounter

On a later day, if:

maria.discussed_work == true

and the player successfully uses Sass, a new exchange becomes eligible.

Example:

Player: "So, have you overthrown your terrible boss yet?"

Maria: "Not yet. But I've started drafting my resignation letter."

The exchange sets:

maria.considering_quitting = true

This demonstrates narrative progression across repeated shifts.

The player never explicitly selects "Advance Maria's Story."

They play ordinary conversational cards.

The evolving narrative state determines which dialogue becomes available.

8.4 Important Test

The second exchange must not appear unless the first exchange has occurred.

It must remain eligible on later days once its prerequisites are satisfied, until it is played.

This is the central narrative-system acceptance test.

---

9. Tips and Rewards

Tips provide immediate mechanical feedback.

For the prototype, calculate:

tip = max(0, 5 + final mood)

Each customer begins with mood 0.

A successful card increases mood by 2.

A failed card decreases mood by 1.

At the end of the encounter, calculate the tip.

Add the tip to the player's money.

The formula is intentionally simple.

It is only intended to demonstrate that conversational strategies have mechanical consequences.

Narrative progression must remain possible even when a card produces a negative mechanical result.

---

10. User Interface

10.1 Design Goals

The interface should be functional, readable, and mobile-friendly.

Use the existing PWA's visual conventions where practical.

Avoid elaborate styling.

10.2 Apartment Screen

Example:

+----------------------------+
| DAY 1                      |
|                            |
| YOUR APARTMENT             |
|                            |
| Money: $0                  |
|                            |
| Choose your outfit:        |
|                            |
| [ Work Uniform ]           |
| [ Casual Outfit ]          |
|                            |
| [ GO TO WORK ]             |
+----------------------------+

10.3 Customer Encounter Screen

Example:

+----------------------------+
| DAY 1 - RESTAURANT         |
|                            |
| TABLE 4                    |
| Maria                      |
|                            |
| Mood: 0                    |
| Relationship: 0            |
|                            |
| Maria looks tired.         |
|                            |
| Choose your approach:      |
|                            |
| [ SASS ]                   |
| [ EMPATHIZE ]              |
| [ FLIRT ]                  |
+----------------------------+

After selecting a card:

+----------------------------+
| EMPATHIZE                  |
|                            |
| SUCCESS                    |
|                            |
| You: "Rough day?"          |
|                            |
| Maria: "You have no idea." |
|                            |
| Mood +2                    |
| Relationship +1            |
|                            |
| [ CONTINUE ]               |
+----------------------------+

The dialogue should be presented before the mechanical result summary, emphasizing the narrative reveal.

10.4 End Shift Screen

Example:

+----------------------------+
| SHIFT COMPLETE             |
|                            |
| Maria:       $9            |
| Other table: $7            |
|                            |
| Total tips:  $16           |
|                            |
| Money:       $16           |
|                            |
| [ GO HOME ]                |
+----------------------------+

---

11. Testing Requirements

All core game logic must be independently unit-testable.

The tests should run using the repository's existing test infrastructure.

11.1 Game Loop Tests

Verify:

- The game begins in the Apartment phase.
- Going to work creates a shift.
- A shift contains two customer encounters.
- Completing both encounters transitions to End Shift.
- Going home increments the day.
- Money persists between days.
- Relationships persist between days.
- Temporary encounter state resets appropriately.

11.2 Card Tests

Verify:

- Card resolution is deterministic.
- Customer traits affect outcomes.
- Player skills affect outcomes.
- Outfit modifiers affect outcomes.
- Successful cards improve mood.
- Failed cards reduce mood.
- Card resolution does not mutate its inputs.

11.3 Narrative Tests

Verify:

- Exchanges are filtered by strategy.
- Exchanges are filtered by outcome.
- Exchanges are filtered by customer.
- Conditions are evaluated correctly.
- Higher-priority eligible exchanges are preferred.
- Previously seen nonrepeatable exchanges are excluded.
- Generic fallback dialogue is available.
- Narrative effects correctly modify state.

11.4 Integration Test

Create an automated test covering this scenario:

1. Start Day 1.
2. Select Work Uniform.
3. Go to work.
4. Encounter Maria.
5. Play Empathize successfully.
6. Verify that the first Maria story exchange appears.
7. Complete the shift.
8. Return home.
9. Start Day 2.
10. Encounter Maria again.
11. Play Sass successfully.
12. Verify that the second Maria story exchange appears.

The test must confirm that Maria's story progressed because of the persistent state established on Day 1.

The test should use controlled customer selection to guarantee Maria appears on both days.

Also test the negative case: the second exchange must not appear if its prerequisite flag was never set.

---

12. Suggested Project Structure

Adapt this structure to the existing repository.

src/
  game/
    types.ts
    initialState.ts
    gameController.ts
    shiftGenerator.ts

  cards/
    cardDefinitions.ts
    cardResolver.ts

  narrative/
    types.ts
    conditionEvaluator.ts
    exchangeSelector.ts
    effectProcessor.ts

  content/
    customers.ts
    exchanges.ts

  ui/
    ApartmentScreen
    EncounterScreen
    EndShiftScreen

tests/
  gameLoop.test.ts
  cards.test.ts
  narrative.test.ts
  integration.test.ts

The precise filenames and directories are suggestions.

The separation between game mechanics, narrative selection, authored content, and UI is required.

---

13. Persistence

For the Hello World implementation, in-memory state is sufficient.

A page reload may restart the game.

However, game state must be serializable to JSON.

Avoid storing functions, class instances with complex prototypes, or browser-specific objects inside the canonical game state.

This will allow a future implementation to save and restore games using local storage or IndexedDB.

The game should distinguish persistent world state from temporary shift state.

---

14. Extensibility Requirements

The prototype should support future expansion without major architectural changes.

In particular:

New Cards

Adding a new conversational strategy should not require changes to the game controller or UI flow.

New Customers

Adding a customer should primarily involve defining character data and narrative exchanges.

New Exchanges

Adding a narrative exchange should not require modifying the narrative-selection algorithm.

New Conditions

The condition evaluator should support additional condition types.

New Narrative Engines

Narrative content should be separable from narrative selection.

This should make it possible to integrate Ink or Yarn later without rewriting the game mechanics.

More Complex Encounters

The two-card encounter limit is a prototype rule, not a fundamental architectural assumption.

Future encounters may have multiple rounds, resources, changing objectives, and dynamically available cards.

Deck Construction

The initial three-card selection UI should eventually be replaceable by a hand/deck/discard system without rewriting card resolution.

---

15. Implementation Plan

Milestone 1: Game State and Daily Loop

Implement:

- Initial game state.
- Apartment phase.
- Outfit selection.
- Shift creation.
- Encounter progression.
- End Shift.
- Day advancement.

Use placeholder customer interactions.

Acceptance: The player can complete two days.

Milestone 2: Conversational Cards

Implement:

- Three card definitions.
- Card selection UI.
- Deterministic card resolution.
- Customer mood and relationship changes.
- Tip calculation.

Acceptance: Different cards and outfits produce different mechanical outcomes.

Milestone 3: Narrative Exchanges

Implement:

- Narrative exchange definitions.
- Condition evaluation.
- Exchange selection.
- Dialogue display.
- Narrative effects.
- Generic fallback dialogue.

Acceptance: Playing a card reveals appropriate authored dialogue.

Milestone 4: Persistent Story Progression

Implement:

- Maria's two-part narrative arc.
- Persistent narrative flags.
- Exchange history.
- Cross-day story progression.

Acceptance: A conversation on Day 1 changes the dialogue available on Day 2.

Milestone 5: Tests and Deployment

Implement:

- Unit tests.
- Integration tests.
- Basic mobile layout.
- Production build validation.

Deploy through the existing GitHub Pages workflow.

Acceptance: The game is playable in the deployed PWA and all automated tests pass.

---

16. Definition of Done

The Hello World prototype is complete when:

1. The player can start in an apartment and select an outfit.
2. The player can begin a restaurant shift.
3. The shift contains two customer encounters.
4. The player can select from three conversational strategy cards.
5. Cards produce mechanical outcomes based on player and customer state.
6. Each card play reveals an appropriate authored dialogue exchange.
7. The player's decisions affect customer mood and tips.
8. Completing a shift returns the player home with earned money.
9. The player can begin another day.
10. A recurring customer's dialogue changes based on an earlier interaction.
11. Core mechanics and narrative selection have automated tests.
12. The game builds and deploys using the existing PWA workflow.

---

17. Guiding Design Principles

Mechanics determine outcomes; narrative reveals them.

The player selects a conversational strategy. The mechanical engine evaluates the action. The narrative engine reveals an appropriate authored exchange.

Narrative is modular, not globally linear.

Individual characters and situations may have their own progression, but the game does not require a single overarching branching story.

The game world has a canonical state.

Narrative systems read and modify the same game state used by the mechanical simulation.

Content is data.

Customers, cards, and narrative exchanges should be independently authored and added without changing engine logic.

The game loop is stable; encounters are variable.

Each day follows a predictable structure, but the situations and dialogue can evolve.

The first implementation should be small but architecturally honest.

Avoid building features that are not necessary to demonstrate the core interaction. At the same time, do not hardcode Maria's story progression or card behavior directly into UI components.

The prototype should demonstrate a reusable system, not merely a scripted sequence disguised as one.

---

18. Instructions for the Coding Agent

Implement this design incrementally in the existing PWA repository.

Before making changes:

1. Inspect the current application structure.
2. Identify the existing frontend framework, test runner, and deployment workflow.
3. Preserve existing functionality and conventions.
4. Identify any conflicts between this specification and the current architecture.

Do not introduce new major dependencies unless necessary.

Prefer straightforward TypeScript implementations.

Keep game logic separate from UI components.

Implement the milestones in order, with tests for each subsystem.

Do not add unrequested features such as AI dialogue generation, complex animations, deck shuffling, or inventory management.

The priority is a working, testable vertical slice demonstrating the complete loop:

Outfit → Work → Play Card → Reveal Dialogue → Update State → Earn Tips → Go Home → Return Customer → New Dialogue.