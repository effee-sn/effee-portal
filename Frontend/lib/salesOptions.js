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

/** Formats a number as Indian-rupee currency for display. */
export function formatINR(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
}
