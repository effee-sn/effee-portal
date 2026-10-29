const { flowEngineRepository } = require('./flowengine.repository');
const { logger } = require('../../core');

/**
 * How modules tell the flow engine something happened: one outbox row per
 * event, written right after the action succeeds. The engine picks the rows
 * up in the background (see dispatcher), so the user's action is never slowed
 * or broken by a flow — a failure to record is logged, never thrown.
 */

/**
 * @param {object} e
 * @param {string} e.module       e.g. SALES
 * @param {string} e.type         an event key from the module's catalog
 * @param {string} e.entityType   e.g. Enquiry
 * @param {number|string} e.entityId
 * @param {object} [e.payload]    event details (e.g. { from, to })
 * @param {number|null} [e.actorId]
 * @param {number} [e.depth]      flow steps that led here (loop guard)
 * @param {number|null} [e.originFlowId] the flow whose step caused it
 */
async function emitFlowEvent({ module, type, entityType, entityId, payload, actorId = null, depth = 0, originFlowId = null }) {
  try {
    await flowEngineRepository.addEvent({
      module,
      type,
      entity_type: entityType,
      entity_id: String(entityId),
      payload: payload ? JSON.stringify(payload) : null,
      actor_id: actorId,
      depth,
      origin_flow_id: originFlowId,
    });
  } catch (err) {
    logger.error({ err, module, type, entityId }, 'Flow event not recorded');
  }
}

module.exports = { emitFlowEvent };
