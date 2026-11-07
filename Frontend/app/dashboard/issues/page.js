'use client';

import { useEffect, useState } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet } from '@/lib/api';
import usePageSize from '@/lib/usePageSize';
import PageSizeSelect from '@/components/PageSizeSelect';
import { StatusChip } from '@/components/issues/IssuePanel';
import { useIssues, ISSUE_TYPES, TYPE_LABEL, PRIORITY_LABEL, PRIORITY_STYLE, withWhom, isOverdue } from '@/lib/issues';

/**
 * Issues — every issue you are part of, in one list: for you, raised by you,
 * watching, your department's queue (heads), and all of them with Issues →
 * View. A row opens the issue in the side panel.
 */

const TABS = [
  { k: 'assigned', l: 'For me' },
  { k: 'raised', l: 'Raised by me' },
  { k: 'watching', l: 'Watching' },
  { k: 'queue', l: 'My department' },
  { k: 'all', l: 'All issues', perm: 'ISSUE_VIEW' },
];
const STATUSES = [
  { k: 'open', l: 'Open' },
  { k: 'resolved', l: 'To confirm' },
  { k: 'done', l: 'Closed' },
  { k: '', l: 'Any' },
];
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function IssuesPage() {
  useAuth();
  const { can, loading: permLoading } = usePermissions();
  const { open, version } = useIssues();
  const [tab, setTab] = useState('assigned');
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = usePageSize('issues', 25);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loadedKey, setLoadedKey] = useState(''); // the query the rows are for
  const [error, setError] = useState('');

  useEffect(() => {
    if (permLoading) return undefined;
    let live = true;
    const q = new URLSearchParams({ tab, page: String(page), limit: String(limit) });
    if (status) q.set('status', status);
    if (type) q.set('type', type);
    if (applied) q.set('search', applied);
    const key = `${q}|${version}`;
    apiGet(`/issues?${q}`)
      .then((r) => { if (live) { setData({ items: r.data, total: r.meta.pagination.total }); setError(''); } })
      .catch((err) => { if (live) { setData({ items: [], total: 0 }); setError(err.message); } })
      .finally(() => { if (live) setLoadedKey(key); });
    return () => { live = false; };
  }, [tab, status, type, applied, page, limit, version, permLoading]);

  const loading = loadedKey === '';
  const tabs = TABS.filter((t) => !t.perm || can(t.perm));
  const pick = (setter) => (v) => { setter(v); setPage(1); };
  const from = data.total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, data.total);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded border border-gray-200 overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap">
          <button onClick={() => open({ mode: 'new' })} className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer"
            style={{ backgroundColor: 'var(--ams-primary)' }}>New</button>
          <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Issues</span>
          <div className="flex gap-0.5 rounded border border-gray-300 overflow-hidden shrink-0" role="group" aria-label="Whose issues">
            {tabs.map((t) => (
              <button key={t.k} type="button" aria-pressed={tab === t.k} onClick={() => pick(setTab)(t.k)}
                className={`px-2.5 py-1.5 text-sm cursor-pointer ${tab === t.k ? 'bg-[var(--ams-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{t.l}</button>
            ))}
          </div>
          <select value={status} onChange={(e) => pick(setStatus)(e.target.value)} aria-label="Status"
            className="shrink-0 text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white cursor-pointer">
            {STATUSES.map((s) => <option key={s.k} value={s.k}>{s.l}</option>)}
          </select>
          <select value={type} onChange={(e) => pick(setType)(e.target.value)} aria-label="Type"
            className="shrink-0 text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white cursor-pointer">
            <option value="">All types</option>
            {ISSUE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div className="flex-1 min-w-0" />
          <form onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); setPage(1); }}
            className="shrink-0 flex items-center border border-gray-300 rounded bg-white overflow-hidden" style={{ minWidth: 220 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ref or subject…"
              className="flex-1 min-w-0 py-1.5 px-2.5 text-sm text-gray-700 outline-none bg-transparent" />
          </form>
          <div className="flex items-center gap-0.5 shrink-0 text-sm text-gray-500">
            <PageSizeSelect value={limit} onChange={(n) => { setLimit(n); setPage(1); }} />
            <span className="px-1 tabular-nums">{data.total === 0 ? '0' : `${from}-${to}`} / {data.total}</span>
            <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} aria-label="Previous page"
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">‹</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page * limit >= data.total} aria-label="Next page"
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">›</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
          {!loading && data.items.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">No issues here.</div>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: 960 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  {['Ref', 'Subject', 'About', 'Type', 'Priority', 'From', 'With', 'Needed by', 'Status', 'Updated'].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} onClick={() => open({ mode: 'issue', id: i.id })} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{i.ref_no}</td>
                    <td className="px-3 py-2 text-gray-800 max-w-[280px] truncate" title={i.title}>{i.title}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[220px] truncate" title={i.entity_label || ''}>{i.entity_label || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{TYPE_LABEL[i.type]}</td>
                    <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${PRIORITY_STYLE[i.priority]}`}>{PRIORITY_LABEL[i.priority]}</span></td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{i.raised_by?.name}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{withWhom(i)}</td>
                    <td className={`px-3 py-2 whitespace-nowrap ${isOverdue(i) ? 'text-red-700 font-medium' : 'text-gray-600'}`}>{fmtDate(i.due_date)}</td>
                    <td className="px-3 py-2"><StatusChip status={i.status} /></td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(i.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
