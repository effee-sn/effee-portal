/**
 * Wall-clock ↔ instant conversion in the business timezone (APP_TIMEZONE,
 * Asia/Kolkata by default), independent of the server's own timezone — so a
 * "9:00 AM" reminder is 9:00 AM in India whether the server runs in IST or UTC.
 */

/** Offset of `tz` from UTC at `date`, in milliseconds (IST → +19 800 000). */
function offsetMs(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant at which it is `HH:MM` on `YYYY-MM-DD` in `tz`.
 * @param {string} day 'YYYY-MM-DD' @param {string} time 'HH:MM' @param {string} tz
 * @returns {Date}
 */
function zonedTime(day, time, tz) {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle DST edges; a fixed-offset zone like IST settles in one.
  let at = guess - offsetMs(new Date(guess), tz);
  at = guess - offsetMs(new Date(at), tz);
  return new Date(at);
}

/** "5:30 pm" for an instant, in `tz`. */
function formatTime(date, tz) {
  return date.toLocaleTimeString('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
}

/** The calendar day of an instant in `tz`, as 'YYYY-MM-DD'. */
function localDay(date, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

module.exports = { zonedTime, formatTime, offsetMs, localDay };
