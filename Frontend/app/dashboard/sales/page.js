'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import { apiGet } from '@/lib/api';
import {
  ENQUIRY_TYPES, MEDIUM_LABEL, STAGE_AGING_DAYS, STAGE_STYLE, formatINR, stageAgeDays,
} from '@/lib/salesOptions';
import {
  Card, Empty, Pulse, Stat, StageChip, compactINR,
} from '@/components/DashboardKit';

/**
 * Sales → Dashboard. How the sales team is doing over a period: headline
 * numbers, conversion funnel, time in stage, monthly won/lost, why deals are
 * lost, per-person performance, and the team-wide watch lists.
 *
 * All figures come from `GET /sales/analytics`, filtered by period, field
 * person and enquiry type. Open pipeline and watch lists are "right now" and
 * ignore the period (they say so).
 */

// Two-series colours (validated: chroma, CVD separation, contrast vs white).
const WON_COLOR = '#8B3F7A';
const LOST_COLOR = '#D97706';

const stageLabel = (s) => STAGE_STYLE[s]?.label || s;

// ── Period presets ───────────────────────────────────────────────────────────
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(key) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const y = today.getFullYear(); const m = today.getMonth();
  switch (key) {
    case 'month':   return { from: iso(new Date(y, m, 1)), to: iso(today) };
    case 'quarter': return { from: iso(new Date(y, m - 2, 1)), to: iso(today) };
    case 'fy':      return { from: iso(new Date(m >= 3 ? y : y - 1, 3, 1)), to: iso(today) }; // Indian FY: 1 April
    case 'year':    return { from: iso(new Date(y, m - 11, 1)), to: iso(today) };
    default:        return null;
  }
}

const PRESETS = [
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'Last 3 months' },
  { key: 'fy', label: 'This FY' },
  { key: 'year', label: 'Last 12 months' },
  { key: 'custom', label: 'Custom' },
];

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// ── Charts (single series = one hue; values written beside each bar) ─────────

/** Horizontal bar rows: label | bar | figure. */
function BarRows({ rows, max, color = 'var(--ams-primary)', label }) {
  const top = Math.max(1, max ?? Math.max(...rows.map((r) => r.value)));
  return (
    <ul className="px-2 py-2" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} title={r.title}
          className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_minmax(4.5rem,auto)] items-center gap-3 px-2 py-1.5 rounded-md hover:bg-gray-50">
          <span className={`text-xs truncate ${r.value ? 'text-gray-700' : 'text-gray-400'}`}>{r.label}</span>
          <span className="relative h-2.5 rounded-sm bg-gray-100">
            {r.value > 0 && (
              <span className="absolute inset-y-0 left-0 rounded-r-[4px]"
                style={{ width: `${Math.max(3, (r.value / top) * 100)}%`, backgroundColor: color }} />
            )}
            {r.marker !== undefined && (
              <span className="absolute -inset-y-1 w-px bg-gray-400" style={{ left: `${Math.min(100, (r.marker / top) * 100)}%` }}
                aria-hidden="true" />
            )}
          </span>
          <span className="text-xs tabular-nums text-right whitespace-nowrap">{r.figure}</span>
        </li>
      ))}
    </ul>
  );
}

function Funnel({ steps }) {
  const raised = steps[0]?.count || 0;
  if (!raised) return <Empty>No enquiries were raised in this period.</Empty>;
  const rows = steps.map((s, i) => {
    const pct = Math.round((s.count / raised) * 100);
    const prev = i > 0 ? steps[i - 1].count : null;
    const stepPct = prev ? Math.round((s.count / prev) * 100) : null;
    return {
      key: s.key,
      label: s.label,
      value: s.count,
      title: i === 0
        ? `${s.count} raised`
        : `${s.count} of ${raised} raised reached ${s.label} (${pct}%)${prev ? ` · ${stepPct}% of the previous step` : ''}`,
      figure: (
        <>
          <span className={s.count ? 'font-semibold text-gray-800' : 'text-gray-400'}>{s.count}</span>
          {i > 0 && <span className="text-gray-500"> · {pct}%</span>}
        </>
      ),
    };
  });
  return (
    <>
      <BarRows rows={rows} max={raised} label="Conversion funnel" />
      <p className="px-4 pb-3 text-[11px] text-gray-500">
        Of the enquiries raised in the period, how many reached each stage (% of raised). A lost deal counts up to the
        furthest stage it got to.
      </p>
    </>
  );
}

