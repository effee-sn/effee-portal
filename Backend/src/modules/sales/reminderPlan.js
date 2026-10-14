/**
 * Which follow-up reminder is due — pure, no database.
 *
 * A follow-up can have several reminders, each "N minutes before" it (a site
 * visit: 1440, 180, 15 → a day, 3 hours and 15 minutes before). Rules:
 *
 *   - Each reminder goes once. `sentOffset` is the smallest one already sent;
 *     only smaller ones are still pending.
 *   - **No catching up.** When several are past at once (a missed sweep, or a
 *     visit booked only 5 hours ahead), only the latest — the one closest to
 *     the follow-up — is considered; the older ones are dropped.
 *   - An earlier reminder whose time had already passed when the follow-up
 *     was scheduled (`armedAt`) is skipped: booking a visit for this evening
 *     doesn't produce a "tomorrow" style reminder.
 *   - The **final** reminder (the smallest offset) always goes, even late —
 *     as before, an overdue follow-up still gets its one reminder.
 *
 * Date-only follow-ups are stored at the morning reminder time (9:00 local).
 * Hours mean nothing for them, so they use only whole-day offsets (1440 → the
 * morning before) plus that morning itself (offset 0, the final one).
 */

const DAY_MIN = 1440;

/**
 * The offsets (minutes before) that apply, largest first.
 * @param {number[]} offsets configured minutes-before
 * @param {boolean} timed whether the follow-up has a time of day
 * @returns {number[]}
 */
function effectiveOffsets(offsets, timed) {
  const clean = [...new Set((offsets || []).filter((o) => Number.isInteger(o) && o > 0))];
  const list = timed
    ? clean
    : [...new Set([0, ...clean.filter((o) => o >= DAY_MIN).map((o) => Math.floor(o / DAY_MIN) * DAY_MIN)])];
  return list.sort((a, b) => b - a);
}

/**
 * The reminder to send now, if any.
 * @param {{ at: Date, timed: boolean, offsets: number[], sentOffset?: number|null,
 *   armedAt?: Date|null, now: Date }} p
 * @returns {{ offset: number, final: boolean } | null}
 */
function dueReminder({ at, timed, offsets, sentOffset = null, armedAt = null, now }) {
  const list = effectiveOffsets(offsets, timed);
  if (!list.length) return null;
  const finalOffset = list[list.length - 1];
  const fireAt = (o) => at.getTime() - o * 60 * 1000;

  const fired = list.filter((o) => (sentOffset === null || o < sentOffset) && fireAt(o) <= now.getTime());
  if (!fired.length) return null;
  const offset = Math.min(...fired);
  const final = offset === finalOffset;
  if (!final && armedAt && fireAt(offset) < armedAt.getTime()) return null;
  return { offset, final };
}

/**
 * How far ahead a sweep must look to catch every reminder that could be due.
 * @param {number[][]} allOffsets every kind's offsets
 * @returns {{ timedMin: number, dayMin: number }}
 */
function lookahead(allOffsets) {
  const flat = allOffsets.flat();
  return {
    timedMin: Math.max(0, ...effectiveOffsets(flat, true)),
    dayMin: Math.max(0, ...effectiveOffsets(flat, false)),
  };
}

module.exports = { dueReminder, effectiveOffsets, lookahead, DAY_MIN };
