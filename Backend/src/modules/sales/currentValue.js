const prisma = require('../../lib/prisma');
const { toInr, paise } = require('../master/fx');

/**
 * An enquiry's current value — the most confirmed figure there is, the one
 * every pipeline total, list and report uses:
 *
 *   1. Won                → the PO (order) value, at the rate locked when won;
 *   2. an offer was sent  → the latest offer sent to the customer (a revised
 *                           offer at Negotiation replaces the first), at the
 *                           rate locked when it was sent;
 *   3. otherwise          → the expected value, at today's rate.
 *
 * Only offers *sent* count: a priced draft is not a commitment yet. Offers
 * unmarked as sent or deleted drop out. All amounts are in the enquiry's own
 * currency (it cannot change once an offer is priced).
 */

/** Stages an offer uploaded at is a negotiated (revised) price. */
const NEGOTIATED_AT = new Set(['NEGOTIATION', 'NEGOTIATION_FOLLOW_UP']);

/** basis → label shown next to the amount. */
const BASIS_LABEL = Object.freeze({ PO: 'PO', NEGOTIATION: 'Negotiation', OFFER: 'Offer', EXPECTED: 'Expected' });

/**
 * The latest sent, priced offer on each enquiry.
 * @param {number[]} enquiryIds
 * @returns {Promise<Map<number, { offer_value: unknown, offer_fx_rate: unknown, sent_at: Date, stage: string|null, version: number }>>}
 */
async function latestSentOffers(enquiryIds, db = prisma) {
  const out = new Map();
  if (!enquiryIds.length) return out;
  const rows = await db.enquiryAttachment.findMany({
    where: { kind: 'OFFER', deleted_at: null, offer_value: { not: null }, sent_at: { not: null }, enquiry_id: { in: enquiryIds } },
    select: { enquiry_id: true, offer_value: true, offer_fx_rate: true, sent_at: true, stage: true, version: true },
    orderBy: [{ sent_at: 'desc' }, { id: 'desc' }],
  });
  for (const r of rows) if (!out.has(r.enquiry_id)) out.set(r.enquiry_id, r);
  return out;
}

/**
 * The latest sent offer of each round on each enquiry: `offer` (sent before
 * negotiation) and `negotiated` (a revision sent at Negotiation).
 * @param {number[]} enquiryIds
 * @returns {Promise<Map<number, { offer?: object, negotiated?: object }>>}
 */
async function sentOffersByRound(enquiryIds, db = prisma) {
  const out = new Map();
  if (!enquiryIds.length) return out;
  const rows = await db.enquiryAttachment.findMany({
    where: { kind: 'OFFER', deleted_at: null, offer_value: { not: null }, sent_at: { not: null }, enquiry_id: { in: enquiryIds } },
    select: { enquiry_id: true, offer_value: true, offer_fx_rate: true, sent_at: true, stage: true, version: true },
    orderBy: [{ sent_at: 'desc' }, { id: 'desc' }],
  });
  for (const r of rows) {
    const round = NEGOTIATED_AT.has(r.stage) ? 'negotiated' : 'offer';
    const e = out.get(r.enquiry_id) || {};
    if (!e[round]) e[round] = r;
    out.set(r.enquiry_id, e);
  }
  return out;
}

/**
 * Every figure of an enquiry, each in its own currency and in the display
 * currency — expected (today's rate), offer and negotiated (rate locked when
 * sent), PO (rate locked when won) — for the enquiries list.
 */
function allValues(e, rounds, rates, conv) {
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const shown = (amount, locked, on) => (amount === null ? null : paise(conv.convert(amount, e.currency_code, rates, locked, on)));
  const offer = num(rounds?.offer?.offer_value);
  const negotiated = num(rounds?.negotiated?.offer_value);
  const po = e.stage === 'WON' ? num(e.order_value) : null;
  return {
    expected_value_display: shown(num(e.expected_value), null, null),
    offer_sent_value: offer,
    offer_sent_display: shown(offer, num(rounds?.offer?.offer_fx_rate), rounds?.offer?.sent_at),
    negotiated_value: negotiated,
    negotiated_display: shown(negotiated, num(rounds?.negotiated?.offer_fx_rate), rounds?.negotiated?.sent_at),
    po_value: po,
    po_display: shown(po, num(e.order_fx_rate), e.won_at),
  };
}

/**
 * @param {{ stage: string, expected_value?: unknown, order_value?: unknown, order_fx_rate?: unknown, won_at?: Date|null, currency_code?: string }} e
 * @param {object|undefined} offer  its latest sent offer (see latestSentOffers)
 * @returns {{ amount: number|null, basis: 'PO'|'NEGOTIATION'|'OFFER'|'EXPECTED'|null, currency: string, lockedRate: number|null, onDate: Date|null }}
 */
function currentValue(e, offer) {
  const currency = e.currency_code || 'INR';
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  if (e.stage === 'WON' && num(e.order_value) !== null) {
    return { amount: num(e.order_value), basis: 'PO', currency, lockedRate: num(e.order_fx_rate), onDate: e.won_at ?? null };
  }
  if (offer && num(offer.offer_value) !== null) { // (also a won deal recorded without a PO value)
    return {
      amount: num(offer.offer_value), basis: NEGOTIATED_AT.has(offer.stage) ? 'NEGOTIATION' : 'OFFER',
      currency, lockedRate: num(offer.offer_fx_rate), onDate: offer.sent_at,
    };
  }
  const expected = num(e.expected_value);
  return { amount: expected, basis: expected === null ? null : 'EXPECTED', currency, lockedRate: null, onDate: null };
}

/** In rupees (paise-rounded); null when there is no amount. */
function inInr(cv, rates) {
  return cv.amount === null ? null : paise(toInr(cv.amount, cv.currency, rates, cv.lockedRate));
}

/** In a display currency (see master/fx displayConverter); null when there is no amount. */
function inDisplay(cv, conv, rates) {
  return cv.amount === null ? null : paise(conv.convert(cv.amount, cv.currency, rates, cv.lockedRate, cv.onDate));
}

/**
 * Fields to add to an enquiry row: current_value (own currency), its basis and
 * label, in INR, and — given a converter — in the display currency.
 */
function valueFields(e, offer, rates, conv) {
  const cv = currentValue(e, offer);
  return {
    current_value: cv.amount,
    current_value_basis: cv.basis,
    current_value_label: cv.basis ? BASIS_LABEL[cv.basis] : null,
    current_value_inr: inInr(cv, rates),
    ...(conv ? { current_value_display: inDisplay(cv, conv, rates) } : {}),
  };
}

module.exports = { latestSentOffers, sentOffersByRound, allValues, currentValue, inInr, inDisplay, valueFields, BASIS_LABEL, NEGOTIATED_AT };