function TimeInStage({ rows }) {
  if (!rows.length) return <Empty>No stage changes in this period yet.</Empty>;
  const max = Math.max(...rows.map((r) => Math.max(r.avg_days, STAGE_AGING_DAYS[r.stage] || 0)));
  const data = rows.map((r) => {
    const limit = STAGE_AGING_DAYS[r.stage];
    const over = limit && r.avg_days > limit;
    return {
      key: r.stage,
      label: stageLabel(r.stage),
      value: r.avg_days,
      marker: limit,
      title: `${stageLabel(r.stage)}: ${r.avg_days} days on average over ${r.samples} ${r.samples === 1 ? 'stay' : 'stays'}${limit ? ` · limit ${limit} days` : ''}`,
      figure: (
        <span className={over ? 'font-semibold text-amber-700' : 'font-semibold text-gray-800'}>
          {r.avg_days} d{over && <span className="font-normal"> · over</span>}
        </span>
      ),
    };
  });
  return (
    <>
      <BarRows rows={data} max={max} label="Average days in each stage" />
      <p className="px-4 pb-3 text-[11px] text-gray-500">
        Average days spent in a stage, for stays that ended in the period. The thin line is the stage&apos;s time
        limit; &ldquo;over&rdquo; marks a bottleneck.
      </p>
    </>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-600" aria-hidden="true">
      <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: WON_COLOR }} />Won</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: LOST_COLOR }} />Lost</span>
    </div>
  );
}

