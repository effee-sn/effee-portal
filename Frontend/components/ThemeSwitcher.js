'use client';

import { useEffect, useRef, useState } from 'react';
import { apiPut } from '@/lib/api';
import { applyTheme, storedTheme, THEME_EVENT } from '@/lib/theme';

/**
 * Top-bar theme menu: Light / Dark / System. Applies at once and saves to the
 * user's account (the same setting as Settings → Profile → Appearance; both
 * stay in step through the theme event).
 */

const Icon = ({ pref, className = 'w-4 h-4' }) => {
  const common = { className, fill: 'none', stroke: 'currentColor', strokeWidth: 2, viewBox: '0 0 24 24', 'aria-hidden': true };
  if (pref === 'DARK') {
    return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>;
  }
  if (pref === 'LIGHT') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path strokeLinecap="round" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  return <svg {...common}><rect x="3" y="4" width="18" height="12" rx="2" /><path strokeLinecap="round" d="M8 20h8M12 16v4" /></svg>;
};

const OPTIONS = [
  { value: 'LIGHT', label: 'Light' },
  { value: 'DARK', label: 'Dark' },
  { value: 'SYSTEM', label: 'System' },
];

export default function ThemeSwitcher({ initial }) {
  const [pref, setPref] = useState(() => initial || storedTheme());
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Follow changes made elsewhere (Settings, or the account's saved value).
  useEffect(() => {
    const onTheme = (e) => setPref(e.detail);
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = async (value) => {
    const before = pref;
    setOpen(false);
    if (value === before) return;
    applyTheme(value);
    try { await apiPut('/auth/preferences', { theme: value }); }
    catch { applyTheme(before); }
  };

  const current = OPTIONS.find((o) => o.value === pref)?.label || 'System';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 transition cursor-pointer"
        aria-label={`Theme: ${current}`} title={`Theme: ${current}`} aria-haspopup="menu" aria-expanded={open}>
        <Icon pref={pref} />
      </button>
      {open && (
        <div role="menu" aria-label="Theme"
          className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden py-1">
          {OPTIONS.map((o) => (
            <button key={o.value} type="button" role="menuitemradio" aria-checked={pref === o.value} onClick={() => pick(o.value)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left cursor-pointer hover:bg-gray-50 ${pref === o.value
                ? 'text-[var(--ams-primary)] font-semibold' : 'text-gray-700'}`}>
              <Icon pref={o.value} />
              {o.label}
              {pref === o.value && <span className="ml-auto text-xs" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
