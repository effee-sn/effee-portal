/**
 * Option lists and display styles for the Sales module.
 *
 * Enquiry stage / source are stored as enum strings; these presets are the
 * dropdown choices and badge styling. Edit here without a migration.
 */

/** How an enquiry first reached us. */
export const ENQUIRY_SOURCES = [
  { value: 'CALL',       label: 'Call' },
  { value: 'EMAIL',      label: 'Email' },
  { value: 'WALK_IN',    label: 'Walk-in' },
  { value: 'EXHIBITION', label: 'Exhibition' },
  { value: 'REFERRAL',   label: 'Referral' },
  { value: 'WEBSITE',    label: 'Website' },
  { value: 'OTHER',      label: 'Other' },
];

export const SOURCE_LABEL = Object.fromEntries(ENQUIRY_SOURCES.map((s) => [s.value, s.label]));

/**
 * Pipeline stages a user can set directly (the active pipeline). WON / LOST are
 * reached through the Win / Lose actions, not this dropdown.
 */
export const ACTIVE_STAGES = [
  { value: 'NEW',         label: 'New' },
  { value: 'QUALIFIED',   label: 'Qualified' },
  { value: 'QUOTATION',   label: 'Quotation' },
  { value: 'NEGOTIATION', label: 'Negotiation' },
  { value: 'ON_HOLD',     label: 'On Hold' },
];

/** All stages, for filter dropdowns. */
export const ALL_STAGES = [
  ...ACTIVE_STAGES,
  { value: 'WON',  label: 'Won' },
  { value: 'LOST', label: 'Lost' },
];

/** Badge styles per stage, for list/detail display. */
export const STAGE_STYLE = {
  NEW:         { label: 'New',         color: '#1D4ED8', bg: '#EFF6FF' },
  QUALIFIED:   { label: 'Qualified',   color: '#7C3AED', bg: '#F5F3FF' },
  QUOTATION:   { label: 'Quotation',   color: '#0891B2', bg: '#ECFEFF' },
  NEGOTIATION: { label: 'Negotiation', color: '#D97706', bg: '#FFFBEB' },
  ON_HOLD:     { label: 'On Hold',     color: '#6B7280', bg: '#F3F4F6' },
  WON:         { label: 'Won',         color: '#15803D', bg: '#F0FDF4' },
  LOST:        { label: 'Lost',        color: '#DC2626', bg: '#FEF2F2' },
};

/** Formats a number as Indian-rupee currency for display. */
export function formatINR(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
}
