/*
 * Purpose: Drop-in rating bar for any app: a remembered name field, four emoji buttons
 *   (each tap saves the current settings, the rating and a canvas thumbnail as one row), Copy
 *   link (settings in ?p=), a Recent list of the last ratings with thumbnails that reloads
 *   their settings on click, and an About note explaining the bar. Every control has a short
 *   title tooltip, so its explanation sits on it. Restores ?p= on mount.
 * Consumers: the cloud simulator pages (app.js for index.html, sunset.js, convection.js, horizon.js).
 * Dependencies: presets.js; a container element; the app's getParams() returning a plain JSON
 *   object and applyParams(params) applying one; optionally the app's <canvas> for thumbnails;
 *   DOM, localStorage, history, clipboard and online/offline events. Styles: presets.css.
 */
import { createPresetStore, canvasThumbnail, paramsFromUrl, urlWithParams, ratingFor, RATINGS, LIMITS } from "./presets.js";

const NAME_KEY = "presets-display-name";

const make = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// "just now", "5 min ago", "3 h ago" or a date.
function ago(when, now = Date.now()) {
  const minutes = Math.round((now - new Date(when).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return new Date(when).toLocaleDateString(undefined, { dateStyle: "medium" });
}

// The About pop-over: what each emoji means, why tapping helps, the remembered name and Copy link.
function aboutPanel() {
  return make("div", { className: "preset-about-text preset-pop" },
    make("p", { textContent: "Play with the settings, and whenever the picture makes you feel something, tap the emoji that fits:" }),
    make("ul", {}, ...RATINGS.map(rating => make("li", {}, make("span", { className: "preset-about-emoji", textContent: rating.emoji }), ` ${rating.meaning}`))),
    make("p", { textContent: "Why tap? Every tap saves your name, the emoji, all of the current settings and a small picture of the canvas. Together the taps show Maxwell which parts of the settings feel good or bad, and let anyone find a good spot again from Recent." }),
    make("p", { textContent: "Your name is remembered on this device, so you only type it once." }),
    make("p", { textContent: "🔗 Copy link copies a web address that reopens these exact settings. Share it or keep it." }));
}

/*
 * Mounts the bar into `container` and returns { reload }, or null when there is no real
 * container (a missing element, or a test harness without a DOM), so apps stay testable.
 */
export function mountPresetBar(container, { app, getParams, applyParams, canvas = null, table, store = createPresetStore({ app, table }),
  restoreFromUrl = true, recentCount = 10 }) {
  if (!container || typeof document === "undefined" || typeof document.createElement !== "function" || !container.isConnected) return null;
  const storage = (() => { try { return globalThis.localStorage; } catch { return null; } })();
  const name = make("input", { type: "text", maxLength: LIMITS.name, placeholder: "Your name", autocomplete: "nickname",
    value: storage?.getItem(NAME_KEY) ?? "", className: "preset-name" });
  name.title = "Your name, saved with each tap and remembered on this device";
  name.setAttribute("aria-label", "Your name, saved with each rating");
  const buttons = RATINGS.map(rating => {
    const button = make("button", { type: "button", className: "preset-rate", textContent: rating.emoji, title: `${rating.label}: tap to save these settings` });
    button.setAttribute("aria-label", `Rate these settings: ${rating.label}`);
    button.addEventListener("click", () => rate(rating.value));
    return button;
  });
  const share = make("button", { type: "button", className: "preset-tool", textContent: "🔗", title: "Copy a link that reopens these exact settings" });
  share.setAttribute("aria-label", "Copy a link that reopens these exact settings");
  const list = make("ol", { className: "preset-recent-list preset-pop" });
  const recent = make("details", { className: "preset-menu preset-recent" },
    make("summary", { textContent: "Recent", title: "The last ratings from everyone; click one to load its settings" }), list);
  const about = make("details", { className: "preset-menu preset-about" },
    make("summary", { textContent: "About", title: "What the emojis mean and why to tap them" }), aboutPanel());
  for (const menu of [recent, about]) menu.addEventListener("toggle", () => { if (menu.open) for (const other of [recent, about]) if (other !== menu) other.open = false; });
  const status = make("p", { className: "preset-status", role: "status" });
  container.classList.add("preset-bar");
  container.replaceChildren(make("div", { className: "preset-row" }, name, make("div", { className: "preset-rates" }, ...buttons), share,
    make("div", { className: "preset-menus" }, recent, about)), status);

  const say = text => { status.textContent = text; };
  const online = () => navigator.onLine !== false;
  let unavailable = false;

  function sync() {
    for (const button of buttons) button.disabled = !online() || unavailable;
    if (!online()) say("Offline: ratings are paused; the app and 🔗 still work.");
  }

  async function load() {
    if (!online()) return sync();
    try {
      const rows = await store.list(recentCount);
      const me = store.userId();
      list.replaceChildren(...rows.map(row => {
        const rating = ratingFor(row.rating);
        const label = `${rating?.emoji ?? "•"} ${row.display_name}${me && row.created_by === me ? " (you)" : ""} · ${ago(row.created_at)}`;
        const pick = make("button", { type: "button", className: "preset-recent-item", title: "Load these settings" },
          row.thumbnail ? make("img", { src: row.thumbnail, alt: "", width: 64, height: 48, decoding: "async" }) : make("span", { className: "preset-thumb-empty" }),
          make("span", { textContent: label }));
        pick.addEventListener("click", () => { applyParams(row.params); recent.open = false; say(`Loaded ${rating?.emoji ?? ""} ${row.display_name}'s settings.`); });
        return make("li", {}, pick);
      }));
      if (!rows.length) list.replaceChildren(make("li", { className: "preset-empty", textContent: "No ratings yet. Tap an emoji." }));
      unavailable = false;
    } catch (error) {
      unavailable = error.kind === "setup";
      list.replaceChildren();
      say(error.message);
    }
    sync();
  }

  async function rate(value) {
    const rating = ratingFor(value);
    if (!name.value.trim()) { say("Type your name first, then tap."); name.focus(); return; }
    storage?.setItem(NAME_KEY, name.value.trim());
    say(`Saving ${rating.emoji}…`);
    try {
      await store.save({ displayName: name.value, rating: value, params: getParams(), thumbnail: canvas ? canvasThumbnail(canvas) : null });
      say(`Saved ${rating.emoji} ${rating.label.toLowerCase()}.`);
      await load();
    } catch (error) {
      say(error.message);
    }
    sync();
  }

  name.addEventListener("change", () => storage?.setItem(NAME_KEY, name.value.trim()));
  share.addEventListener("click", async () => {
    const link = urlWithParams(location.href, getParams());
    history.replaceState(null, "", link);
    try { await navigator.clipboard.writeText(link); say("Link copied. Anyone opening it gets these settings."); }
    catch { say("The link is in the address bar; copy it from there."); }
  });
  recent.addEventListener("toggle", () => { if (recent.open) load(); });
  addEventListener("online", load);
  addEventListener("offline", sync);

  if (restoreFromUrl) {
    const params = paramsFromUrl(location.href);
    if (params) { applyParams(params); say("Loaded the settings from this link."); }
  }
  sync();
  load();
  return { reload: load };
}
