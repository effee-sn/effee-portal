'use client';

import { useEffect } from 'react';
import { APP_VERSION } from '@/lib/version';

/** Small line icons for release items. */
function ItemIcon({ name }) {
  const p = { className: 'w-4.5 h-4.5', fill: 'none', stroke: 'currentColor', strokeWidth: 2, viewBox: '0 0 24 24', 'aria-hidden': true };
  const paths = {
    theme: <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path strokeLinecap="round" d="M8 11V7a4 4 0 018 0v4" /></>,
    swap: <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h11l-3-3M17 17H6l3 3" />,
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    spark: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />,
  };
  return <svg {...p}>{paths[name] || paths.spark}</svg>;
}

const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * "What's new" popup.
 * @param {{ releases: Array, onClose: () => void, history?: boolean }} props
 *   history: opened from the menu (all releases) rather than after an update.
 */
export default function WhatsNewModal({ releases, onClose, history = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ams-primary)]">
            {history ? 'Release notes' : `Updated to v${APP_VERSION}`}
          </p>
          <h2 id="whats-new-title" className="text-lg font-bold text-gray-900 mt-0.5">What’s new</h2>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-6">
          {releases.map((r) => (
            <section key={r.version}>
              <p className="text-xs text-gray-500 mb-3">
                <span className="font-semibold text-gray-700">v{r.version}</span> · {fmtDate(r.date)}
              </p>
              <ul className="space-y-3.5">
                {r.items.map((it) => (
                  <li key={it.title} className="flex gap-3">
                    <span className="mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--ams-primary-mid)] text-[var(--ams-primary)]">
                      <ItemIcon name={it.icon} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-gray-800">{it.title}</span>
                      <span className="block text-sm text-gray-600 mt-0.5">{it.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {releases.length === 0 && <p className="text-sm text-gray-500">No release notes yet.</p>}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary px-5 py-2" autoFocus>Got it</button>
        </div>
      </div>
    </div>
  );
}
