/**
 * Report / dashboard period presets. Dates are local calendar days as
 * 'YYYY-MM-DD' (inclusive on both ends). The financial year is the Indian one,
 * starting 1 April.
 */

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** @param {string} key @returns {{ from: string, to: string } | null} null for "custom" */
export function presetRange(key) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const y = today.getFullYear(); const m = today.getMonth();
  const fyStartYear = m >= 3 ? y : y - 1;
  switch (key) {
    case 'month':   return { from: iso(new Date(y, m, 1)), to: iso(today) };
    case 'quarter': return { from: iso(new Date(y, m - 2, 1)), to: iso(today) };
    case 'fy':      return { from: iso(new Date(fyStartYear, 3, 1)), to: iso(today) };
    case 'lastfy':  return { from: iso(new Date(fyStartYear - 1, 3, 1)), to: iso(new Date(fyStartYear, 2, 31)) };
    case 'year':    return { from: iso(new Date(y, m - 11, 1)), to: iso(today) };
    default:        return null;
  }
}

/** Presets for the dashboards. */
export const PRESETS = [
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'Last 3 months' },
  { key: 'fy', label: 'This FY' },
  { key: 'year', label: 'Last 12 months' },
  { key: 'custom', label: 'Custom' },
];

/** Presets for reports — adds last financial year. */
export const REPORT_PRESETS = [
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'Last 3 months' },
  { key: 'fy', label: 'This FY' },
  { key: 'lastfy', label: 'Last FY' },
  { key: 'custom', label: 'Custom' },
];
