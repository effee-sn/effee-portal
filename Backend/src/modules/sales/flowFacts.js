const prisma = require('../../lib/prisma');
const { loadRates, toInr, paise } = require('../master/fx');

/**
 * An enquiry as Flow Builder flows see it: the fields a flow's conditions can
 * test and its messages can show (see the Sales catalog in flowengine). Values
 * are in rupees so one limit ("above ₹50 Lakh") works for every currency.
 */

const STAGE_LABEL = Object.freeze({
  NEW: 'New', CONTACTED: 'Contacted', REVIEW: 'Review', CONCEPT: 'Concept', COSTING: 'Costing',
  COSTING_REVIEW: 'Costing Review', OFFER_RELEASED: 'Offer', FOLLOW_UP: 'Follow-up', NEGOTIATION: 'Negotiation',
  NEGOTIATION_FOLLOW_UP: 'Negotiation Follow-up', WON: 'Won', LOST: 'Lost',
});

/**
 * @param {number|string} id
 * @returns {Promise<object|null>} null when the enquiry is gone
 */
async function loadEnquiryFacts(id) {
  const e = await prisma.enquiry.findFirst({
    where: { id: Number(id), deleted_at: null },
    select: {
      id: true, ref_no: true, title: true, stage: true, enquiry_type: true, is_refurbishment: true, currency_code: true,
      expected_value: true, order_value: true, order_fx_rate: true, final_cost: true, application_id: true, customer_id: true,
      owner_id: true, handler_id: true, created_by: true, current_temperature: true,
      customer: { select: { name: true } }, owner: { select: { name: true } }, handler: { select: { name: true } },
      application: { select: { name: true } },
    },
  });
  if (!e) return null;
  const rates = await loadRates();
  const expected = e.expected_value === null ? null : paise(toInr(e.expected_value, e.currency_code, rates));
  const order = e.order_value === null ? null : paise(toInr(e.order_value, e.currency_code, rates, e.order_fx_rate));
  return {
    id: e.id,
    ref_no: e.ref_no,
    title: e.title,
    stage: e.stage,
    stage_label: STAGE_LABEL[e.stage] || e.stage,
    enquiry_type: e.enquiry_type,
    is_refurbishment: e.is_refurbishment,
    currency_code: e.currency_code,
    // The deal's value: the order once won, else the expected value.
    value_inr: e.stage === 'WON' && order !== null ? order : expected,
    expected_value_inr: expected,
    order_value_inr: order,
    final_cost_inr: e.final_cost === null ? null : paise(toInr(e.final_cost, e.currency_code, rates)),
    application_id: e.application_id,
    application: e.application?.name ?? null,
    customer_id: e.customer_id,
    customer: e.customer?.name ?? null,
    owner_id: e.owner_id,
    owner: e.owner?.name ?? null,
    handler_id: e.handler_id,
    handler: e.handler?.name ?? null,
    created_by: e.created_by,
    temperature: e.current_temperature,
  };
}

/**
 * How many open enquiries each of these people holds now — for "least busy".
 * @param {number[]} userIds
 * @returns {Promise<Map<number, number>>}
 */
async function openEnquiryCounts(userIds) {
  if (!userIds.length) return new Map();
  const rows = await prisma.enquiry.groupBy({
    by: ['handler_id'],
    where: { handler_id: { in: userIds }, deleted_at: null, stage: { notIn: ['WON', 'LOST'] } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.handler_id, r._count._all]));
}

/** Who held the enquiry the last time it entered `stage` (null if never, or not recorded). */
async function handlerAtStage(enquiryId, stage) {
  const row = await prisma.enquiryStageEvent.findFirst({
    where: { enquiry_id: Number(enquiryId), to_stage: stage, handler_id: { not: null } },
    orderBy: { id: 'desc' },
    select: { handler_id: true },
  });
  return row?.handler_id ?? null;
}

/** Open enquiries at these stages, with who holds them — for "move current enquiries?" after a publish. */
async function openEnquiriesAt(stages) {
  return prisma.enquiry.findMany({
    where: { deleted_at: null, stage: { in: stages } },
    select: {
      id: true, ref_no: true, title: true, stage: true, owner_id: true, handler_id: true, queue_department_id: true,
      handler: { select: { name: true } }, customer: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
  });
}

/** id → "ENQ-2026-0016 · Title", for the run log. */
async function enquiryLabels(ids) {
  const want = [...new Set(ids.map(Number).filter(Boolean))];
  if (!want.length) return new Map();
  const rows = await prisma.enquiry.findMany({ where: { id: { in: want } }, select: { id: true, ref_no: true, title: true } });
  return new Map(rows.map((e) => [String(e.id), `${e.ref_no} · ${e.title}`]));
}

/** The enquiry lines a flow's email shows. */
function enquiryEmailRows(f) {
  return [
    ['Enquiry', f.ref_no], ['Title', f.title], ['Customer', f.customer], ['Stage', f.stage_label],
    ['Owner', f.owner], ['With', f.handler],
  ];
}

module.exports = { loadEnquiryFacts, openEnquiryCounts, handlerAtStage, openEnquiriesAt, enquiryLabels, enquiryEmailRows, STAGE_LABEL };
