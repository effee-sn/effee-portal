/**
 * Option lists and display styles for service tickets.
 *
 * The classification fields are stored as plain strings, so these presets are
 * just the dropdown choices — edit them here without any migration. Promote to
 * admin-managed lists later if needed.
 */

export const TECHNICAL_CATEGORIES = [
  'Mechanical', 'Electrical', 'Electronic', 'Software',
  'Hydraulic', 'Pneumatic', 'Instrumentation', 'Other',
];

export const SUPPORT_TYPES = [
  { value: 'REMOTE',     label: 'Remote (On-call)' },
  { value: 'SITE_VISIT', label: 'Site Visit' },
  { value: 'AT_EFFEE',   label: 'At Effee' },
];

/**
 * Source (ticket) types — display labels for the stored `ticket_type` enum.
 * The DB values stay CALL / EMAIL / DC; only the shown label differs (DC reads
 * as "Others"). Kept as a map so the value never has to change to relabel it.
 */
export const TICKET_TYPES = [
  { value: 'CALL',  label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'OTHERS', label: 'Others' },
];

export const SEVERITY_STYLE = {
  LOW:      { label: 'Low',      color: '#059669', bg: '#ECFDF5' },
  MEDIUM:   { label: 'Medium',   color: '#D97706', bg: '#FFFBEB' },
  HIGH:     { label: 'High',     color: '#DC2626', bg: '#FEF2F2' },
  CRITICAL: { label: 'Critical', color: '#7F1D1D', bg: '#FEE2E2' },
};

export const STATUS_STYLE = {
  OPEN:           { label: 'Open',          color: '#2563EB' },
  IN_PROGRESS:    { label: 'In Progress',   color: '#D97706' },
  CONTACTED:      { label: 'Contacted',     color: '#7C3AED' },
  RESOLVED:       { label: 'Resolved',      color: '#059669' },
  ON_OBSERVATION: { label: 'On Observation',color: '#0891B2' },
  CLOSED:         { label: 'Closed',        color: '#6B7280' },
  REOPENED:       { label: 'Reopened',      color: '#DC2626' },
};

export const STATUS_OPTIONS = Object.entries(STATUS_STYLE).map(([value, s]) => ({ value, label: s.label }));

export const SEVERITY_OPTIONS = Object.entries(SEVERITY_STYLE).map(([value, s]) => ({ value, label: s.label }));
