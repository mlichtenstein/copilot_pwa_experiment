/*
 * Purpose: Drop-in Presets panel for any app: Save (name and note), Copy link (parameters
 *   in the URL), and a Saved presets list with Load and, for your own presets, Delete.
 *   Restores parameters from the page URL on mount.
 * Consumers: app pages that import mountPresetPanel (first: cloud-simulator/convection.js).
 * Dependencies: presets.js; a container element; the app's getParams() returning a plain
 *   JSON object and applyParams(params) applying one (and restarting as the app sees fit);
 *   DOM, history, clipboard and online/offline events. Styles: presets.css.
 */
import { createPresetStore, paramsFromUrl, urlWithParams, LIMITS } from "./presets.js";

const make = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

export function mountPresetPanel(container, { app, getParams, applyParams, commitSha = null, store = createPresetStore({ app }), restoreFromUrl = true }) {
  const name = make("input", { type: "text", maxLength: LIMITS.name, required: true, placeholder: "Name", autocomplete: "off" });
  const note = make("textarea", { maxLength: LIMITS.note, rows: 2, placeholder: "Note (optional)" });
  const save = make("button", { type: "submit", textContent: "Save preset" });
  const share = make("button", { type: "button", textContent: "Copy link" });
  const status = make("p", { className: "presets-status", role: "status" });
  const list = make("ul", { className: "presets-list" });
  const refresh = make("button", { type: "button", textContent: "Refresh" });
  const form = make("form", { className: "presets-form" },
    make("label", {}, make("span", { textContent: "Name" }), name),
    make("label", {}, make("span", { textContent: "Note" }), note),
    make("div", { className: "presets-actions" }, save, share));
  container.classList.add("presets");
  container.replaceChildren(make("h2", { textContent: "Presets" }),
    make("p", { className: "presets-intro", textContent: "Save these settings for anyone to load, or copy a link to them. No account needed." }),
    form, status, make("div", { className: "presets-heading" }, make("h3", { textContent: "Saved presets" }), refresh), list);

  const say = text => { status.textContent = text; };
  const online = () => navigator.onLine !== false;
  let unavailable = false;

  function syncOnline() {
    save.disabled = !online() || unavailable;
    refresh.disabled = !online();
    if (!online()) say("Offline: saved presets are unavailable, but the app works and Copy link still does.");
  }

  async function load() {
    if (!online()) return syncOnline();
    try {
      const rows = await store.list();
      const mine = store.userId();
      list.replaceChildren(...rows.map(row => {
        const when = new Date(row.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        const use = make("button", { type: "button", textContent: "Load" });
        use.addEventListener("click", () => { applyParams(row.params); say(`Loaded “${row.name}”.`); });
        const actions = make("div", { className: "presets-actions" }, use);
        if (mine && row.created_by === mine) {
          const drop = make("button", { type: "button", textContent: "Delete" });
          drop.addEventListener("click", async () => {
            if (!confirm(`Delete “${row.name}”?`)) return;
            try { await store.remove(row.id); say(`Deleted “${row.name}”.`); load(); } catch (error) { say(error.message); }
          });
          actions.append(drop);
        }
        return make("li", {}, make("div", {}, make("strong", { textContent: row.name }), make("small", { textContent: " · " + when })),
          ...(row.note ? [make("p", { textContent: row.note })] : []), actions);
      }));
      if (!rows.length) list.replaceChildren(make("li", { className: "presets-empty", textContent: "No saved presets yet." }));
      unavailable = false;
    } catch (error) {
      unavailable = error.kind === "setup";
      list.replaceChildren();
      say(error.message);
    }
    syncOnline();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    save.disabled = true;
    say("Saving…");
    try {
      const row = await store.save({ name: name.value, note: note.value, params: getParams(), commitSha });
      say(`Saved “${row.name}”.`);
      name.value = note.value = "";
      await load();
    } catch (error) {
      say(error.message);
    }
    syncOnline();
  });
  share.addEventListener("click", async () => {
    const link = urlWithParams(location.href, getParams());
    history.replaceState(null, "", link);
    try { await navigator.clipboard.writeText(link); say("Link copied. Anyone opening it gets these settings."); }
    catch { say("Link is in the address bar; copy it from there."); }
  });
  refresh.addEventListener("click", load);
  addEventListener("online", load);
  addEventListener("offline", syncOnline);

  if (restoreFromUrl) {
    const params = paramsFromUrl(location.href);
    if (params) { applyParams(params); say("Loaded the settings from this link."); }
  }
  syncOnline();
  load();
  return { reload: load };
}
