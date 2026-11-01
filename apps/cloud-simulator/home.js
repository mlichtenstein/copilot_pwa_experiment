/* Purpose: Front page entry: the shared header, the 🎲 Random and ❤️ Random buttons (with
 *   hold-to-see help), and one card per registered experiment (picture, title, one line, link),
 *   then offline setup.
 * Consumers: index.html; home.test.js.
 * Dependencies: core/registry.js, core/header.js (mountHeader, launchButtons), core/launch.js,
 *   core/hold-help.js, thumbs/<id>.png; the DOM and optionally the service worker API. */
import { experiments } from "./core/registry.js";
import { mountHeader, launchButtons } from "./core/header.js";
import { createHoldHelp } from "./core/hold-help.js";

export const HOME_TITLE = "Seven small skies";
export const HOME_TAGLINE = "Pixel-art experiments in clouds, light and weather.";
export const thumbnailFor = entry => `thumbs/${entry.id}.png`;

export function mountHome({ doc = globalThis.document, serviceWorker = globalThis.navigator?.serviceWorker, launch = {} } = {}) {
  const element = id => doc.getElementById(id);
  const make = (tag, props = {}, ...children) => { const node = Object.assign(doc.createElement(tag), props); node.append(...children); return node; };
  const help = createHoldHelp(doc);
  mountHeader(element("header"), { doc, title: HOME_TITLE, tagline: HOME_TAGLINE, help, launch });
  const buttons = launchButtons({ doc, help, className: "big", ...launch });
  element("launch")?.append(buttons.random, buttons.loved, buttons.status);
  const list = element("experiments");
  for (const entry of experiments) {
    const picture = make("img", { src: thumbnailFor(entry), alt: "", width: 160, height: 100, loading: "lazy", decoding: "async" });
    list?.append(make("li", { className: "home-card" },
      make("a", { href: entry.href }, make("span", { className: "home-card-picture" }, picture), make("span", { className: "home-card-title", textContent: entry.title }), make("span", { className: "home-card-line", textContent: entry.tagline }))));
  }
  serviceWorker?.register("./cloud-sw.js").catch(error => {
    console.error("Cloud simulator offline setup failed", error);
    const status = element("status");
    if (status) status.textContent = "Offline setup failed; the experiments still work online.";
  });
  return { help, buttons };
}

if (globalThis.document?.getElementById?.("experiments")) mountHome();
