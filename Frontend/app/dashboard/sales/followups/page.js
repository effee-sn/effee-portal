'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import FollowupCalendar, { calendarRange } from '@/components/FollowupCalendar';
import {
  ALL_STAGES, ACTIVITY_MEDIUMS, MEDIUM_LABEL, STAGE_STYLE, TEMPERATURE_STYLE, followUpDoneText,
} from '@/lib/salesOptions';

/**
 * Sales → Follow-ups: every customer follow-up in one place — Overdue, Today,
 * Upcoming and Done — as a list or a calendar (Day, Work week, Week, Month —
 * like Teams; see FollowupCalendar). Follow-ups → View shows
 * everyone's; Follow-ups own → View only the ones you added. From a row: open
 * the enquiry or move the follow-up to another day (your own entry, as on the
 * enquiry). A follow-up is closed by logging the next activity; only a Super
 * Admin can tick several and mark them done — for odd cases.
 */

const ENQ = '/dashboard/sales/enquiries';
const TABS = [
  { key: 'overdue', label: 'Overdue', tone: 'text-red-700' },
  { key: 'today', label: 'Today', tone: 'text-amber-700' },
  { key: 'upcoming', label: 'Upcoming', tone: 'text-blue-700' },
  { key: 'done', label: 'Done', tone: 'text-green-700' },
];
const select = 'text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white cursor-pointer';

const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const time = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "Today", "Tomorrow", "In 3 days", "2 days overdue". */
function when(f) {
  if (f.status === 'OVERDUE') return `${f.days_overdue} day${f.days_overdue === 1 ? '' : 's'} overdue`;
  if (f.status === 'TODAY') return 'Today';
  if (f.status === 'DONE') return null;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const d = new Date(f.follow_up_at); d.setHours(0, 0, 0, 0);
  const n = Math.round((d - start) / 864e5);
  return n === 1 ? 'Tomorrow' : `In ${n} days`;
}

function StageChip({ stage }) {
  const s = STAGE_STYLE[stage];
  if (!s) return null;
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap" style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>;
}

