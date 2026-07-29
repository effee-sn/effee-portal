'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * SearchableSelect — a combobox that filters a list of options as you type.
 *
 * Props:
 *   options   — array of { value: string, label: string, sub?: string }
 *   value     — currently selected value (string)
 *   onChange  — (value: string) => void
 *   placeholder — string shown when nothing is selected
 *   disabled  — bool
 */
export default function SearchableSelect({ options = [], value, onChange, placeholder = '— Select —', disabled = false }) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const inputRef            = useRef(null);
  const containerRef        = useRef(null);

  const selected = options.find((o) => o.value === value);

  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.sub?.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500
          ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white text-gray-900 border-gray-300 hover:border-gray-400 cursor-pointer'}
          ${open ? 'border-blue-500 ring-2 ring-blue-200' : ''}`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <span onClick={handleClear}
              className="w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition text-xs leading-none">
              ✕
            </span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="px-2 pt-2 pb-1 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search…"
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400 text-center">No results</li>
            ) : (
              filtered.map((opt) => (
                <li key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className={`flex flex-col px-4 py-2 cursor-pointer hover:bg-blue-50 transition
                    ${opt.value === value ? 'bg-blue-50 text-blue-700' : 'text-gray-800'}`}>
                  <span className="text-sm font-medium">{opt.label}</span>
                  {opt.sub && <span className="text-xs text-gray-400 mt-0.5">{opt.sub}</span>}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
