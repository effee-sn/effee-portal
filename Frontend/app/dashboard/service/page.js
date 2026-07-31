'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet } from '@/lib/api';
import { SEVERITY_STYLE, STATUS_STYLE } from '@/lib/serviceOptions';

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold leading-none" style={{ color: accent || '#111827' }}>{value}</p>
    </div>
  );
}

function Breakdown({ title, data, styleMap }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h2>
      <div className="space-y-2.5">
        {Object.entries(data).map(([key, count]) => {
          const s = styleMap[key] || { label: key, color: '#6B7280' };
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium" style={{ color: s.color }}>{s.label}</span>
                <span className="text-gray-500 tabular-nums">{count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(count / total) * 100}%`, backgroundColor: s.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ServiceDashboardPage() {
  useAuth();
  const { me, can, loading: permLoading } = usePermissions();

  const [data, setData]       = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);

  const canView = me?.is_system || can('SERVICE_VIEW');

  useEffect(() => {
    if (permLoading) return;
    if (!canView) { setLoading(false); return; }
    apiGet('/service')
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [permLoading, canView]);

  if (permLoading || loading) {
    return (
      <div className="max-w-5xl space-y-4 animate-pulse p-4 sm:p-6 pb-8">
        <div className="h-7 w-52 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view the Service area.</p>
      </div>
    );
  }

  return (
    <div className="max-w-8xl p-4 sm:p-6 pb-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Service Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Overview of service tickets</p>
        </div>
        <Link href="/dashboard/service/tickets" className="btn-secondary text-sm">View all services →</Link>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">{error}</div>
      )}

      {/* Stat cards — the lifecycle at a glance. "Active" = still needs work
          (open + in progress + contacted + reopened); On Observation is parked
          awaiting the customer. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Tickets" value={data.total} />
        <StatCard label="Active" value={data.active} accent="#D97706" />
        <StatCard label="On Observation" value={data.on_observation} accent="#0891B2" />
        <StatCard label="Resolved" value={data.by_status.RESOLVED} accent="#059669" />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <Breakdown title="By Status" data={data.by_status} styleMap={STATUS_STYLE} />
        <Breakdown title="By Severity" data={data.by_severity} styleMap={SEVERITY_STYLE} />
      </div>

      {/* Recent */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Recent Tickets</h2>
        </div>
        {data.recent.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No tickets yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-5 py-2.5 font-normal">Ticket</th>
                <th className="px-5 py-2.5 font-normal">Company</th>
                <th className="px-5 py-2.5 font-normal">Issue</th>
                <th className="px-5 py-2.5 font-normal">Severity</th>
                <th className="px-5 py-2.5 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((t) => {
                const sev = SEVERITY_STYLE[t.issue_severity] || {};
                const st  = STATUS_STYLE[t.status] || {};
                return (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-2.5 font-medium text-gray-700">{t.ticket_id}</td>
                    <td className="px-5 py-2.5 text-gray-600">{t.company_name}</td>
                    <td className="px-5 py-2.5 text-gray-600 truncate max-w-xs">{t.issue_title}</td>
                    <td className="px-5 py-2.5">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ color: sev.color, backgroundColor: sev.bg }}>{sev.label}</span>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="text-xs font-medium" style={{ color: st.color }}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
