/*
 * Browser UI for Fizz & Fortune.
 *
 * This file translates button presses into typed sentences and renders the
 * engine's state. It does not decide how actions change rooms or inventory;
 * game-engine.js owns those rules and world.js supplies their data.
 */
const game = AdventureGame.createGame(AdventureWorld);
// Keep references to the page elements so render() can update the same UI.
const roomName = document.querySelector("#room-name");
const roomDescription = document.querySelector("#room-description");
const roomObjects = document.querySelector("#room-objects");
const inventoryObjects = document.querySelector("#inventory-objects");
const message = document.querySelector("#message");
const sentence = document.querySelector("#sentence-action");
const verbButtons = [...document.querySelectorAll("[data-verb]")];
let selectedVerb = null;
let selectedNouns = [];
let sentenceComplete = false;

// The selected verb's patterns describe which noun kinds can follow it.
// For example, Use allows an exit or two items in the Fizz & Fortune world.
function sentencePatterns() {
  return game.verbs[selectedVerb]?.patterns ?? [];
}

// Update the sentence preview as the player chooses its parts. A complete
// sentence becomes a button; incomplete sentences remain disabled.
function updateSentence() {
  if (!selectedVerb) {
    sentence.replaceChildren(document.createTextNode("Choose a verb to make a sentence."));
    sentence.disabled = true;
    sentence.classList.remove("is-valid", "is-complete");
    return;
  }
  const selectedKinds = selectedNouns.map(noun => noun.kind);
  // Keep only patterns that still fit the nouns selected so far. A valid
  // complete pattern enables confirmation; a longer one shows the next slot.
  const matchingPatterns = sentencePatterns().filter(pattern =>
    selectedKinds.every((kind, index) => pattern.nounKinds[index] === kind)
  );
  const completePattern = matchingPatterns.find(pattern => pattern.nounKinds.length === selectedNouns.length);
  const complete = Boolean(completePattern);
  const pendingPattern = matchingPatterns
    .filter(pattern => pattern.nounKinds.length > selectedNouns.length)
    .sort((first, second) => second.nounKinds.length - first.nounKinds.length)[0];
  const displayPattern = completePattern || pendingPattern;
  const contents = [document.createTextNode(`${game.verbs[selectedVerb].label} `)];
  // Render noun labels as text nodes, not HTML, and show "with" between the
  // two nouns in a transitive sentence.
  selectedNouns.forEach((noun, index) => {
    if (index === 1 && displayPattern.nounKinds.length > 1) {
      const connector = document.createElement("span");
      connector.className = "sentence-connector";
      connector.textContent = " with ";
      contents.push(connector);
    } else if (index) {
      contents.push(document.createTextNode(" "));
    }
    contents.push(document.createTextNode(noun.label));
  });
  if (pendingPattern) {
    // Show placeholders for unselected objects. For a two-item Use sentence,
    // show a muted "with" before its second placeholder.
    if (!selectedNouns.length) contents.push(document.createTextNode("…"));
    if (pendingPattern.nounKinds.length > 1 && pendingPattern.nounKinds[1]) {
      const connector = document.createElement("span");
      connector.className = "sentence-connector";
      connector.textContent = " with ";
      contents.push(connector, document.createTextNode("…"));
    } else if (selectedNouns.length) {
      contents.push(document.createTextNode(" …"));
    }
  }
  sentence.replaceChildren(...contents);
  sentence.disabled = !complete || sentenceComplete;
  sentence.classList.toggle("is-valid", complete && !sentenceComplete);
  sentence.classList.toggle("is-complete", sentenceComplete);
}

// Create the button for an item or exit and remember its typed noun when chosen.
function makeObjectButton(object) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.object = object.id;
  button.textContent = object.label;
  button.setAttribute("aria-pressed", String(selectedNouns.some(noun => noun.id === object.id)));
  button.addEventListener("click", () => {
    if (!selectedVerb || sentenceComplete) {
      message.textContent = sentenceComplete ? "Choose another verb to start a new sentence." : "Choose a verb first.";
      return;
    }
    const noun = new AdventureGame.Noun(object.id, object.kind, object.label);
    // Do not accept an object if selecting it would make every verb pattern
    // impossible; leave the current sentence intact so another noun can be tried.
    const possiblePattern = sentencePatterns().some(pattern =>
      [...selectedNouns, noun].every((selected, index) => pattern.nounKinds[index] === selected.kind)
    );
    if (!possiblePattern) {
      message.textContent = "That object doesn't fit this sentence.";
      return;
    }
    selectedNouns.push(noun);
    render();
  });
  return button;
}

// Ask the engine for its latest snapshot and rebuild the dynamic room/inventory
// buttons. Rebuilding ensures collected or moved items appear in the right place.
function render() {
  const state = game.getState();
  roomName.textContent = state.room.name;
  roomDescription.textContent = state.room.description;
  message.textContent = state.message;
  roomObjects.replaceChildren(...state.objects.map(makeObjectButton));
  inventoryObjects.replaceChildren(...state.inventory.map(makeObjectButton));
  if (!state.inventory.length) {
    const empty = document.createElement("p");
    empty.textContent = "Nothing yet.";
    inventoryObjects.append(empty);
  }
  verbButtons.forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.verb === selectedVerb));
  });
  updateSentence();
}

// The player explicitly confirms a complete sentence before its action runs.
sentence.addEventListener("click", () => {
  if (sentence.disabled || !selectedVerb) return;
  game.perform(new AdventureGame.Sentence(selectedVerb, selectedNouns));
  sentenceComplete = true;
  render();
});

// Choosing a different verb starts a fresh sentence and clears its highlight.
verbButtons.forEach(button => {
  button.addEventListener("click", () => {
    selectedVerb = button.dataset.verb;
    selectedNouns = [];
    sentenceComplete = false;
    render();
  });
});

render();
// Relative registration keeps this app's service worker scoped to its own folder.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("adventure-sw.js");
