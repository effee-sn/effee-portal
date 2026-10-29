'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';

/**
 * "Flows" on an enquiry: what Flow Builder flows did on it, in words — the
 * approvals asked (waiting ones first) and each run's steps ("Assigned to
 * Ravi", "Notified Asha"). Answers "why did this go to X?". Hidden when no
 * flow has touched the enquiry.
 */

const STATUS = {
  PENDING: { label: 'Waiting', cls: 'bg-amber-50 text-amber-800' },
  APPROVED: { label: 'Approved', cls: 'bg-green-50 text-green-700' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-700' },
};
const RUN = { DONE: 'text-gray-500', WAITING: 'text-amber-700', FAILED: 'text-red-600', RUNNING: 'text-gray-500' };
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function EnquiryFlows({ enquiryId, version }) {
  const [data, setData] = useState(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet(`/sales/enquiries/${enquiryId}/flows`, { silent: true })
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [enquiryId, version]);

  if (!data || (!data.runs.length && !data.approvals.length)) return null;
  const runs = all ? data.runs : data.runs.slice(0, 5);

  return (
    <section className="bg-white rounded border border-gray-200">
      <h2 className="px-4 py-2.5 border-b border-gray-200 text-sm font-semibold text-gray-800">
        Flows <span className="font-normal text-gray-500">· what Flow Builder did on this enquiry</span>
      </h2>
      <div className="p-4 space-y-4 text-sm">
        {data.approvals.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Approvals</p>
            {data.approvals.map((a) => {
              const s = STATUS[a.status] || STATUS.PENDING;
              return (
                <div key={a.id} className="flex items-start gap-2 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${s.cls}`}>{s.label}</span>
                  <div className="min-w-0">
                    <p className="text-gray-800">{a.title}</p>
                    <p className="text-xs text-gray-500">
                      Asked by {a.requested_by || '—'} · {when(a.created_at)}
                      {a.status === 'PENDING' && a.waiting_for.length ? ` · waiting for ${a.waiting_for.join(', ')}` : ''}
                      {a.status !== 'PENDING' && a.decided_by ? ` · ${a.status === 'APPROVED' ? 'approved' : 'rejected'} by ${a.decided_by}` : ''}
                      {a.comment ? ` — “${a.comment}”` : ''}
                      {a.status === 'APPROVED' ? (a.consumed_at ? ' · done' : ' · can go ahead now') : ''}
                    </p>
                  </div>
                  <Link href={`/dashboard/approvals?id=${a.id}`} className="ml-auto text-xs text-[var(--ams-primary)] hover:underline">Open</Link>
                </div>
              );
            })}
          </div>
        )}
        {data.runs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Runs</p>
            {runs.map((r) => (
              <div key={r.id} className="border-l-2 border-gray-200 pl-3">
                <p className="text-gray-800">
                  <span className="font-medium">{r.flow}</span>
                  <span className="text-xs text-gray-500"> v{r.version} · {r.trigger} · {when(r.started_at)}</span>
                  {r.status !== 'DONE' && <span className={`ml-1 text-xs font-medium ${RUN[r.status]}`}>· {r.status === 'WAITING' ? 'waiting' : r.status.toLowerCase()}</span>}
                </p>
                {r.steps.length > 0 && <p className="text-xs text-gray-600">{r.steps.join(' → ')}</p>}
                {r.error && <p className="text-xs text-red-600">{r.error}</p>}
              </div>
            ))}
            {data.runs.length > 5 && (
              <button type="button" onClick={() => setAll((v) => !v)} className="text-xs text-[var(--ams-primary)] hover:underline cursor-pointer">
                {all ? 'Show fewer' : `Show all ${data.runs.length}`}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
