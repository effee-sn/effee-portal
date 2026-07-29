/**
 * Bridge to the top progress bar (nextjs-toploader) for non-navigation work —
 * API calls (list/table loads, saves, deletes) and any long action.
 *
 * The bar itself is a React component whose `start`/`done` come from a hook, so
 * a plain module can't call them directly. `LoaderBridge` registers those
 * handlers here once; everything else calls `topLoader.start()/done()`.
 *
 * Behaviour:
 *  - shows immediately, so even fast table loads and button clicks give feedback;
 *  - reference-counted, so overlapping requests keep the bar up until the last
 *    one finishes;
 *  - held for a short minimum so a very fast request still shows a visible bar
 *    rather than an imperceptible flicker.
 */

let active = 0;
let visible = false;
let shownAt = 0;
let hideTimer = null;
let handlers = { start: () => {}, done: () => {} };

/** Keep the bar up at least this long once shown (ms). */
const MIN_VISIBLE = 400;

/** Registered by LoaderBridge with the live start/done from useTopLoader(). */
export function registerLoader(next) {
  handlers = next;
}

export const topLoader = {
  /** Mark a unit of work as started — shows the bar right away. */
  start() {
    active += 1;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } // cancel any pending hide
    if (!visible) {
      visible = true;
      shownAt = Date.now();
      handlers.start();
    }
  },

  /** Mark a unit of work as finished. Hides once nothing is in flight (after the minimum). */
  done() {
    active = Math.max(0, active - 1);
    if (active === 0 && visible) {
      const wait = Math.max(0, MIN_VISIBLE - (Date.now() - shownAt));
      hideTimer = setTimeout(() => {
        hideTimer = null;
        if (active === 0) { visible = false; handlers.done(); }
      }, wait);
    }
  },
};
