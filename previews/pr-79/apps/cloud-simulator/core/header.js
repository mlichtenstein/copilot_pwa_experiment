/*
 * Purpose: The one header every page shows, built from the registry: a top line with the site
 *   name (a link to the front page) and the two launch buttons (🎲 Random and ❤️ Random,
 *   launch.js), the page's title and one-line tagline, then links to every experiment in
 *   registry order with the same labels on every page and the current page marked
 *   (aria-current, not a link). Same content, same lines, so the header is the same height
 *   everywhere and the common panel below it lines up from page to page.
 * Consumers: core/host.js (mountExperiment fills the page's <header id="header">), ../home.js
 *   (the front page); common-panel.test.js, launch.test.js.
 * Dependencies: registry.js (titles, nav labels, taglines and hrefs), launch.js; a DOM
 *   document; optionally a hold-help instance (hold-help.js) for the buttons' descriptions.
 */
import { experiments } from "./registry.js";
import { LAUNCH_TEXT, randomExperiment, randomHref, pickLoved, lovedProblem, readCarry } from "./launch.js";

export const SITE_NAME = "Cloud simulator";
export const HOME_HREF = "./";

const sessionStore = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

/*
 * The two launch buttons and their status line. beforeLeave() runs first (a page saves its sun
 * for the carry-over); navigate(href) goes there. Returns { random, loved, status }.
 */
export function launchButtons({ doc = globalThis.document, help = null, beforeLeave = () => {}, navigate = href => globalThis.location.assign(href),
  storage = sessionStore(), random = Math.random, store, base = globalThis.location?.href, className = "" } = {}) {
  const make = (tag, props = {}, ...children) => { const node = Object.assign(doc.createElement(tag), props); node.append(...children); return node; };
  const status = make("p", { className: "launch-status" });
  status.setAttribute("role", "status");
  const say = text => { status.textContent = text; };
  const randomButton = make("button", { type: "button", className: `launch-random ${className}`.trim(), textContent: LAUNCH_TEXT.random });
  const lovedButton = make("button", { type: "button", className: `launch-loved ${className}`.trim(), textContent: LAUNCH_TEXT.loved });
  randomButton.addEventListener("click", () => {
    beforeLeave();
    navigate(randomHref(randomExperiment(random)));
  });
  lovedButton.addEventListener("click", async () => {
    beforeLeave();
    lovedButton.disabled = true; say(LAUNCH_TEXT.looking);
    let pick = null, problem = null;
    try { pick = await pickLoved({ ...(store ? { store } : {}), random, carry: readCarry(storage), base }); } catch (error) { problem = error; }
    lovedButton.disabled = false;
    if (pick) { say(""); navigate(pick.href); } else say(lovedProblem(problem));
  });
  const wrap = (button, text) => {
    const host = make("span", { className: "launch" }, button);
    if (help) help.attach(host, text, button); else button.title = text;
    return host;
  };
  return { random: wrap(randomButton, LAUNCH_TEXT.randomNote), loved: wrap(lovedButton, LAUNCH_TEXT.lovedNote), status, buttons: [randomButton, lovedButton] };
}

export function mountHeader(header, { doc = globalThis.document, current, title, tagline, help = null, launch = {} } = {}) {
  if (!header) return null;
  const entry = experiments.find(item => item.id === current);
  const make = (tag, props = {}, ...children) => { const node = Object.assign(doc.createElement(tag), props); node.append(...children); return node; };
  const nav = make("nav", { className: "experiment-nav" });
  nav.setAttribute("aria-label", "Experiments");
  experiments.forEach((item, i) => {
    if (i) nav.append(make("span", { className: "nav-sep", textContent: "·" }));
    const here = item.id === current;
    const link = make(here ? "span" : "a", { textContent: item.nav, ...(here ? {} : { href: item.href }) });
    if (here) link.setAttribute("aria-current", "page");
    nav.append(link);
  });
  const text = tagline ?? entry?.tagline ?? "";
  const line = make("p", { className: "tagline", textContent: text, title: text });
  const buttons = launchButtons({ doc, help, ...launch });
  const home = make("a", { className: "eyebrow", href: HOME_HREF, textContent: SITE_NAME });
  header.className = "experiment-header";
  header.append(make("div", { className: "header-top" }, home, make("span", { className: "header-actions" }, buttons.random, buttons.loved)),
    buttons.status, make("h1", { textContent: title ?? entry?.title ?? "" }), line, nav);
  return header;
}
