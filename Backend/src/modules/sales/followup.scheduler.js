const { runDueFollowupReminders, runStageAgingReminders, runOverdueFollowupDigest } = require('./followup.service');
const { logger } = require('../../core');

/**
 * Periodic sales reminder sweep (follow-ups due, stalled stages, and the daily
 * overdue follow-ups email). In-process
 * setInterval — the app has no external scheduler yet. Safe under a cluster
 * because the sweep claims each row before notifying (see followup.service).
 * A `running` guard prevents overlap if a sweep runs long.
 */

// Every minute, so a "15 minutes before" reminder lands on time (each sweep
// is a couple of indexed queries). Stalled-stage reminders are day-scale, so
// they run on every 15th sweep only.
const INTERVAL_MS = 60 * 1000;
const AGING_EVERY = 15;
const FIRST_RUN_MS = 20 * 1000;     // shortly after boot

let running = false;
let sweeps = 0;
let timer = null;

async function sweep() {
  if (running) return;
  running = true;
  try {
    const followups = await runDueFollowupReminders();
    if (followups.sent > 0) logger.info(followups, 'Follow-up reminders sent');
    if (sweeps % AGING_EVERY === 0) {
      const aging = await runStageAgingReminders();
      if (aging.sent > 0) logger.info(aging, 'Stage-aging reminders sent');
      // Once a day per person, from the morning time (see followup.service).
      const overdue = await runOverdueFollowupDigest();
      if (overdue.sent > 0) logger.info(overdue, 'Overdue follow-up emails sent');
    }
    sweeps += 1;
  } catch (err) {
    logger.error({ err }, 'Follow-up reminder sweep failed');
  } finally {
    running = false;
  }
}

/** Starts the sweep loop. Returns a stop function. */
function startFollowupReminders() {
  const first = setTimeout(sweep, FIRST_RUN_MS);
  timer = setInterval(sweep, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  if (typeof first.unref === 'function') first.unref();
  logger.info({ intervalMs: INTERVAL_MS }, 'Follow-up reminder scheduler started');
  return () => { clearInterval(timer); timer = null; };
}

module.exports = { startFollowupReminders, sweep };
