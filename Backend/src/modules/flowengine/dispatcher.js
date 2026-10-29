const { flowEngineRepository } = require('./flowengine.repository');
const { nodeType } = require('./nodes');
const { parseGraph, triggerNode } = require('./graph');
const { executeRun } = require('./runner');
const { emitFlowEvent } = require('./events');
const { catalogFor } = require('./catalog');
const { createHelpers } = require('./helpers');
const { logger } = require('../../core');

const helpers = createHelpers();

/**
 * Takes events off the outbox and starts the flows that listen to them.
 *
 * Safe with several API processes: each event is claimed before it is handled
 * (only one worker's claim matches), and a run is unique per flow and event —
 * so a retried event never starts the same flow twice. An event whose worker
 * died mid-way is picked up again once its claim is stale.
 */

const BATCH = 50;
const STALE_MS = 5 * 60 * 1000;   // a claim older than this is a dead worker's
const MAX_ATTEMPTS = 3;
const MAX_DEPTH = 3;              // flow → event → flow … stops here (loop guard)

/**
 * Handles one claimed event: every live flow it starts, in turn.
 * @returns {Promise<{ runs: number, failed: number }>}
 */
async function handleEvent(repository, row) {
  const event = {
    id: row.id, module: row.module, type: row.type, entityType: row.entity_type, entityId: row.entity_id,
    actorId: row.actor_id, depth: row.depth, originFlowId: row.origin_flow_id,
    payload: row.payload ? JSON.parse(row.payload) : {},
  };
  const stats = { runs: 0, failed: 0 };
  if (event.depth > MAX_DEPTH) return stats;

  // The record as flows see it, loaded once for all the flows this event starts.
  const catalog = catalogFor(event.module);
  let facts;
  const loadFacts = async () => {
    if (facts === undefined) {
      facts = catalog && event.entityType === catalog.entityType ? await catalog.loadEntity(event.entityId) : null;
    }
    return facts;
  };

  for (const { flow, version } of await repository.liveFlowsFor(event.module, event.type)) {
    if (flow.id === event.originFlowId) continue; // a flow never starts itself
    const graph = parseGraph(version.graph);
    const start = graph && triggerNode(graph);
    if (!start || !nodeType('trigger').matches(start.data, event)) continue;

    let run;
    try {
      run = await repository.createRun({
        flow_id: flow.id, version_id: version.id, event_id: event.id, trigger: event.type,
        entity_type: event.entityType, entity_id: event.entityId,
      });
    } catch (err) {
      if (err.code === 'P2002') continue; // this flow already ran for this event (a retry)
      throw err;
    }
    const ctx = {
      mode: 'run',
      module: event.module,
      event,
      facts: await loadFacts(),
      flow,
      version: { id: version.id, version: version.version },
      helpers,
      /** Lets a block report an event of its own, marked as caused by this flow. */
      emit: (e) => emitFlowEvent({ ...e, depth: event.depth + 1, originFlowId: flow.id }),
    };
    const result = await executeRun({ repository, nodeType, runId: run.id, graph, ctx });
    stats.runs += 1;
    if (result.status === 'FAILED') {
      stats.failed += 1;
      logger.warn({ flowId: flow.id, runId: run.id, error: result.error }, 'Flow run failed');
    }
  }
  return stats;
}

/**
 * One sweep of the outbox.
 * @param {{ now?: Date, repository?: object }} [opts]
 * @returns {Promise<{ events: number, runs: number, failed: number }>}
 */
async function processPendingEvents({ now = new Date(), repository = flowEngineRepository } = {}) {
  const staleBefore = new Date(now.getTime() - STALE_MS);
  const pending = await repository.pendingEvents({ staleBefore, maxAttempts: MAX_ATTEMPTS, take: BATCH });
  const totals = { events: 0, runs: 0, failed: 0 };
  for (const row of pending) {
    if (!(await repository.claimEvent(row.id, { now, staleBefore }))) continue; // another worker has it
    totals.events += 1;
    try {
      const s = await handleEvent(repository, row);
      totals.runs += s.runs; totals.failed += s.failed;
      await repository.finishEvent(row.id, row.depth > MAX_DEPTH ? `Not run: more than ${MAX_DEPTH} flow steps deep` : null);
    } catch (err) {
      const message = err?.message || String(err);
      logger.error({ err, eventId: row.id }, 'Flow event failed');
      // Retry later, until the attempts run out; then park it with its error.
      if (row.attempts + 1 >= MAX_ATTEMPTS) await repository.finishEvent(row.id, message);
      else await repository.releaseEvent(row.id, message);
    }
  }
  return totals;
}

module.exports = { processPendingEvents, MAX_DEPTH, MAX_ATTEMPTS, STALE_MS };
