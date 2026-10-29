'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { STAGE_STYLE } from '@/lib/salesOptions';

/**
 * Sales → Assign to my team: enquiries a Flow Builder flow sent to a department
 * the user heads ("head picks"). The head holds each one until they choose
 * who in the team takes it. A Super Admin sees every department's queue.
 */

const ENQ = '/dashboard/sales/enquiries';

/** "3 hours", "2 days" since it arrived. */
function waited(since, now) {
  const h = Math.floor((now - new Date(since).getTime()) / 36e5);
  if (h < 1) return 'under an hour';
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${Math.floor(h / 24)} days`;
}

function StageChip({ stage }) {
  const s = STAGE_STYLE[stage];
  if (!s) return null;
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap" style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>;
}

function Row({ e, team, now, onDone }) {
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assign = async () => {
    if (!pick || busy) return;
    setBusy(true); setError('');
    try { await apiPost(`/sales/enquiries/${e.id}/assign-from-queue`, { user_id: Number(pick) }); onDone(); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <tr className="border-b border-gray-100 align-top">
      <td className="px-4 py-2.5 min-w-[220px]">
        <Link href={`${ENQ}/${e.id}`} className="font-mono text-xs font-semibold text-blue-600 hover:underline">{e.ref_no}</Link>
        <p className="text-gray-800">{e.title}</p>
        <p className="text-xs text-gray-500">{e.customer?.name || '—'}</p>
      </td>
      <td className="px-3 py-2.5"><StageChip stage={e.stage} /></td>
      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{e.owner?.name || '—'}</td>
      <td className={`px-3 py-2.5 whitespace-nowrap ${now - new Date(e.queued_at).getTime() > 4 * 36e5 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>{waited(e.queued_at, now)}</td>
      <td className="px-3 py-2.5 whitespace-nowrap text-right">
        <select value={pick} onChange={(ev) => setPick(ev.target.value)} aria-label={`Team member for ${e.ref_no}`}
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 cursor-pointer">
          <option value="">Choose…</option>
          {team.map((u) => <option key={u.id} value={u.id}>{u.name}{u.is_head ? ' (keep it)' : ''}</option>)}
        </select>
        <button type="button" onClick={assign} disabled={!pick || busy} className="btn-primary ml-2 px-3 py-1 text-sm disabled:opacity-50">
          {busy ? 'Assigning…' : 'Assign'}
        </button>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </td>
    </tr>
  );
}

export default function TeamQueuePage() {
  useAuth();
  const { me, loading: permLoading } = usePermissions();
  const allowed = Boolean(me?.is_system || me?.team_queue);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (permLoading || !allowed) return undefined;
    let cancelled = false;
    apiGet('/sales/team-queue', { silent: true })
      .then((r) => { if (!cancelled) { setData({ ...r.data, now: Date.now() }); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [permLoading, allowed, version]);

  if (permLoading) return <div className="p-4"><TableSkeleton cols={5} rows={5} /></div>;
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Nothing to assign</p>
        <p className="text-sm text-gray-500">This page is for department heads.</p>
      </div>
    );
  }

  const byDept = (id) => (data?.items || []).filter((e) => e.queue_department_id === id);

  return (
    <div className="p-4 pb-10 space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">Assign to my team</h1>
        <p className="text-sm text-gray-500">Enquiries sent to your department by a Flow Builder flow. They are with you until you choose who in the team takes them; you are reminded after 4 hours.</p>
      </header>
      {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
      {!data ? <div className="bg-white rounded border border-gray-200"><TableSkeleton cols={5} rows={4} /></div> : !data.departments.length ? (
        <p className="py-16 text-center text-sm text-gray-400 bg-white rounded border border-gray-200">
          {me?.is_system ? 'Nothing is waiting in any department’s queue.' : 'You don’t head a department, so nothing is sent here.'}
        </p>
      ) : data.departments.map((d) => {
        const items = byDept(d.id);
        return (
          <section key={d.id} className="bg-white rounded border border-gray-200">
            <h2 className="px-4 py-2.5 border-b border-gray-200 text-sm font-semibold text-gray-800">
              {d.name} <span className="ml-1 font-normal text-gray-500">· {items.length} waiting · team of {d.team.length}</span>
            </h2>
            {!items.length ? (
              <p className="py-8 text-center text-sm text-gray-400">Nothing waiting.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 820 }}>
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-4 py-2.5 font-normal">Enquiry</th>
                      <th className="px-3 py-2.5 font-normal">Stage</th>
                      <th className="px-3 py-2.5 font-normal">Owner</th>
                      <th className="px-3 py-2.5 font-normal">Waiting</th>
                      <th className="px-3 py-2.5 font-normal text-right">Assign to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => <Row key={e.id} e={e} team={d.team} now={data.now} onDone={reload} />)}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
