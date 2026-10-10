'use client';

import { presetRange } from '@/lib/periods';

/**
 * Period chooser: preset buttons plus From/To dates for "Custom".
 *
 * @param {{ presets: { key: string, label: string }[], preset: string, range: { from: string, to: string },
 *   onChange: (next: { preset: string, range: { from: string, to: string } }) => void }} props
 */
export default function PeriodPicker({ presets, preset, range, onChange }) {
  const choose = (key) => onChange({ preset: key, range: presetRange(key) || range });
  const setDate = (field, value) => value && onChange({ preset, range: { ...range, [field]: value } });

  return (
    <>
      <div className="inline-flex rounded-md border border-gray-300 bg-white overflow-hidden" role="group" aria-label="Period">
        {presets.map((p) => (
          <button key={p.key} type="button" onClick={() => choose(p.key)} aria-pressed={preset === p.key}
            className={`px-3 py-1.5 text-xs font-medium border-r border-gray-200 last:border-r-0 cursor-pointer ${preset === p.key
              ? 'bg-[var(--ams-primary)] text-white' : 'text-gray-700 hover:bg-gray-50'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="date" value={range.from} max={range.to} aria-label="From"
            onChange={(e) => setDate('from', e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white" />
          <span>to</span>
          <input type="date" value={range.to} min={range.from} aria-label="To"
            onChange={(e) => setDate('to', e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white" />
        </div>
      )}
    </>
  );
}
