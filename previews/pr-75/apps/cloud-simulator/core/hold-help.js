/*
 * Purpose: Hold-to-see help, one mechanism for every control on every experiment page. Each
 *   control's description is a hidden <small class="help"> inside its host (the label, or a
 *   wrapper round a button) and the control's aria-describedby. Pressing and holding the host
 *   for HOLD_MS (touch or mouse) shows the text in one small popover next to it; releasing,
 *   tapping elsewhere or Escape hides it. With a mouse, resting on the host for HOLD_MS shows
 *   it too, and so does keyboard focus. A hold never triggers the control: the click that
 *   follows it is swallowed, and pressing a slider, menu or number box itself never starts a
 *   hold, so dragging and typing work as before.
 * Consumers: core/host.js (the common panel and every experiment's own controls).
 * Dependencies: DOM pointer, focus and keyboard events, setTimeout; optionally
 *   getBoundingClientRect and innerWidth/innerHeight for placement. Styles: ../style.css
 *   (.help, .help-host, .help-pop).
 */
export const HOLD_MS = 400;
// A press that moves further than this (a drag or a scroll) is not a hold.
const SLOP_PX = 8;

// Inputs whose own press means something (dragging, opening, typing): a press on them never
// starts a hold. Buttons, checkboxes, radios and label text do.
const ownsPress = target => target?.tagName === "SELECT" || target?.tagName === "TEXTAREA" ||
  (target?.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(target.type));

export function createHoldHelp(doc, { parent = doc.body } = {}) {
  const pop = Object.assign(doc.createElement("div"), { className: "help-pop", hidden: true });
  pop.setAttribute("role", "tooltip");
  pop.id = "help-pop";
  parent?.append(pop);
  let shown = null, timer = null, start = null, swallowClick = false, count = 0;

  function place(host) {
    const box = host.getBoundingClientRect?.();
    if (!box) return;
    const width = Math.min(260, (globalThis.innerWidth ?? 320) - 16);
    const left = Math.max(8, Math.min(box.left, (globalThis.innerWidth ?? width) - width - 8));
    pop.style.width = `${width}px`; pop.style.left = `${left}px`;
    pop.style.top = ""; pop.style.bottom = "";
    // Below the control if it fits, else above it.
    const below = box.bottom + 6, height = pop.offsetHeight ?? 0;
    if (below + height <= (globalThis.innerHeight ?? Infinity) - 8) pop.style.top = `${below}px`;
    else pop.style.top = `${Math.max(8, box.top - 6 - height)}px`;
  }
  function show(host) {
    pop.textContent = host.helpText.textContent;
    pop.hidden = false;
    shown = host;
    host.setAttribute("data-help-open", "true");
    place(host);
  }
  function hide() {
    clearTimeout(timer); timer = null; start = null;
    if (!shown) return;
    shown.setAttribute("data-help-open", "false");
    shown = null; pop.hidden = true;
  }
  const later = fn => { clearTimeout(timer); timer = setTimeout(fn, HOLD_MS); };

  // Tapping anywhere outside the open host, or Escape, hides it.
  doc.addEventListener?.("pointerdown", event => { if (shown && !shown.contains?.(event.target)) hide(); }, true);
  doc.addEventListener?.("keydown", event => { if (event.key === "Escape") hide(); });

  // Make `host` show `text` (a hidden <small class="help">, which it gains) on hold, and
  // describe `control` with it.
  function attach(host, text, control = null) {
    const help = Object.assign(doc.createElement("small"), { className: "help", textContent: text, id: control?.id ? `${control.id}-help` : `help-${++count}` });
    host.append(help);
    host.helpText = help;
    host.className = host.className ? `${host.className} help-host` : "help-host";
    control?.setAttribute("aria-describedby", help.id);
    host.addEventListener("pointerdown", event => {
      swallowClick = false;
      if ((event.button ?? 0) !== 0) return;
      // Dragging a slider or opening a menu: no hold, and no help over it either.
      if (ownsPress(event.target)) { hide(); return; }
      start = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
      later(() => { show(host); swallowClick = true; start = null; });
    });
    host.addEventListener("pointermove", event => {
      if (start && Math.hypot((event.clientX ?? 0) - start.x, (event.clientY ?? 0) - start.y) > SLOP_PX) { clearTimeout(timer); start = null; }
    });
    const release = () => { if (start || shown === host) hide(); };
    host.addEventListener("pointerup", release);
    host.addEventListener("pointercancel", release);
    // The click a hold ends with does nothing (captured before the button's own listener).
    host.addEventListener("click", event => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault?.(); event.stopImmediatePropagation?.(); event.stopPropagation?.();
    }, true);
    // A long press would otherwise open the phone's context menu or select text.
    host.addEventListener("contextmenu", event => { if (start || shown === host) event.preventDefault?.(); });
    // Mouse: resting on the control shows it after the same delay; leaving hides it.
    host.addEventListener("pointerenter", event => { if (event.pointerType === "mouse" && !shown && !event.buttons) later(() => show(host)); });
    host.addEventListener("pointerleave", event => { if (event.pointerType === "mouse") hide(); });
    // Keyboard focus shows it; a mouse or touch press does not (it has its own hold).
    host.addEventListener("focusin", event => { if (event.target?.matches?.(":focus-visible") ?? true) show(host); });
    host.addEventListener("focusout", () => { if (shown === host) hide(); });
    return help;
  }
  return { attach, show, hide, popover: pop, get shown() { return shown; } };
}
