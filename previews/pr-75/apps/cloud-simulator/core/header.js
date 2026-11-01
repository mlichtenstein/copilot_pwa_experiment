/*
 * Purpose: The one header every experiment page shows, built from the registry: the site name,
 *   the page's title and one-line tagline, then links to every experiment in registry order
 *   with the same labels on every page and the current page marked (aria-current, not a
 *   link). Same content, same lines, so the header is the same height everywhere and the
 *   common panel below it lines up from page to page.
 * Consumers: core/host.js (mountExperiment fills the page's <header id="header">);
 *   common-panel.test.js.
 * Dependencies: registry.js (titles, nav labels, taglines and hrefs); a DOM document.
 */
import { experiments } from "./registry.js";

export const SITE_NAME = "Cloud simulator";

export function mountHeader(header, { doc = globalThis.document, current, title, tagline } = {}) {
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
  header.className = "experiment-header";
  header.append(make("p", { className: "eyebrow", textContent: SITE_NAME }), make("h1", { textContent: title ?? entry?.title ?? "" }), line, nav);
  return header;
}
