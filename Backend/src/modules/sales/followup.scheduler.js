const { runDueFollowupReminders } = require('./followup.service');
const { logger } = require('../../core');

/**
 * Periodic follow-up reminder sweep. In-process setInterval — the app has no
 * external scheduler yet. Safe under a cluster because the sweep claims each
 * row before notifying (see followup.service). A `running` guard prevents
 * overlap if a sweep runs long.
 */

const INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes
const FIRST_RUN_MS = 20 * 1000;     // shortly after boot

let running = false;
let timer = null;

async function sweep() {
  if (running) return;
  running = true;
  try {
    const { checked, sent } = await runDueFollowupReminders();
    if (sent > 0) logger.info({ checked, sent }, 'Follow-up reminders sent');
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
