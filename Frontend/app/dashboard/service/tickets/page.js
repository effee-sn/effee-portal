'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import useNav from '@/lib/useNav';
import { apiGet, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import CreateTicketModal from '@/components/CreateTicketModal';
// Shared styles so every status (Reopened, On Observation, Contacted, …) renders
// — the list must not fall behind the ticket's full status set.
import { SEVERITY_STYLE, STATUS_STYLE, TICKET_TYPES } from '@/lib/serviceOptions';

/** Formats an ISO timestamp as a short, locale-aware date. */
const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

// ── Delete confirm ──────────────────────────────────────────────────────────
function DeleteModal({ ticket, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const del = async () => {
    setSaving(true);
    try { await apiDelete(`/service/tickets/${ticket.id}`); onDeleted(ticket.id); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete ticket</h2>
        <p className="text-sm text-gray-500 mb-4">
          Delete <span className="font-medium text-gray-700">{ticket.ticket_id}</span>? This cannot be undone.
        </p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button onClick={del} disabled={saving} className="btn-danger flex-1 justify-center py-2">
            {saving ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function ServiceTicketsPage() {
  useAuth();
  const router = useRouter();
  const nav = useNav();
  const { me, can, loading: permLoading } = usePermissions();

  const [tickets, setTickets] = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);

  const limit = 10;

  const canView   = me?.is_system || can('SERVICE_VIEW');
  const canCreate = me?.is_system || can('SERVICE_CREATE');
  const canDelete = me?.is_system || can('SERVICE_DELETE');

  const fetchTickets = async (p = page, s = search) => {
    setLoading(true);
    try {
      const res = await apiGet(`/service/tickets?page=${p}&limit=${limit}&search=${encodeURIComponent(s)}`);
      setTickets(res.data);
      setTotal(res.meta.pagination.total);
    } catch { setTickets([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) fetchTickets();
    else if (!permLoading) setLoading(false);
  }, [permLoading]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); fetchTickets(1, search); };
  const goPage = (delta) => { const p = page + delta; setPage(p); fetchTickets(p, search); };

  const onCreated = (t) => { setTickets((prev) => [t, ...prev]); setTotal((n) => n + 1); };
  const onDeleted = (id) => { setTickets((prev) => prev.filter((t) => t.id !== id)); setTotal((n) => n - 1); };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  if (permLoading || loading) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={6} rows={7} />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view services.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        {/* Control panel */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap bg-white">
          {canCreate && (
            <button onClick={() => setModal({ type: 'create' })}
              className="cursor-pointer shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              New
            </button>
          )}
          <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Services</span>
          <div className="flex-1 min-w-0" />

          <form onSubmit={onSearch} className="shrink-0 flex items-center border border-gray-300 rounded bg-white overflow-hidden"
            style={{ minWidth: 220 }}>
            <span className="px-2.5 text-gray-400 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets…"
              className="flex-1 min-w-0 py-1.5 pr-2.5 text-sm text-gray-700 outline-none bg-transparent" />
          </form>

          <div className="flex items-center gap-0.5 shrink-0 text-sm text-gray-500">
            <span className="px-1 tabular-nums">{total === 0 ? '0' : `${from}-${to}`} / {total}</span>
            <button onClick={() => goPage(-1)} disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={() => goPage(1)} disabled={page * limit >= total}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {tickets.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">No tickets found.</div>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: 940 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-3 font-normal">Ticket ID</th>
                  <th className="px-3 py-3 font-normal">Source Type</th>
                  <th className="px-3 py-3 font-normal">Company</th>
                  <th className="px-3 py-3 font-normal">Issue</th>
                  <th className="px-3 py-3 font-normal">Severity</th>
                  <th className="px-3 py-3 font-normal">Status</th>
                  <th className="px-3 py-3 font-normal">Created By</th>
                  <th className="px-3 py-3 font-normal">Created</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const sev = SEVERITY_STYLE[t.issue_severity] || {};
                  const st  = STATUS_STYLE[t.status] || {};
                  return (
                    <tr key={t.id} onClick={() => nav(`/dashboard/service/tickets/${t.id}`)}
                      className="border-b border-gray-100 hover:bg-gray-50 group cursor-pointer">
                      <td className="px-3 py-3 font-medium text-gray-800">{t.ticket_id}</td>
                      <td className="px-3 py-3 text-gray-600">{TICKET_TYPES.find((o) => o.value === t.ticket_type)?.label || t.ticket_type}</td>
                      <td className="px-3 py-3 text-gray-600">{t.company_name}</td>
                      <td className="px-3 py-3 text-gray-600 truncate max-w-[220px]">{t.issue_title}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ color: sev.color, backgroundColor: sev.bg }}>{sev.label}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-medium" style={{ color: st.color }}>{st.label}</span>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{t.created_by_name || '—'}</td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{formatDate(t.created_at)}</td>
                      <td className="px-3 py-3 text-right">
                        {canDelete && (
                          <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'delete', ticket: t }); }}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
                            title="Delete">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal?.type === 'create' && <CreateTicketModal onClose={() => setModal(null)} onCreated={onCreated} />}
      {modal?.type === 'delete' && <DeleteModal ticket={modal.ticket} onClose={() => setModal(null)} onDeleted={onDeleted} />}
    </div>
  );
}
