/**
 * What each module offers the flow engine: its events (what a flow can start
 * on), its stages, the fields a condition can test, the words a message can
 * use, and how to load a record and link to it. The builder's dropdowns come
 * from here, and publishing checks a flow against it — so a flow can only name
 * things the code knows, and renaming one in code shows up as a publish error,
 * not a silent break.
 */

/** Sales stages in flow order, with the names users see. */
const SALES_STAGES = Object.freeze([
  { key: 'NEW', label: 'New' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'REVIEW', label: 'Review' },
  { key: 'CONCEPT', label: 'Concept' },
  { key: 'COSTING', label: 'Costing' },
  { key: 'COSTING_REVIEW', label: 'Costing Review' },
  { key: 'OFFER_RELEASED', label: 'Offer' },
  { key: 'FOLLOW_UP', label: 'Follow-up' },
  { key: 'NEGOTIATION', label: 'Negotiation' },
  { key: 'NEGOTIATION_FOLLOW_UP', label: 'Negotiation Follow-up' },
  { key: 'WON', label: 'Won' },
  { key: 'LOST', label: 'Lost' },
]);

/** Sales events. `payload` lists what the event carries besides the enquiry. */
const SALES_EVENTS = Object.freeze([
  { key: 'ENQUIRY_CREATED', label: 'Enquiry created', payload: [] },
  { key: 'STAGE_ENTERED', label: 'Enquiry enters a stage', payload: ['from', 'to', 'auto'] },
  { key: 'OFFER_SENT', label: 'Offer marked sent', payload: ['attachment_id', 'offer_value', 'offer_value_inr', 'version', 'cost_value', 'cost_value_inr', 'margin', 'margin_inr', 'margin_pct', 'markup_pct'] },
  { key: 'ENQUIRY_WON', label: 'Enquiry won', payload: ['from', 'order_value', 'order_value_inr'] },
  { key: 'ENQUIRY_LOST', label: 'Enquiry lost', payload: ['from', 'lost_reason', 'lost_to'] },
  { key: 'ENQUIRY_REOPENED', label: 'Enquiry reopened', payload: ['from'] },
  { key: 'ENQUIRY_REASSIGNED', label: 'Enquiry reassigned', payload: ['owner', 'handler'] },
  { key: 'ACTIVITY_LOGGED', label: 'Activity or review logged', payload: ['activity_id', 'type', 'is_review'] },
  { key: 'DOCUMENT_UPLOADED', label: 'Document uploaded', payload: ['attachment_id', 'kind'] },
  { key: 'STAGE_STALLED', label: 'Enquiry stalled in a stage', payload: ['stage', 'days'] },
  // "Before …" events: a flow on one of these runs at the moment of the action
  // and can hold it for approval (guard: true). Not reported to the outbox.
  { key: 'BEFORE_STAGE_MOVE', label: 'Before moving to a stage', guard: true, action: 'Move to', payload: ['from', 'to'] },
  { key: 'BEFORE_OFFER_SENT', label: 'Before marking an offer sent', guard: true, action: 'Mark offer sent', payload: ['attachment_id', 'offer_value', 'offer_value_inr', 'version', 'cost_value', 'cost_value_inr', 'margin', 'margin_inr', 'margin_pct', 'markup_pct'] },
  { key: 'BEFORE_WON', label: 'Before marking won', guard: true, action: 'Mark won', payload: ['from', 'order_value', 'order_value_inr'] },
  { key: 'BEFORE_LOST', label: 'Before marking lost', guard: true, action: 'Mark lost', payload: ['from', 'lost_reason', 'lost_to'] },
  { key: 'BEFORE_REOPEN', label: 'Before reopening', guard: true, action: 'Reopen', payload: ['from'] },
]);

const opt = (pairs) => pairs.map(([key, label]) => ({ key, label }));

/**
 * Fields a condition (If block) can test. `type` decides the operators:
 * number, boolean, text, enum (fixed options), stage, ref (a record picked from
 * a list: user, customer, application). `event.*` fields come from the event
 * itself and are offered only for the events listed.
 */
