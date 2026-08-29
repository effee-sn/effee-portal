/**
 * Prerequisite gates for advancing an enquiry. Pure rules over a set of
 * document flags, so the same logic backs both the API enforcement and the
 * readiness the UI shows before you try to move.
 */

/**
 * @typedef {object} DocFlags
 * @property {boolean} hasConcept  A live concept document exists.
 * @property {boolean} hasCosting  A live costing document exists.
 * @property {boolean} hasSentOffer An offer document is marked sent to the customer.
 */

/** target stage → (flags) => list of unmet requirement phrases. */
const GATES = Object.freeze({
  OFFER_RELEASED: (f) => {
    const missing = [];
    if (!f.hasConcept) missing.push('a concept document');
    if (!f.hasCosting) missing.push('a costing document');
    return missing;
  },
  WON: (f) => (f.hasSentOffer ? [] : ['an offer marked sent to the customer']),
});

/**
 * What's still missing before an enquiry may enter `targetStage`.
 * @param {string} targetStage
 * @param {DocFlags} flags
 * @returns {string[]} empty when the move is allowed
 */
function missingForStage(targetStage, flags) {
  const rule = GATES[targetStage];
  return rule ? rule(flags) : [];
}

module.exports = { GATES, missingForStage };
