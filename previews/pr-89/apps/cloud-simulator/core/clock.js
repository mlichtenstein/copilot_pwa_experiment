/*
 * Purpose: The shared simulation clock and animation loop for cloud simulator experiments.
 *   One clock says what time it is (which moves the shared sun path and any simulation),
 *   and one requestAnimationFrame loop calls back with capped frame times.
 * Consumers: core/host.js; clock.test.js.
 * Dependencies: createClock is pure; startLoop needs requestAnimationFrame and document
 *   (visibilitychange), or injected stand-ins.
 */

// Longest frame step counted, so a stalled or background tab does not jump ahead.
export const MAX_FRAME_MS = 250;

// time is in seconds. advance(dt) moves it only while playing, at `rate` clock seconds per
// real second, and returns the seconds actually advanced.
export function createClock({ time = 0, playing = false, rate = 1 } = {}) {
  const clock = {
    time, playing, rate,
    advance(dt) {
      if (!clock.playing) return 0;
      const step = Math.min(dt, MAX_FRAME_MS / 1000) * clock.rate;
      clock.time += step;
      return step;
    },
    set(next) { clock.time = next; },
    play(value = true) { clock.playing = value; }
  };
  return clock;
}

// Calls onFrame(dtSeconds, timestamp) every animation frame. dt is 0 on the first frame and
// after the page is hidden, and never more than MAX_FRAME_MS. Returns stop().
export function startLoop(onFrame, { raf = globalThis.requestAnimationFrame, doc = globalThis.document } = {}) {
  let previous, running = true;
  const reset = () => { previous = undefined; };
  doc?.addEventListener?.("visibilitychange", reset);
  const frame = stamp => {
    if (!running) return;
    const hidden = doc?.hidden;
    const dt = previous === undefined || hidden ? 0 : Math.min(stamp - previous, MAX_FRAME_MS) / 1000;
    previous = stamp;
    if (!hidden) onFrame(dt, stamp);
    raf(frame);
  };
  raf(frame);
  return () => { running = false; doc?.removeEventListener?.("visibilitychange", reset); };
}