/** Move a follow-up to another day (and time). */
function RescheduleModal({ item, onClose, onSaved }) {
  const [date, setDate] = useState(ymd(new Date(item.follow_up_at)));
  const [tm, setTm] = useState(item.follow_up_timed ? new Date(item.follow_up_at).toTimeString().slice(0, 5) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await apiPut(`/sales/activities/${item.id}`, { follow_up_at: tm ? new Date(`${date}T${tm}`).toISOString() : date });
      onSaved(); onClose();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={save} className="w-full max-w-sm bg-white rounded-lg shadow-xl p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Reschedule follow-up</h2>
        <p className="text-xs text-gray-500">{item.enquiry.ref_no} · {item.subject}</p>
        {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
        <div className="flex gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="ams-input flex-1" aria-label="New date" />
          <input type="time" value={tm} onChange={(e) => setTm(e.target.value)} className="ams-input w-32" aria-label="Time (optional)" />
        </div>
        <p className="text-[11px] text-gray-500">Leave the time empty for a day — it is reminded that morning.</p>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={busy || !date} className="btn-primary flex-1 justify-center py-2">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

function FollowupsBoard() {
  useAuth();
  const params = useSearchParams();
  const { me, can, loading: permLoading } = usePermissions();
  const has = (code) => me?.is_system || can(code);
  const viewAll = has('SALES_FOLLOWUP_VIEW');
  const canView = viewAll || has('SALES_FOLLOWUP_VIEW_OWN');
  const isAdmin = Boolean(me?.is_system);

  // ?tab=today etc. (from the dashboard's tiles); Overdue by default.
  const [tab, setTab] = useState(() => (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overdue'));
  const [view, setView] = useState('list');
  const [calMode, setCalMode] = useState('workweek');
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [filters, setFilters] = useState({ search: '', added_by: '', stage: '', medium: '' });
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(null);
  const [version, setVersion] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [picked, setPicked] = useState(() => new Set()); // follow-ups ticked to mark done (Super Admin)
  const [notice, setNotice] = useState('');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (applied) p.set('search', applied);
    if (filters.added_by) p.set('added_by', filters.added_by);
    if (filters.stage) p.set('stage', filters.stage);
    if (filters.medium) p.set('medium', filters.medium);
    if (view === 'calendar') {
      // The days on screen, a day either side (the API reads dates in UTC);
      // the calendar keeps only what falls on its days.
      const { start, end } = calendarRange(calMode, anchor);
      const from = new Date(start); from.setDate(from.getDate() - 1);
      const to = new Date(end); to.setDate(to.getDate() + 1);
      p.set('tab', 'all'); p.set('from', ymd(from)); p.set('to', ymd(to)); p.set('limit', '500');
    } else {
      p.set('tab', tab); p.set('page', String(page)); p.set('limit', String(pageSize));
    }
    return p.toString();
  }, [applied, filters.added_by, filters.stage, filters.medium, view, calMode, anchor, tab, page, pageSize]);

  useEffect(() => {
    if (permLoading || !canView) return undefined;
    let cancelled = false;
    apiGet(`/sales/followups?${query}`, { silent: true })
      .then((r) => { if (!cancelled) { setData(r.data); setError(''); setPicked(new Set()); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [query, permLoading, canView, version]);

  useEffect(() => {
    if (permLoading || !viewAll) return;
    apiGet('/lookup/users').then((u) => setUsers(Array.isArray(u) ? u : u?.data || [])).catch(() => {});
  }, [permLoading, viewAll]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const mine = (f) => me?.is_system || (me?.id != null && f.created_by === me.id);

  // Super Admin: tick follow-ups and mark them all done with one note.
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const markPickedDone = async () => {
    const note = window.prompt(`Mark ${picked.size} follow-up${picked.size === 1 ? '' : 's'} done? Add a note if you like (e.g. "old follow-ups cleared").`, '');
    if (note === null) return;
    try {
      const r = await apiPost('/sales/followups/mark-done', { ids: [...picked], note });
      setNotice(`${r.data.done} follow-up${r.data.done === 1 ? '' : 's'} marked done.`);
      reload();
    } catch (e) { setError(e.message); }
  };

  if (permLoading) return <div className="p-4"><TableSkeleton cols={6} rows={6} /></div>;
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view follow-ups.</p>
      </div>
    );
  }

  const counts = data?.counts;
  const items = data?.items || [];
  // Bulk marking: a Super Admin, on a tab of open follow-ups.
  const bulk = isAdmin && view === 'list' && tab !== 'done' && items.length > 0;

  return (
    <div className="p-4 pb-10 space-y-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Follow-ups</h1>
          <p className="text-sm text-gray-500">{viewAll ? 'Everyone’s customer follow-ups' : 'The follow-ups you added'} — a follow-up is done once the next activity is logged on the enquiry, or the enquiry is won or lost.</p>
        </div>
        <div className="flex rounded border border-gray-300 overflow-hidden text-sm" role="group" aria-label="View">
          {['list', 'calendar'].map((v) => (
            <button key={v} type="button" onClick={() => { if (v !== view) { setView(v); setData(null); } }} aria-pressed={view === v}
              className={`px-3 py-1.5 cursor-pointer capitalize ${view === v ? 'bg-[var(--ams-primary)] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{v}</button>
          ))}
        </div>
      </header>

      {/* Counts per state — click to open */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => { setTab(t.key); setView('list'); setPage(1); }}
            className={`text-left bg-white rounded border px-4 py-3 cursor-pointer hover:shadow-sm ${view === 'list' && tab === t.key ? 'border-[var(--ams-primary)] ring-1 ring-[var(--ams-primary)]' : 'border-gray-200'}`}>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{t.label}</p>
            <p className={`text-2xl font-semibold tabular-nums ${counts?.[t.key] ? t.tone : 'text-gray-400'}`}>{counts ? counts[t.key] : '…'}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded border border-gray-200 px-3 py-3 flex items-center gap-2 flex-wrap">
        <form onSubmit={(e) => { e.preventDefault(); setApplied(filters.search.trim()); setPage(1); }} className="flex-1 min-w-[220px]">
          <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search enquiry ref, title, customer or subject…"
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 outline-none focus:border-[var(--ams-primary)]" />
        </form>
        {viewAll && (
          <select value={filters.added_by} onChange={(e) => setFilter('added_by', e.target.value)} aria-label="Added by" className={select}>
            <option value="">Added by: anyone</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <select value={filters.stage} onChange={(e) => setFilter('stage', e.target.value)} aria-label="Stage" className={select}>
          <option value="">All stages</option>
          {ALL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filters.medium} onChange={(e) => setFilter('medium', e.target.value)} aria-label="How" className={select}>
          <option value="">Any medium</option>
          {ACTIVITY_MEDIUMS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
      {notice && <p className="px-3 py-2 rounded text-sm border bg-green-50 border-green-200 text-green-800">{notice}</p>}

      <div className="bg-white rounded border border-gray-200">
        {!data ? <TableSkeleton cols={7} rows={6} /> : view === 'calendar' ? (
          <FollowupCalendar mode={calMode} anchor={anchor} items={items} onMode={setCalMode} onAnchor={setAnchor}
            canReschedule={mine} onReschedule={setMoving} />
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">No {TABS.find((t) => t.key === tab)?.label.toLowerCase()} follow-ups{applied || filters.added_by || filters.stage || filters.medium ? ' match your filters' : ''}.</p>
        ) : (
          <div className="overflow-x-auto">
            {bulk && (
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50 text-sm">
                <span className="text-gray-600">{picked.size ? `${picked.size} selected` : 'Tick follow-ups to mark them done together'}</span>
                <button type="button" onClick={markPickedDone} disabled={!picked.size} className="btn-primary px-3 py-1 disabled:opacity-40">
                  Mark {picked.size || ''} selected done
                </button>
                {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer">Clear</button>}
                <div className="flex-1" />
                <label className="text-xs text-gray-500" htmlFor="fu-size">Rows</label>
                <select id="fu-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className={select}>
                  {[50, 100, 200].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
              </div>
            )}
            <table className="w-full text-sm" style={{ minWidth: 980 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  {bulk && (
                    <th className="pl-4 py-2.5 w-8">
                      <input type="checkbox" aria-label="Select all on this page" className="cursor-pointer"
                        checked={items.length > 0 && items.every((f) => picked.has(f.id))}
                        onChange={(e) => setPicked(e.target.checked ? new Set(items.map((f) => f.id)) : new Set())} />
                    </th>
                  )}
                  <th className="px-4 py-2.5 font-normal">When</th>
                  <th className="px-3 py-2.5 font-normal">Enquiry</th>
                  <th className="px-3 py-2.5 font-normal">Follow-up</th>
                  <th className="px-3 py-2.5 font-normal">Stage</th>
                  <th className="px-3 py-2.5 font-normal">Added by</th>
                  <th className="px-3 py-2.5 font-normal">With now</th>
                  <th className="px-3 py-2.5 font-normal text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => {
                  const rel = when(f);
                  const open = f.status !== 'DONE';
                  return (
                    <tr key={f.id} className={`border-b border-gray-100 align-top hover:bg-gray-50/60 ${picked.has(f.id) ? 'bg-[var(--ams-primary-mid)]' : ''}`}>
                      {bulk && (
                        <td className="pl-4 py-3 w-8">
                          <input type="checkbox" aria-label={`Select ${f.enquiry.ref_no}`} className="cursor-pointer" checked={picked.has(f.id)} onChange={() => toggle(f.id)} />
                        </td>
                      )}
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <p className="font-medium text-gray-800">{day(f.follow_up_at)}{f.follow_up_timed ? ` · ${time(f.follow_up_at)}` : ''}</p>
                        <p className="text-xs text-gray-500">{f.next_medium ? MEDIUM_LABEL[f.next_medium] : '—'}
                          {rel && <span className={`ml-1.5 font-medium ${f.status === 'OVERDUE' ? 'text-red-600' : f.status === 'TODAY' ? 'text-amber-700' : 'text-blue-600'}`}>· {rel}</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 min-w-[220px]">
                        <Link href={`${ENQ}/${f.enquiry.id}`} className="font-mono text-xs font-semibold text-blue-600 hover:underline">{f.enquiry.ref_no}</Link>
                        <p className="text-gray-800">{f.enquiry.title}</p>
                        <p className="text-xs text-gray-500">{f.enquiry.customer?.name || '—'}</p>
                      </td>
                      <td className="px-3 py-2.5 min-w-[240px]">
                        <p className="text-gray-800">{f.next_action || f.subject}</p>
                        <p className="text-xs text-gray-500">from {MEDIUM_LABEL[f.type] || f.type} on {day(f.activity_at)}
                          {f.temperature && <span className="ml-1.5 font-medium" style={{ color: TEMPERATURE_STYLE[f.temperature]?.color }}>· {TEMPERATURE_STYLE[f.temperature]?.label || f.temperature}</span>}
                        </p>
                        {!open && (
                          <p className="mt-1 text-xs text-green-700">✓ {followUpDoneText(f)}{f.done_entry?.outcome ? <span className="text-gray-600"> — {f.done_entry.outcome}</span> : ''}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><StageChip stage={f.enquiry.stage} /></td>
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{f.created_by_name || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{f.handler_name || '—'}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <Link href={`${ENQ}/${f.enquiry.id}`} className="text-xs text-[var(--ams-primary)] hover:underline">Open</Link>
                        {open && mine(f) && (
                          <button type="button" onClick={() => setMoving(f)} className="ml-3 text-xs text-gray-600 hover:text-gray-900 underline cursor-pointer">Reschedule</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.total > data.limit && (
              <div className="flex items-center justify-end gap-3 px-4 py-2.5 text-sm text-gray-600">
                <span>{(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total}</span>
                <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="btn-secondary px-2.5 py-1 disabled:opacity-40">‹</button>
                <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page * data.limit >= data.total} className="btn-secondary px-2.5 py-1 disabled:opacity-40">›</button>
              </div>
            )}
          </div>
        )}
      </div>

      {moving && <RescheduleModal item={moving} onClose={() => setMoving(null)} onSaved={reload} />}
    </div>
  );
}

export default function FollowupsPage() {
  return (
    <Suspense fallback={<div className="p-4"><TableSkeleton cols={6} rows={6} /></div>}>
      <FollowupsBoard />
    </Suspense>
  );
}
