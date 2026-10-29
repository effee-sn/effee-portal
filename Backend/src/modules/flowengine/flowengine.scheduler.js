const { processPendingEvents } = require('./dispatcher');
const { flowEngineRepository } = require('./flowengine.repository');
const { logger } = require('../../core');

/**
 * Background loop that runs flows for new events. In-process setInterval, like
 * the sales reminder sweep; safe under a cluster because each event is claimed
 * before it runs (see dispatcher). A `running` guard prevents overlap.
 */

// Every 5 seconds: a flow's notification or approval request follows the
// action almost at once, while an idle sweep is one indexed query.
const INTERVAL_MS = 5 * 1000;
// Handled events are kept 30 days for tracing, then removed (once an hour).
const KEEP_DAYS = 30;
const PURGE_EVERY = 720;

let running = false;
let sweeps = 0;
let timer = null;

async function sweep() {
  if (running) return;
  running = true;
  try {
    const r = await processPendingEvents();
    if (r.runs > 0) logger.info(r, 'Flows run');
    if (sweeps % PURGE_EVERY === 0) {
      await flowEngineRepository.purgeEvents(new Date(Date.now() - KEEP_DAYS * 864e5));
    }
    sweeps += 1;
  } catch (err) {
    logger.error({ err }, 'Flow engine sweep failed');
  } finally {
    running = false;
  }
}

/** Starts the loop. Returns a stop function. */
function startFlowEngine() {
  timer = setInterval(sweep, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info({ intervalMs: INTERVAL_MS }, 'Flow engine started');
  return () => { clearInterval(timer); timer = null; };
}

module.exports = { startFlowEngine, sweep };
