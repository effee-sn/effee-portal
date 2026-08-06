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

// Modules (audit `entity` values) with friendly labels for the filter dropdown.
const MODULES = [
  { value: 'ServiceTicket',        label: 'Service Tickets' },
  { value: 'TicketDepartmentTask', label: 'Department Tasks' },
  { value: 'ResolutionPlan',       label: 'Resolution Plans' },
  { value: 'User',                 label: 'Users' },
  { value: 'Role',                 label: 'Roles' },
  { value: 'Department',           label: 'Departments' },
  { value: 'Workflow',             label: 'Workflows' },
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

// ── Human-readable change details ─────────────────────────────────────────────
// The audit `changes` payload is arbitrary JSON. Rather than dump it raw, render
// it as labelled rows: keys humanised ("ticket_id" → "Ticket id"), booleans as
// Yes/No, snake_case values (e.g. field names) humanised, and nested objects
// indented.

/** "ticket_id" → "Ticket id". */
const humanizeKey = (key) => {
  const s = String(key).replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** A lowercase snake_case identifier, e.g. an entity field name. */
const isIdentifier = (v) => typeof v === 'string' && /^[a-z0-9]+(_[a-z0-9]+)+$/.test(v);

/** Looks like an ISO 8601 date-time, e.g. "2026-08-20T18:30:00.000Z". */
const isIsoDateTime = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);

/** Formats a single non-object value for display. */
const formatScalar = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (isIsoDateTime(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    }
  }
  if (isIdentifier(v)) return humanizeKey(v);
  return String(v);
};

// Keys whose numeric array items are permission ids (older entries stored ids;
// newer ones store codes directly). We resolve ids to codes when a map is given.
const PERM_KEYS = new Set(['allowed', 'denied', 'permissions']);

function ChangeValue({ value, keyName, permMap }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400">—</span>;
    const allScalar = value.every((x) => x === null || typeof x !== 'object');
    if (allScalar) {
      const format = (permMap && PERM_KEYS.has(keyName))
        ? (x) => (typeof x === 'number' ? (permMap.get(x) || `#${x}`) : formatScalar(x))
        : formatScalar;
      return <span className="leading-relaxed">{value.map(format).join(', ')}</span>;
    }
    return <div className="space-y-2">{value.map((item, i) => <ChangeRows key={i} data={item} permMap={permMap} />)}</div>;
  }
  if (value && typeof value === 'object') {
    return <div className="pl-3 border-l border-gray-200 mt-1"><ChangeRows data={value} permMap={permMap} /></div>;
  }
  return <span>{formatScalar(value)}</span>;
}

function ChangeRows({ data, permMap }) {
  const entries = Object.entries(data || {});
  if (entries.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <div className="space-y-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-3 text-xs">
          <span className="text-gray-400 font-medium min-w-[130px] shrink-0">{humanizeKey(k)}</span>
          <span className="text-gray-700 break-words min-w-0"><ChangeValue value={v} keyName={k} permMap={permMap} /></span>
        </div>
      ))}
    </div>
  );
}

function ChangeDetails({ changes, permMap }) {
  if (changes == null) return null;
  // A truncated / non-JSON payload arrives as a string — show it as-is.
  if (typeof changes === 'string') {
    return <p className="text-xs text-gray-600 whitespace-pre-wrap break-words">{changes}</p>;
  }
  if (Array.isArray(changes)) return <ChangeValue value={changes} permMap={permMap} />;
  return <ChangeRows data={changes} permMap={permMap} />;
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  useAuth();
  const { me, loading: permLoading } = usePermissions();

  const [logs, setLogs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [action, setAction]   = useState('');
  const [module, setModule]   = useState('');   // audit `entity`
  const [actorId, setActorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]   = useState('');
  const [users, setUsers]     = useState([]);
  const [permMap, setPermMap] = useState(null); // permission id → code, for readable perm changes
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  const limit = 20;

  // The backend endpoint is `requireSystemRole`; mirror that gate on the client
  // so the page never briefly renders for a non-system user.
  const canView = !!me?.is_system;

  // Reads the current filter state — the applied filters are whatever's in the
  // inputs, so paging and re-filtering both use the same source.
  const fetchLogs = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (action)   params.set('action', action);
      if (module)   params.set('entity', module);
      if (actorId)  params.set('actor_id', actorId);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo)   params.set('date_to', dateTo);
      const res = await apiGet(`/audit-logs?${params.toString()}`);
      setLogs(res.data);
      setTotal(res.meta.pagination.total);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) {
      fetchLogs();
      // Populate the user filter (active users). Ignored if it fails.
      apiGet('/lookup/users').then((list) => setUsers(Array.isArray(list) ? list : [])).catch(() => {});
      // Permission id → code, so permission-change entries read as codes, not ids.
      apiGet('/lookup/permissions').then((list) => {
        if (Array.isArray(list)) setPermMap(new Map(list.map((p) => [p.id, p.code])));
      }).catch(() => {});
    } else if (!permLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading]);

  const applyFilters = (e) => { e.preventDefault(); setPage(1); setExpanded(null); fetchLogs(1); };
  const clearFilters = () => {
    setAction(''); setModule(''); setActorId(''); setDateFrom(''); setDateTo('');
    setPage(1); setExpanded(null);
    // Fetch with everything cleared (state updates are batched, so pass a reset).
    setLoading(true);
    apiGet(`/audit-logs?page=1&limit=${limit}`)
      .then((res) => { setLogs(res.data); setTotal(res.meta.pagination.total); })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };
  const goPage = (delta) => { const p = page + delta; setPage(p); setExpanded(null); fetchLogs(p); };
  const hasFilters = action || module || actorId || dateFrom || dateTo;

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

          <select value={module} onChange={(e) => setModule(e.target.value)}
            className="shrink-0 py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer">
            <option value="">All modules</option>
            {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>

          <select value={action} onChange={(e) => setAction(e.target.value)}
            className="shrink-0 py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer">
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={actorId} onChange={(e) => setActorId(e.target.value)}
            className="shrink-0 py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer max-w-[160px]">
            <option value="">All users</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>

          <label className="shrink-0 flex items-center gap-1 text-xs text-gray-400">
            From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer" />
          </label>
          <label className="shrink-0 flex items-center gap-1 text-xs text-gray-400">
            To
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer" />
          </label>

          <button type="submit" className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer"
            style={{ backgroundColor: 'var(--ams-primary)' }}>
            Filter
          </button>
          {hasFilters && (
            <button type="button" onClick={clearFilters}
              className="shrink-0 px-2.5 py-1.5 text-sm text-gray-500 hover:text-gray-800 cursor-pointer">
              Clear
            </button>
          )}

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
                            <div className="max-h-72 overflow-auto">
                              <ChangeDetails changes={row.changes} permMap={permMap} />
                            </div>
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
