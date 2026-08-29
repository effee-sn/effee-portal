/**
 * Prerequisite gates for advancing an enquiry. Pure rules over a set of
 * document flags, so the same logic backs both the API enforcement and the
 * readiness the UI shows before you try to move.
 */

/**
 * @typedef {object} DocFlags
 * @property {boolean} hasFormat   An enquiry-format document (PDF or Excel) exists.
 * @property {boolean} hasConcept  A live concept document exists.
 * @property {boolean} hasCosting  A live costing document exists.
 * @property {boolean} hasSentOffer An offer document is marked sent to the customer.
 * @property {boolean} hasActivity At least one interaction/activity is logged.
 */

// The enquiry format is required from Review onward. (Contacted, for Incoming,
// is reached on the first logged activity — see EXTRA_GATES.CONTACTED — so it
// doesn't require the format.)
const FORMAT_STAGES = ['REVIEW', 'CONCEPT', 'COSTING', 'OFFER_RELEASED', 'FOLLOW_UP', 'WON'];

// Additional, stage-specific requirements.
const EXTRA_GATES = Object.freeze({
  // Incoming enquiries do their information-gathering at New before Contacted.
  CONTACTED: (f) => (f.hasActivity ? [] : ['at least one logged activity']),
  OFFER_RELEASED: (f) => {
    const missing = [];
    if (!f.hasConcept) missing.push('a concept document');
    if (!f.hasCosting) missing.push('a costing document');
    return missing;
  },
  WON: (f) => (f.hasSentOffer ? [] : ['an offer marked sent to the customer']),
});

/** Stages that can be blocked — used to build the UI readiness map. */
const GATED_STAGES = Object.freeze([...new Set([...FORMAT_STAGES, ...Object.keys(EXTRA_GATES)])]);

/**
 * What's still missing before an enquiry may enter `targetStage`.
 * @param {string} targetStage
 * @param {DocFlags} flags
 * @returns {string[]} empty when the move is allowed
 */
function missingForStage(targetStage, flags) {
  const missing = [];
  if (FORMAT_STAGES.includes(targetStage) && !flags.hasFormat) {
    missing.push('the enquiry format (PDF or Excel)');
  }
  if (EXTRA_GATES[targetStage]) missing.push(...EXTRA_GATES[targetStage](flags));
  return missing;
}

module.exports = { GATED_STAGES, missingForStage };