/** Won vs Lost per month — grouped columns, counts written above each bar. */
function MonthlyChart({ months }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.won, m.lost]));
  const any = months.some((m) => m.won || m.lost);
  if (!any) return <Empty>No enquiries were won or lost in the last 12 months.</Empty>;

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="overflow-x-auto">
        <ul className="grid grid-cols-12 gap-1 min-w-[520px]" aria-label="Won and lost enquiries per month">
          {months.map((m) => {
            const [y, mo] = m.key.split('-').map(Number);
            const name = new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
            const full = new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
            return (
              <li key={m.key} className="rounded-md hover:bg-gray-50 px-0.5 pt-1"
                title={`${full} — Won ${m.won}${m.won_value ? ` (${formatINR(m.won_value)})` : ''} · Lost ${m.lost}`}>
                <div className="h-36 flex items-end justify-center gap-[2px] border-b border-gray-200">
                  {[{ v: m.won, c: WON_COLOR }, { v: m.lost, c: LOST_COLOR }].map((b, i) => (
                    <div key={i} className="flex flex-col items-center justify-end h-full w-1/3 max-w-4">
                      {b.v > 0 && <span className="text-[10px] tabular-nums text-gray-700 mb-0.5">{b.v}</span>}
                      <div className="w-full rounded-t-[4px]"
                        style={{ height: b.v ? `${Math.max(4, (b.v / max) * 100)}%` : 0, backgroundColor: b.c }} />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 text-center mt-1">{name}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function RankedList({ title, rows }) {
  return (
    <div>
      <h3 className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">Nothing recorded.</p>
      ) : (
        <BarRows label={title}
          rows={rows.map((r) => ({
            key: r.label, label: r.label, value: r.count, title: `${r.label}: ${r.count}`,
            figure: <span className="font-semibold text-gray-800">{r.count}</span>,
          }))} />
      )}
    </div>
  );
}

// ── Watch lists ──────────────────────────────────────────────────────────────
function WatchList({ title, data, empty, render }) {
  const { total, items } = data;
  return (
    <Card title={<>{title} <span className="ml-1 text-gray-400 font-normal tabular-nums">{total}</span></>}>
      {items.length === 0 ? <Empty>{empty}</Empty> : (
        <>
          <ul className="divide-y divide-gray-100">{items.map(render)}</ul>
          {total > items.length && (
            <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-100">Showing {items.length} of {total}</p>
          )}
        </>
      )}
    </Card>
  );
}

function WatchRow({ href, title, sub, right }) {
  return (
    <li>
      <Link href={href} className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-gray-50">
        <div className="min-w-0">
          <p className="text-sm text-gray-800 truncate">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>
        </div>
        <div className="shrink-0 text-right">{right}</div>
      </Link>
    </li>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function SalesSkeleton() {
  return (
    <div className="space-y-4">
      <Pulse className="h-[76px]" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><Pulse className="h-64" /><Pulse className="h-64" /></div>
      <Pulse className="h-56" />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SalesDashboardPage() {
  useAuth();

  const [preset, setPreset] = useState('fy');
  const [range, setRange]   = useState(() => presetRange('fy'));
  const [ownerId, setOwnerId] = useState('');
  const [type, setType]       = useState('');

  const [data, setData]         = useState(null);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const [error, setError]       = useState('');

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    if (ownerId) p.set('owner_id', ownerId);
    if (type) p.set('enquiry_type', type);
    return `/sales/analytics?${p}`;
  }, [range, ownerId, type]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet(url);
        if (cancelled) return;
        setData(res.data);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load the sales dashboard.');
      } finally {
        if (!cancelled) setLoadedUrl(url);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  const refreshing = loadedUrl !== url;

  const choosePreset = (key) => {
    setPreset(key);
    const r = presetRange(key);
    if (r) setRange(r);
  };

  const h = data?.headline;
  const filtered = Boolean(ownerId || type);

  return (
    <div className="space-y-5 p-4 pb-10">

      {/* Header + filters */}
      <header className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Sales dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {data ? `${fmtDate(data.period.from)} – ${fmtDate(data.period.to)}` : 'How the sales team is doing'}
              {refreshing && data && <span className="ml-2 text-gray-400">Updating…</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-300 bg-white overflow-hidden" role="group" aria-label="Period">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => choosePreset(p.key)} aria-pressed={preset === p.key}
                className={`px-3 py-1.5 text-xs font-medium border-r border-gray-200 last:border-r-0 cursor-pointer ${preset === p.key
                  ? 'bg-[var(--ams-primary)] text-white' : 'text-gray-700 hover:bg-gray-50'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="date" value={range.from} max={range.to} aria-label="From"
                onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
                className="text-sm border border-gray-300 rounded px-2 py-1 bg-white" />
              <span>to</span>
              <input type="date" value={range.to} min={range.from} aria-label="To"
                onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
                className="text-sm border border-gray-300 rounded px-2 py-1 bg-white" />
            </div>
          )}

          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Field person"
            className="text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white cursor-pointer">
            <option value="">All field people</option>
            {(data?.owners || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>

          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Enquiry type"
            className="text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white cursor-pointer">
            <option value="">All types</option>
            {ENQUIRY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {filtered && (
            <button type="button" onClick={() => { setOwnerId(''); setType(''); }}
              className="text-xs font-medium text-[var(--ams-primary)] hover:underline cursor-pointer">Clear filters</button>
          )}
        </div>
      </header>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

      {!data ? (error ? null : <SalesSkeleton />) : (
        <div className={`space-y-4 transition-opacity ${refreshing ? 'opacity-60' : ''}`}>

          {/* 1. Headline numbers */}
          <section aria-label="Headline numbers" className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-px bg-gray-100">
              <Stat label="Open pipeline" value={compactINR(h.open_value)} title={formatINR(h.open_value)}
                sub={`${h.open_count} open · right now`} />
              <Stat label="Raised" value={h.raised} sub="In the period" />
              <Stat label="Won" value={h.won} sub={h.won ? compactINR(h.won_value) : 'No orders yet'} title={formatINR(h.won_value)} />
              <Stat label="Lost" value={h.lost} sub="In the period" />
              <Stat label="Win rate" value={h.win_rate === null ? '—' : `${h.win_rate}%`}
                sub={h.won + h.lost ? `${h.won} of ${h.won + h.lost} decided` : 'Nothing decided yet'} />
              <Stat label="Avg deal size" value={h.avg_deal === null ? '—' : compactINR(h.avg_deal)}
                title={h.avg_deal === null ? undefined : formatINR(h.avg_deal)} />
              <Stat label="Avg days to close" value={h.avg_days_to_close === null ? '—' : h.avg_days_to_close}
                sub="Raised → won" />
              <Stat label="Stalled now" value={data.watch.stalled.total} tone={data.watch.stalled.total > 0 ? 'warning' : undefined}
                sub="Past the stage limit" />
            </div>
          </section>

          {/* 2–3. Funnel and bottlenecks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Card title="Conversion funnel"><Funnel steps={data.funnel} /></Card>
            <Card title="Time in each stage"><TimeInStage rows={data.time_in_stage} /></Card>
          </div>

          {/* 4–5. Trend and lost analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <Card title="Won vs lost · last 12 months" className="lg:col-span-2 min-w-0" action={<Legend />}>
              <MonthlyChart months={data.monthly} />
            </Card>
            <Card title={<>Why deals are lost <span className="ml-1 text-gray-400 font-normal tabular-nums">{data.lost.total}</span></>}>
              {data.lost.total === 0 ? <Empty>No deals lost in this period.</Empty> : (
                <div className="pb-1 divide-y divide-gray-100">
                  <RankedList title="Reason" rows={data.lost.reasons} />
                  <RankedList title="Went to" rows={data.lost.competitors} />
                  <RankedList title="Lost at stage" rows={data.lost.by_stage.map((r) => ({ ...r, label: stageLabel(r.label) }))} />
                </div>
              )}
            </Card>
          </div>

          {/* 6. Team performance */}
          <Card title="Team performance">
            {data.team.length === 0 ? <Empty>No enquiries match these filters.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-gray-500 text-right">
                      <th className="text-left font-medium px-4 py-2">Field person</th>
                      <th className="font-medium px-3 py-2">Raised</th>
                      <th className="font-medium px-3 py-2">Open now</th>
                      <th className="font-medium px-3 py-2">Open value</th>
                      <th className="font-medium px-3 py-2">Won</th>
                      <th className="font-medium px-3 py-2">Won value</th>
                      <th className="font-medium px-3 py-2">Lost</th>
                      <th className="font-medium px-4 py-2">Win rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 tabular-nums text-right text-gray-700">
                    {data.team.map((t) => (
                      <tr key={t.owner_id} className="hover:bg-gray-50">
                        <td className="text-left px-4 py-2">
                          {String(t.owner_id) === ownerId ? (
                            <span className="font-medium text-gray-900">{t.name}</span>
                          ) : (
                            <button type="button" onClick={() => setOwnerId(String(t.owner_id))} title={`Show only ${t.name}`}
                              className="font-medium text-gray-900 hover:text-[var(--ams-primary)] hover:underline cursor-pointer">
                              {t.name}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">{t.raised}</td>
                        <td className="px-3 py-2">{t.open}</td>
                        <td className="px-3 py-2" title={formatINR(t.open_value)}>{t.open_value ? compactINR(t.open_value) : '—'}</td>
                        <td className="px-3 py-2">{t.won}</td>
                        <td className="px-3 py-2" title={formatINR(t.won_value)}>{t.won_value ? compactINR(t.won_value) : '—'}</td>
                        <td className="px-3 py-2">{t.lost}</td>
                        <td className="px-4 py-2 font-medium text-gray-900">{t.win_rate === null ? '—' : `${t.win_rate}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* 7. Watch lists (right now) */}
          <section aria-labelledby="watch-h">
            <h2 id="watch-h" className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Watch lists <span className="normal-case tracking-normal font-normal text-gray-400">· right now</span>
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <WatchList title="Stalled" data={data.watch.stalled} empty="Nothing is stuck past its stage limit."
                render={(e) => (
                  <WatchRow key={e.id} href={`/dashboard/sales/enquiries/${e.id}`}
                    title={`${e.ref_no} · ${e.title}`}
                    sub={`${e.customer?.name || '—'} · with ${(e.handler || e.owner)?.name || '—'}`}
                    right={<><StageChip stage={e.stage} /><p className="text-xs text-amber-700 tabular-nums mt-1">{stageAgeDays(e.stage_since)} days</p></>} />
                )} />
              <WatchList title="Hot deals" data={data.watch.hot} empty="No open enquiry is marked Hot."
                render={(e) => (
                  <WatchRow key={e.id} href={`/dashboard/sales/enquiries/${e.id}`}
                    title={`${e.ref_no} · ${e.title}`}
                    sub={`${e.customer?.name || '—'} · ${e.owner?.name || '—'}`}
                    right={<><StageChip stage={e.stage} /><p className="text-xs text-gray-700 tabular-nums mt-1" title={formatINR(e.expected_value)}>
                      {e.expected_value ? compactINR(e.expected_value) : '—'}</p></>} />
                )} />
              <WatchList title="Overdue follow-ups" data={data.watch.overdue} empty="No follow-ups are overdue."
                render={(a) => {
                  const days = Math.max(1, stageAgeDays(a.follow_up_at));
                  return (
                    <WatchRow key={a.id} href={`/dashboard/sales/enquiries/${a.enquiry.id}`}
                      title={`${a.enquiry.ref_no} · ${a.subject}`}
                      sub={`${a.is_review ? 'Review' : MEDIUM_LABEL[a.next_medium] || 'Follow-up'} · with ${(a.enquiry.handler || a.enquiry.owner)?.name || '—'}`}
                      right={<p className="text-xs text-red-700 tabular-nums">{days} {days === 1 ? 'day' : 'days'} late</p>} />
                  );
                }} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
