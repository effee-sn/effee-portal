/**
 * Option lists and display styles for the Sales module.
 *
 * Enquiry type / stage / temperature are stored as enum strings; these presets
 * are the dropdown choices and badge styling. Edit here without a migration.
 */

/** How an enquiry originated. */
export const ENQUIRY_TYPES = [
  { value: 'GENERATED', label: 'Generated (site visit)' },
  { value: 'INCOMING',  label: 'Incoming (inbound)' },
];

export const TYPE_LABEL = Object.fromEntries(ENQUIRY_TYPES.map((t) => [t.value, t.label]));

/**
 * Pipeline stages a user can set directly. WON / LOST are reached through the
 * Win / Lose actions, not this list.
 */
export const ACTIVE_STAGES = [
  { value: 'NEW',            label: 'New' },
  { value: 'CONTACTED',      label: 'Contacted' },
  { value: 'REVIEW',         label: 'Review' },
  { value: 'CONCEPT',        label: 'Concept' },
  { value: 'COSTING',        label: 'Costing' },
  { value: 'OFFER_RELEASED', label: 'Offer Released' },
  { value: 'FOLLOW_UP',      label: 'Follow-up' },
];

/** All stages, for filter dropdowns. */
export const ALL_STAGES = [
  ...ACTIVE_STAGES,
  { value: 'WON',  label: 'Won' },
  { value: 'LOST', label: 'Lost' },
];

/**
 * Stages selectable for a given enquiry type. A GENERATED enquiry skips
 * CONTACTED (field sales already interacted).
 * @param {string} type
 */
export function stagesForType(type) {
  return type === 'GENERATED' ? ACTIVE_STAGES.filter((s) => s.value !== 'CONTACTED') : ACTIVE_STAGES;
}

/** Badge styles per stage, for list/detail display. */
export const STAGE_STYLE = {
  NEW:            { label: 'New',            color: '#1D4ED8', bg: '#EFF6FF' },
  CONTACTED:      { label: 'Contacted',      color: '#4F46E5', bg: '#EEF2FF' },
  REVIEW:         { label: 'Review',         color: '#7C3AED', bg: '#F5F3FF' },
  CONCEPT:        { label: 'Concept',        color: '#0891B2', bg: '#ECFEFF' },
  COSTING:        { label: 'Costing',        color: '#0D9488', bg: '#F0FDFA' },
  OFFER_RELEASED: { label: 'Offer Released', color: '#D97706', bg: '#FFFBEB' },
  FOLLOW_UP:      { label: 'Follow-up',      color: '#EA580C', bg: '#FFF7ED' },
  WON:            { label: 'Won',            color: '#15803D', bg: '#F0FDF4' },
  LOST:           { label: 'Lost',           color: '#DC2626', bg: '#FEF2F2' },
};

/** Interaction / follow-up medium (maps to the ActivityType enum). */
export const ACTIVITY_MEDIUMS = [
  { value: 'CALL',       label: 'Call' },
  { value: 'MEETING',    label: 'Meeting' },
  { value: 'TEAMS',      label: 'Teams' },
  { value: 'SITE_VISIT', label: 'Site Visit' },
  { value: 'EMAIL',      label: 'Email' },
];

export const MEDIUM_LABEL = Object.fromEntries(ACTIVITY_MEDIUMS.map((m) => [m.value, m.label]));

/** Follow-up temperature. */
export const TEMPERATURES = [
  { value: 'HOT',  label: 'Hot' },
  { value: 'WARM', label: 'Warm' },
  { value: 'COLD', label: 'Cold' },
];

export const TEMPERATURE_STYLE = {
  HOT:  { label: 'Hot',  color: '#DC2626', bg: '#FEF2F2' },
  WARM: { label: 'Warm', color: '#D97706', bg: '#FFFBEB' },
  COLD: { label: 'Cold', color: '#2563EB', bg: '#EFF6FF' },
};

/** Ordinal rank of a stage, for "have we reached X yet" comparisons. */
export const STAGE_RANK = {
  NEW: 0, CONTACTED: 1, REVIEW: 2, CONCEPT: 3, COSTING: 4, OFFER_RELEASED: 5, FOLLOW_UP: 6, WON: 7, LOST: 7,
};

/**
 * Which document kinds are relevant by a given stage — the format is always
 * available; concept, costing and offers appear once the enquiry reaches those
 * stages, so earlier stages aren't cluttered with documents that don't apply yet.
 * @param {string} stage
 */
export function visibleDocKinds(stage) {
  const r = STAGE_RANK[stage] ?? 0;
  const kinds = ['FORMAT_PDF', 'FORMAT_EXCEL'];
  if (r >= STAGE_RANK.CONCEPT) kinds.push('CONCEPT', 'POWER_CALC');
  if (r >= STAGE_RANK.COSTING) kinds.push('COSTING');
  if (r >= STAGE_RANK.OFFER_RELEASED) kinds.push('OFFER');
  return kinds;
}

/**
 * How many days an enquiry may sit in a stage before it's flagged as aging.
 * WON / LOST are terminal and never age.
 */
export const STAGE_AGING_DAYS = {
  NEW: 3, CONTACTED: 3, REVIEW: 4, CONCEPT: 5, COSTING: 5, OFFER_RELEASED: 7, FOLLOW_UP: 10,
};

/** Whole days the enquiry has been in its current stage. */
export function stageAgeDays(stageSince) {
  if (!stageSince) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(stageSince).getTime()) / 86400000));
}

/** True when the current stage has aged past its threshold. */
export function isAging(stage, stageSince) {
  const threshold = STAGE_AGING_DAYS[stage];
  if (!threshold) return false;
  return stageAgeDays(stageSince) >= threshold;
}

/** Formats a number as Indian-rupee currency for display. */
export function formatINR(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
}
