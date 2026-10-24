'use client';

import { PAGE_SIZES } from '@/lib/usePageSize';

/** "20 / page" — the rows-per-page dropdown shown next to a list's pager. */
export default function PageSizeSelect({ value, onChange }) {
  return (
    <label className="flex items-center shrink-0">
      <span className="sr-only">Rows per page</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} title="Rows per page"
        className="py-1 pl-1.5 pr-1 text-xs text-gray-600 border border-gray-300 rounded bg-white outline-none cursor-pointer">
        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
      </select>
    </label>
  );
}
