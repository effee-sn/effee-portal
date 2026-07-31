'use client';

import { Fragment, useEffect, useState } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

/** Formats an ISO timestamp as a short date + time — the trail is about "when". */
const formatDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
};

// Known action verbs (audit.service.js `Action`). Modules may record their own,
// so the list is a convenience for the filter, not an exhaustive constraint —
// any recorded action still renders.
const ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE',
  'LOGIN', 'LOGIN_FAILED',
  'PASSWORD_CHANGED', 'PASSWORD_RESET',
  'PERMISSIONS_SET', 'SETTINGS_UPDATED',
];

// Colour cue per action family: destructive/failed in red, auth in amber,
// creates in green, everything else neutral. Purely presentational.
const ACTION_COLOR = (action) => {
  if (action === 'DELETE' || action === 'LOGIN_FAILED') return { color: '#b91c1c', bg: '#fef2f2' };
  if (action === 'CREATE') return { color: '#15803d', bg: '#f0fdf4' };
  if (action?.startsWith('LOGIN') || action?.startsWith('PASSWORD')) return { color: '#b45309', bg: '#fffbeb' };
  if (action === 'PERMISSIONS_SET' || action === 'SETTINGS_UPDATED') return { color: '#6d28d9', bg: '#f5f3ff' };
  return { color: '#374151', bg: '#f3f4f6' };
};

// ── Page ────────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  useAuth();
  const { me, loading: permLoading } = usePermissions();

  const [logs, setLogs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [action, setAction]   = useState('');
  const [entity, setEntity]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  const limit = 20;

  // The backend endpoint is `requireSystemRole`; mirror that gate on the client
  // so the page never briefly renders for a non-system user.
  const canView = !!me?.is_system;

  const fetchLogs = async (p = page, a = action, e = entity) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (a) params.set('action', a);
      if (e) params.set('entity', e);
      const res = await apiGet(`/audit-logs?${params.toString()}`);
      setLogs(res.data);
      setTotal(res.meta.pagination.total);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) fetchLogs();
    else if (!permLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading]);

  const applyFilters = (e) => { e.preventDefault(); setPage(1); setExpanded(null); fetchLogs(1, action, entity); };
  const goPage = (delta) => { const p = page + delta; setPage(p); setExpanded(null); fetchLogs(p, action, entity); };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  if (permLoading || loading) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={5} rows={8} />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">The audit log is restricted to system administrators.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        {/* Control panel */}
        <form onSubmit={applyFilters} className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap bg-white">
          <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Audit Log</span>
          <div className="flex-1 min-w-0" />

          <select value={action} onChange={(e) => setAction(e.target.value)}
            className="shrink-0 py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none">
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="Entity (e.g. User)"
            className="shrink-0 py-1.5 px-2.5 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none"
            style={{ minWidth: 160 }} />

          <button type="submit" className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm"
            style={{ backgroundColor: 'var(--ams-primary)' }}>
            Filter
          </button>

          <div className="flex items-center gap-0.5 shrink-0 text-sm text-gray-500">
            <span className="px-1 tabular-nums">{total === 0 ? '0' : `${from}-${to}`} / {total}</span>
            <button type="button" onClick={() => goPage(-1)} disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button type="button" onClick={() => goPage(1)} disabled={page * limit >= total}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </form>

        {/* Table */}
        <div className="overflow-x-auto">
          {logs.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">No audit entries found.</div>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: 860 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-3 font-normal whitespace-nowrap">When</th>
                  <th className="px-3 py-3 font-normal">Actor</th>
                  <th className="px-3 py-3 font-normal">Action</th>
                  <th className="px-3 py-3 font-normal">Entity</th>
                  <th className="px-3 py-3 font-normal">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => {
                  const ac = ACTION_COLOR(row.action);
                  const isOpen = expanded === row.id;
                  const hasChanges = row.changes != null;
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                        <td className="px-3 py-3 text-gray-700">
                          {row.actor_email || (row.actor_id ? `User #${row.actor_id}` : 'System')}
                          {row.ip && <span className="block text-xs text-gray-400">{row.ip}</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                            style={{ color: ac.color, backgroundColor: ac.bg }}>{row.action}</span>
                        </td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                          {row.entity}{row.entity_id ? <span className="text-gray-400"> #{row.entity_id}</span> : null}
                        </td>
                        <td className="px-3 py-3">
                          {hasChanges ? (
                            <button onClick={() => setExpanded(isOpen ? null : row.id)}
                              className="text-xs font-medium text-gray-500 hover:text-gray-800">
                              {isOpen ? 'Hide' : 'View'}
                            </button>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                      {isOpen && hasChanges && (
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <td colSpan={5} className="px-3 py-3">
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words max-h-72 overflow-auto">
                              {typeof row.changes === 'string' ? row.changes : JSON.stringify(row.changes, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
