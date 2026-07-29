'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import useNav from '@/lib/useNav';
import { apiGet } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import CreateTicketModal from '@/components/CreateTicketModal';
import { SEVERITY_STYLE, STATUS_STYLE } from '@/lib/serviceOptions';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/**
 * My Tickets — the assignment inbox.
 *
 * Shows only tickets the flow has assigned to the current user (directly, or via
 * their department/role). Requires no service permission — assignment alone
 * grants access, which is the scoped model from Phase 3.
 */
export default function ServiceInboxPage() {
  useAuth();
  const router = useRouter();
  const nav = useNav();
  const { me, can } = usePermissions();

  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // A Ticket Creator has SERVICE_CREATE but not SERVICE_VIEW, so they never see
  // the Services list — this is their entry point for raising a ticket.
  const canCreate = me?.is_system || can('SERVICE_CREATE');

  useEffect(() => {
    apiGet('/service/tickets/inbox?limit=50')
      .then((res) => { setRows(res.data); setTotal(res.meta.pagination.total); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={5} rows={6} />
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 bg-white">
          {canCreate && (
            <button onClick={() => setCreating(true)}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              New Ticket
            </button>
          )}
          <span className="text-sm font-medium text-gray-700 px-1">My Tickets</span>
          <span className="text-xs text-gray-400">{total} assigned to you</span>
        </div>

        {rows.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-400">Nothing assigned to you right now.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-3 font-normal">Ticket ID</th>
                  <th className="px-3 py-3 font-normal">Company</th>
                  <th className="px-3 py-3 font-normal">Issue</th>
                  <th className="px-3 py-3 font-normal">Severity</th>
                  <th className="px-3 py-3 font-normal">Status</th>
                  <th className="px-3 py-3 font-normal">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const sev = SEVERITY_STYLE[t.issue_severity] || {};
                  const st  = STATUS_STYLE[t.status] || {};
                  return (
                    <tr key={t.id} onClick={() => nav(`/dashboard/service/tickets/${t.id}`)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                      <td className="px-3 py-3 font-medium text-gray-800">{t.ticket_id}</td>
                      <td className="px-3 py-3 text-gray-600">{t.company_name}</td>
                      <td className="px-3 py-3 text-gray-600 truncate max-w-[240px]">{t.issue_title}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ color: sev.color, backgroundColor: sev.bg }}>{sev.label}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-medium" style={{ color: st.color }}>{st.label}</span>
                      </td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateTicketModal
          onClose={() => setCreating(false)}
          onCreated={(t) => router.push(`/dashboard/service/tickets/${t.id}`)}
        />
      )}
    </div>
  );
}
