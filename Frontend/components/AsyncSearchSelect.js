'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A dropdown that searches the server as you type and shows results 10 at a
 * time, with "Show more" for the rest — for lists too long to load at once.
 *
 * @param {object} props
 * @param {string} props.value       the selected value ('' = none)
 * @param {(value: string) => void} props.onChange
 * @param {(q: string, skip: number) => Promise<{ items: any[], has_more: boolean }>} props.fetchPage
 * @param {(item: any) => string} props.getValue
 * @param {(item: any) => { label: string, sub?: string }} props.describe
 * @param {string} [props.placeholder]   shown when nothing is selected
 * @param {string} [props.searchPlaceholder]
 * @param {boolean} [props.invalid]      red border
 */
export default function AsyncSearchSelect({
  value, onChange, fetchPage, getValue, describe,
  placeholder = '— Select —', searchPlaceholder = 'Type to search…', invalid = false,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  // First page for the current search, a moment after typing stops.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetchRef.current(q, 0);
        if (!cancelled) { setItems(r.items || []); setHasMore(Boolean(r.has_more)); }
      } catch { if (!cancelled) { setItems([]); setHasMore(false); } }
      finally { if (!cancelled) setBusy(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const more = async () => {
    setBusy(true);
    try {
      const r = await fetchRef.current(q, items.length);
      setItems((prev) => [...prev, ...(r.items || [])]); setHasMore(Boolean(r.has_more));
    } catch { /* keep what we have */ }
    finally { setBusy(false); }
  };

  const pick = (v) => { onChange(v); setOpen(false); setQ(''); };

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm text-left bg-[var(--ams-surface)] cursor-pointer ${invalid ? 'border-red-400' : 'border-gray-300'}`}>
        <span className={`truncate ${value ? 'text-gray-900 font-mono' : 'text-gray-400'}`}>{value || placeholder}</span>
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <span role="button" tabIndex={0} aria-label="Clear" onClick={(e) => { e.stopPropagation(); onChange(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(''); } }}
              className="w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs leading-none">✕</span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-2 pt-2 pb-1 border-b border-gray-100">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label="Search"
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-[var(--ams-primary)]" />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {items.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400 text-center">{busy ? 'Searching…' : 'No results'}</li>
            ) : items.map((it) => {
              const v = getValue(it); const d = describe(it);
              return (
                <li key={v} role="option" aria-selected={v === value}>
                  <button type="button" onClick={() => pick(v)}
                    className={`w-full text-left px-4 py-2 cursor-pointer hover:bg-gray-50 ${v === value ? 'bg-gray-50' : ''}`}>
                    <span className="block text-sm text-gray-800 font-mono">{d.label}</span>
                    {d.sub && <span className="block text-xs text-gray-500">{d.sub}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <button type="button" onClick={more} disabled={busy}
              className="w-full py-2 text-xs font-medium text-[var(--ams-primary)] border-t border-gray-100 hover:bg-gray-50 cursor-pointer disabled:opacity-50">
              {busy ? 'Loading…' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
