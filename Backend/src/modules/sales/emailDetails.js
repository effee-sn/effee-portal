/**
 * Content for sales notification emails: the key facts of an enquiry as
 * label/value rows, and what the recipient should do next at each stage.
 * (The in-app bell keeps its one-line title; only the email gets this.)
 */

const STAGE = Object.freeze({
  NEW: 'New', CONTACTED: 'Contacted', REVIEW: 'Review', CONCEPT: 'Concept', COSTING: 'Costing',
  COSTING_REVIEW: 'Costing Review', OFFER_RELEASED: 'Offer', FOLLOW_UP: 'Follow-up',
  NEGOTIATION: 'Negotiation', NEGOTIATION_FOLLOW_UP: 'Negotiation Follow-up', WON: 'Won', LOST: 'Lost',
});

/** What the person now holding the enquiry should do. */
const NEXT_STEP = Object.freeze({
  NEW: 'Gather the requirement and upload the enquiry format.',
  CONTACTED: 'Complete the requirement and upload the enquiry format, then move it to Review.',
  REVIEW: 'Hold the internal review meeting and record it on the enquiry.',
  CONCEPT: 'Prepare the concept and the power-source calculation.',
  COSTING: 'Prepare the costing.',
  COSTING_REVIEW: 'Review and approve the costing.',
  OFFER_RELEASED: 'Prepare the offer and mark it as sent to the customer.',
  FOLLOW_UP: 'Follow up with the customer on the offer.',
  NEGOTIATION: 'Prepare the revised offer.',
  NEGOTIATION_FOLLOW_UP: 'Follow up with the customer on the revised offer.',
});

const stageName = (s) => STAGE[s] || s;

/** "₹4,20,000.00" / "$50,000.00" — the enquiry's own currency. */
function money(value, code = 'INR', symbol) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  const digits = n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${digits}` : `${code} ${digits}`;
}

/** Sentence-case a note fragment and end it with a full stop. */
function sentence(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/**
 * The standard rows for an enquiry (missing values are dropped by the template).
 * @param {object} e enquiry with customer / owner / currency loaded where available
 * @param {Array<[string, string]>} [extra] rows appended after the standard ones
 */
function enquiryRows(e, extra = []) {
  return [
    ['Enquiry', `${e.ref_no} — ${e.title}`],
    ['Customer', e.customer?.name],
    ['Stage', stageName(e.stage)],
    ['Expected value', money(e.expected_value, e.currency_code, e.currency?.symbol)],
    ['Owner', e.owner?.name],
    ...extra,
  ];
}

module.exports = { STAGE, NEXT_STEP, stageName, money, sentence, enquiryRows };
