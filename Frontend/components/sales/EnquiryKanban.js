'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { ALL_STAGES, STAGE_STYLE, TEMPERATURE_STYLE, isAging, stageAgeDays } from '@/lib/salesOptions';
import { formatMoney, shortMoney } from '@/lib/money';
import ValueBasis from '@/components/sales/ValueBasis';

/**
 * The enquiries as a Kanban board: one column per stage, New to Lost.
 *
 * Each column loads on its own (PAGE cards, then "Show more"), with the same
 * search and application filter as the list and the same rules on whose
 * enquiries one may see — so the board stays quick however many there are.
 * A card opens its enquiry; stages are moved there (where the gates apply).
 */

const PAGE = 20;

/**
 * @param {{ search: string, appId: string, onOpen: (id: number) => void, version?: number,
 *   money?: { formatterFor: (code: string) => { format: (v: unknown) => string } }, displayCurrency?: string }} props
 *   money / displayCurrency: show values in that currency (converted by the server)
 */
export default function EnquiryKanban({ search, appId, onOpen, version = 0, money, displayCurrency = 'INR' }) {
  const [cols, setCols] = useState(null); // stage → { items, total, busy }

  const query = (stage, page) => {
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE), search, stage }); // newest first, like the list
    if (appId) q.set('application_id', appId);
    if (displayCurrency !== 'INR') q.set('display_currency', displayCurrency);
    return `/sales/enquiries?${q.toString()}`;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(ALL_STAGES.map(async (s) => {
        try {
          const r = await apiGet(query(s.value, 1), { silent: true });
          return [s.value, { items: r.data, total: r.meta.pagination.total, page: 1 }];
        } catch { return [s.value, { items: [], total: 0, page: 1, error: true }]; }
      }));
      if (!cancelled) setCols(Object.fromEntries(results));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, appId, version, displayCurrency]);

  const more = async (stage) => {
    const c = cols[stage];
    setCols((prev) => ({ ...prev, [stage]: { ...c, busy: true } }));
    try {
      const r = await apiGet(query(stage, c.page + 1), { silent: true });
      setCols((prev) => ({ ...prev, [stage]: { items: [...c.items, ...r.data], total: r.meta.pagination.total, page: c.page + 1 } }));
    } catch { setCols((prev) => ({ ...prev, [stage]: { ...c, busy: false } })); }
  };

  if (!cols) {
    return (
      <div className="flex gap-3 overflow-x-auto p-3">
        {ALL_STAGES.slice(0, 6).map((s) => <div key={s.value} className="w-72 shrink-0 h-64 rounded-lg bg-gray-50 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto p-3 items-start">
      {ALL_STAGES.map((s) => {
        const c = cols[s.value];
        const st = STAGE_STYLE[s.value] || { color: '#6B7280', bg: '#F3F4F6' };
        return (
          <section key={s.value} aria-label={`${s.label}: ${c.total}`} className="w-72 shrink-0 rounded-lg bg-gray-50 border border-gray-200 flex flex-col max-h-full">
            <header className="px-3 py-2.5 flex items-center gap-2 border-b border-gray-200" style={{ borderTop: `3px solid ${st.color}`, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
              <span className="text-sm font-semibold text-gray-800">{s.label}</span>
              <span className="ml-auto text-xs tabular-nums px-1.5 py-0.5 rounded font-medium" style={{ color: st.color, backgroundColor: st.bg }}>{c.total}</span>
            </header>
            <div className="p-2 space-y-2 overflow-y-auto">
              {c.items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">{c.error ? 'Could not load' : 'None'}</p>
              ) : c.items.map((e) => {
                const temp = e.current_temperature && TEMPERATURE_STYLE[e.current_temperature];
                const aging = isAging(e.stage, e.stage_since);
                return (
                  <button key={e.id} type="button" onClick={() => onOpen(e.id)}
                    className="w-full text-left bg-white rounded-md border border-gray-200 px-3 py-2.5 hover:border-gray-300 hover:shadow-sm cursor-pointer">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-gray-500">{e.ref_no}</span>
                      {temp && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: temp.color, backgroundColor: temp.bg }}>{temp.label}</span>
                      )}
                      {aging && (
                        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700" title={`${stageAgeDays(e.stage_since)} days in stage`}>
                          ⚠ {stageAgeDays(e.stage_since)}d
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-1 line-clamp-2">{e.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{e.customer?.name || '—'}{e.is_refurbishment ? ' · Refurbishment' : ''}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-xs">
                      <span className="text-gray-500 truncate">{e.handler?.name || e.owner?.name || '—'}</span>
                      <span className="ml-auto tabular-nums text-gray-700 whitespace-nowrap"
                        title={money && e.current_value != null ? `${money.formatterFor(e.display_currency).format(e.display_value)} · ${e.current_value_label} ${formatMoney(e.current_value, e.currency_code, e.currency?.symbol)}` : undefined}>
                        {money ? money.formatterFor(e.display_currency).compact(e.display_value)
                          : shortMoney(e.current_value, e.currency_code, e.currency?.symbol)}
                        <ValueBasis basis={e.current_value_basis} label={e.current_value_label} className="ml-1" />
                      </span>
                    </div>
                  </button>
                );
              })}
              {c.items.length < c.total && (
                <button type="button" onClick={() => more(s.value)} disabled={c.busy}
                  className="w-full py-1.5 text-xs font-medium text-[var(--ams-primary)] hover:bg-white rounded cursor-pointer disabled:opacity-50">
                  {c.busy ? 'Loading…' : `Show more (${c.total - c.items.length})`}
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
