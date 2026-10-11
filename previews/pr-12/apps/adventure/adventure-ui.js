const game = AdventureGame.createGame(AdventureWorld);
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

function sentencePatterns() {
  return game.verbs[selectedVerb]?.patterns ?? [];
}

function updateSentence() {
  if (!selectedVerb) {
    sentence.replaceChildren(document.createTextNode("Choose a verb to make a sentence."));
    sentence.disabled = true;
    sentence.classList.remove("is-valid", "is-complete");
    return;
  }
  const selectedKinds = selectedNouns.map(noun => noun.kind);
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

sentence.addEventListener("click", () => {
  if (sentence.disabled || !selectedVerb) return;
  game.perform(new AdventureGame.Sentence(selectedVerb, selectedNouns));
  sentenceComplete = true;
  render();
});

verbButtons.forEach(button => {
  button.addEventListener("click", () => {
    selectedVerb = button.dataset.verb;
    selectedNouns = [];
    sentenceComplete = false;
    render();
  });
});

render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("adventure-sw.js");
