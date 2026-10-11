const game = AdventureGame.createGame(AdventureWorld);
const roomName = document.querySelector("#room-name");
const roomDescription = document.querySelector("#room-description");
const roomObjects = document.querySelector("#room-objects");
const inventoryObjects = document.querySelector("#inventory-objects");
const message = document.querySelector("#message");
const sentence = document.querySelector("#sentence");
const verbButtons = [...document.querySelectorAll("[data-verb]")];
let selectedVerb = null;
let selectedNouns = [];

function nounLabel(id) {
  const state = game.getState();
  return [...state.objects, ...state.inventory].find(object => object.id === id)?.label ?? id;
}

function updateSentence() {
  if (!selectedVerb) {
    sentence.textContent = "Choose a verb to make a sentence.";
    return;
  }
  const labels = selectedNouns.map(nounLabel);
  const verb = game.verbs[selectedVerb].label;
  sentence.textContent = selectedVerb === "use"
    ? `${verb} ${labels[0] ?? "…"}${labels[1] ? ` with ${labels[1]}` : ""}`
    : `${verb} ${labels[0] ?? "…"}`;
}

function makeObjectButton(object) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.object = object.id;
  button.textContent = object.label;
  button.setAttribute("aria-pressed", String(selectedNouns.includes(object.id)));
  button.addEventListener("click", () => {
    if (!selectedVerb) {
      message.textContent = "Choose a verb first.";
      return;
    }
    const requiredNouns = game.verbs[selectedVerb].nouns;
    selectedNouns.push(object.id);
    if (selectedNouns.length === requiredNouns) {
      game.perform(selectedVerb, selectedNouns[0], selectedNouns[1]);
      message.textContent = game.getState().message;
      selectedVerb = null;
      selectedNouns = [];
    }
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

verbButtons.forEach(button => {
  button.addEventListener("click", () => {
    selectedVerb = button.dataset.verb;
    selectedNouns = [];
    render();
  });
});

render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("adventure-sw.js");
