const { emitFlowEvent } = require('../flowengine/events');

/**
 * Tells the flow engine what just happened to an enquiry, so Flow Builder
 * flows can react. Event keys are the Sales catalog's (flowengine/catalog.js).
 * Called after the action has succeeded; never throws.
 *
 * @param {string} type      e.g. STAGE_ENTERED, ENQUIRY_WON
 * @param {number} enquiryId
 * @param {{ id?: number|null }|null|undefined} actor
 * @param {object} [payload] event details (e.g. { from, to })
 */
function salesEvent(type, enquiryId, actor, payload) {
  return emitFlowEvent({ module: 'SALES', type, entityType: 'Enquiry', entityId: enquiryId, payload, actorId: actor?.id ?? null });
}

module.exports = { salesEvent };