const SALES_FIELDS = Object.freeze([
  { key: 'stage', label: 'Stage', type: 'stage' },
  { key: 'enquiry_type', label: 'Enquiry type', type: 'enum', options: opt([['GENERATED', 'Generated'], ['INCOMING', 'Incoming']]) },
  { key: 'is_refurbishment', label: 'Refurbishment', type: 'boolean' },
  { key: 'value_inr', label: 'Value (₹) — order once won, else expected', type: 'number' },
  { key: 'expected_value_inr', label: 'Expected value (₹)', type: 'number' },
  { key: 'order_value_inr', label: 'Order value (₹)', type: 'number' },
  { key: 'final_cost_inr', label: 'Costing value (₹)', type: 'number' },
  { key: 'temperature', label: 'Temperature', type: 'enum', options: opt([['HOT', 'Hot'], ['WARM', 'Warm'], ['COLD', 'Cold']]) },
  { key: 'application_id', label: 'Application', type: 'ref', ref: 'application' },
  { key: 'customer_id', label: 'Customer', type: 'ref', ref: 'customer' },
  { key: 'owner_id', label: 'Owner', type: 'ref', ref: 'user' },
  { key: 'currency_code', label: 'Currency', type: 'text' },
  { key: 'event.from', label: 'Came from stage', type: 'stage', events: ['STAGE_ENTERED', 'ENQUIRY_WON', 'ENQUIRY_LOST', 'ENQUIRY_REOPENED', 'BEFORE_STAGE_MOVE', 'BEFORE_WON', 'BEFORE_LOST', 'BEFORE_REOPEN'] },
  { key: 'event.to', label: 'Entered stage', type: 'stage', events: ['STAGE_ENTERED', 'BEFORE_STAGE_MOVE'] },
  { key: 'event.offer_value_inr', label: 'Offer value (₹)', type: 'number', events: ['OFFER_SENT', 'BEFORE_OFFER_SENT'] },
  // Margin over the final costing value (empty when no costing value is entered).
  { key: 'event.cost_value_inr', label: 'Costing value (₹)', type: 'number', events: ['OFFER_SENT', 'BEFORE_OFFER_SENT'] },
  { key: 'event.margin_inr', label: 'Margin (₹)', type: 'number', events: ['OFFER_SENT', 'BEFORE_OFFER_SENT'] },
  { key: 'event.margin_pct', label: 'Margin % of offer', type: 'number', events: ['OFFER_SENT', 'BEFORE_OFFER_SENT'] },
  { key: 'event.markup_pct', label: 'Margin % on cost', type: 'number', events: ['OFFER_SENT', 'BEFORE_OFFER_SENT'] },
  { key: 'event.order_value_inr', label: 'Order value (₹)', type: 'number', events: ['ENQUIRY_WON', 'BEFORE_WON'] },
  { key: 'event.lost_reason', label: 'Lost reason', type: 'text', events: ['ENQUIRY_LOST', 'BEFORE_LOST'] },
  { key: 'event.kind', label: 'Document kind', type: 'enum', events: ['DOCUMENT_UPLOADED'], options: opt([
    ['FORMAT_PDF', 'Enquiry format (PDF)'], ['FORMAT_EXCEL', 'Enquiry format (Excel)'], ['CONCEPT', 'Concept'], ['POWER_CALC', 'Power-source calculation'],
    ['COSTING', 'Costing'], ['COSTING_REVIEW', 'Costing review'], ['OFFER', 'Offer'],
  ]) },
  { key: 'event.type', label: 'Activity type', type: 'enum', events: ['ACTIVITY_LOGGED'], options: opt([
    ['CALL', 'Call'], ['MEETING', 'Meeting'], ['TEAMS', 'Teams'], ['SITE_VISIT', 'Site visit'], ['EMAIL', 'Email'],
  ]) },
  { key: 'event.is_review', label: 'Is a review', type: 'boolean', events: ['ACTIVITY_LOGGED'] },
  { key: 'event.days', label: 'Days in stage', type: 'number', events: ['STAGE_STALLED'] },
]);

/** Words a Notify message can use as {{word}}. */
const SALES_WORDS = Object.freeze([
  'ref_no', 'title', 'customer', 'stage_label', 'owner', 'handler', 'application', 'value_inr',
  'event.from', 'event.to', 'event.lost_reason', 'event.lost_to', 'event.offer_value_inr', 'event.order_value_inr', 'event.days',
  'event.cost_value_inr', 'event.margin_inr', 'event.margin_pct', 'event.markup_pct',
  // After an Approval: who decided and what they said.
  'approval.decided_by', 'approval.comment', 'approval.status',
]);

const CATALOGS = Object.freeze({
  SALES: Object.freeze({
    module: 'SALES',
    label: 'Sales',
    entityType: 'Enquiry',
    events: SALES_EVENTS,
    stages: SALES_STAGES,
    fields: SALES_FIELDS,
    words: SALES_WORDS,
    // Required lazily: Sales depends on the engine, not the reverse, at load.
    /** The enquiry as flows see it. */
    loadEntity: (id) => require('../sales/flowFacts').loadEnquiryFacts(id),
    /** Open enquiries each person holds (for "least busy"). */
    openLoad: (userIds) => require('../sales/flowFacts').openEnquiryCounts(userIds),
    /** Who held it when it last entered a stage (for "same person as at stage"). */
    heldAtStage: (id, stage) => require('../sales/flowFacts').handlerAtStage(id, stage),
    emailRows: (facts) => require('../sales/flowFacts').enquiryEmailRows(facts),
    /** The Internal Sales person set in Flow Builder → Sales → Setup (or null). */
    setupHandler: () => require('../sales/workflow.repository').workflowRepository.internalUserId(),
    setupHandlerLabel: 'The Internal Sales person (Setup)',
    /** id → "ENQ-2026-0016 · Title" (the run log). */
    labelsFor: (ids) => require('../sales/flowFacts').enquiryLabels(ids),
    /** Open records at these stages (for "move current enquiries?"). */
    openRecordsAt: (stages) => require('../sales/flowFacts').openEnquiriesAt(stages),
    /** Hands an open record to who a flow now assigns (a flow change moving current work). */
    applyAssignment: (id, assignment, actor, note) => require('../sales/enquiry.service').enquiryService.applyFlowAssignment(id, assignment, actor, note),
    linkFor: (id) => `/dashboard/sales/enquiries/${id}`,
    eyebrow: 'Sales',
  }),
});

/** @param {string} module */
function catalogFor(module) {
  return CATALOGS[module] || null;
}

const MODULES = Object.freeze(Object.keys(CATALOGS));

/** The catalog without its functions — what the builder receives. */
function publicCatalog(module) {
  const c = catalogFor(module);
  if (!c) return null;
  return Object.fromEntries(Object.entries(c).filter(([, v]) => typeof v !== 'function'));
}

module.exports = { catalogFor, publicCatalog, MODULES, SALES_STAGES, SALES_EVENTS, SALES_FIELDS };
