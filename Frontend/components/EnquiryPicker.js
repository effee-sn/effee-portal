'use client';

import { useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/api';

/**
 * Searchable single-enquiry picker for linking a project. Searches won
 * enquiries that aren't already linked to another project (server-side, by
 * ref/title) and reports the chosen id up through `onChange(id | '')`. The link
 * is optional — the popover's first row clears it. The current link (on edit)
 * is passed as `allow` so it still appears in its own results.
 *
 * @param {object} props
 * @param {{id:number, ref_no:string, title:string}|null} [props.initialEnquiry]
 * @param {(id:number|'')=>void} props.onChange
 */
export default function EnquiryPicker({ initialEnquiry = null, onChange }) {
  const [selected, setSelected]   = useState(initialEnquiry);
  const [open, setOpen]           = useState(false);
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef(null);

  // Report the current selection upward whenever it changes.
  useEffect(() => {
    onChange?.(selected?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Close on an outside click.
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Search enquiries while the popover is open (debounced).
  useEffect(() => {
    if (!open) return;
    const allow = initialEnquiry?.id ? `&allow=${initialEnquiry.id}` : '';
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiGet(`/projects/enquiry-options?search=${encodeURIComponent(query)}${allow}`, { silent: true });
        setResults(res.data || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [query, open, initialEnquiry?.id]);

  const pick  = (en) => { setSelected(en); setOpen(false); setQuery(''); };
  const clear = () => { setSelected(null); setOpen(false); setQuery(''); };

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="ams-input flex items-center justify-between text-left cursor-pointer">
        <span className={selected ? 'text-gray-800 truncate' : 'text-gray-400'}>
          {selected ? `${selected.ref_no} — ${selected.title}` : 'Search a won enquiry…'}
        </span>
        <svg className="w-4 h-4 text-gray-400 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center border-b border-gray-100 px-2.5">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ref or title…"
              className="flex-1 min-w-0 py-2 px-2 text-sm text-gray-700 outline-none" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            <button type="button" onClick={clear}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-gray-500 border-b border-gray-100 cursor-pointer">
              — None (no linked enquiry) —
            </button>
            {searching && <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>}
            {!searching && results.map((en) => (
              <button type="button" key={en.id} onClick={() => pick(en)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <div className="text-sm text-gray-800">
                  <span className="font-mono text-xs text-gray-500 mr-1.5">{en.ref_no}</span>{en.title}
                </div>
                <div className="text-xs text-gray-400">
                  {[en.customer?.name, en.stage].filter(Boolean).join(' · ') || 'No details'}
                </div>
              </button>
            ))}
            {!searching && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">
                {query.trim() ? 'No won, unlinked enquiries match.' : 'Start typing to search won enquiries.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
