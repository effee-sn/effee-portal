'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

/**
 * My Approvals: what Flow Builder flows ask you to approve before an action
 * (marking an offer sent, Won, Lost, a stage move, reopening). Approve or reject
 * with a comment; the person who asked is told, and an approved action goes
 * through when they do it again. Also what you decided, what you asked for,
 * and — for a Super Admin — everything (they may decide any pending one).
 */

const TABS = [
  { key: 'waiting', label: 'Waiting for me' },
  { key: 'decided', label: 'Decided by me' },
  { key: 'requested', label: 'Asked by me' },
];
const STATUS = {
  PENDING: { label: 'Waiting', cls: 'bg-amber-50 text-amber-800' },
  APPROVED: { label: 'Approved', cls: 'bg-green-50 text-green-700' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-700' },
};
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

function Card({ a, me, onDecided, highlight }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = a.approvers.find((x) => x.user_id === me?.id);
  const canDecide = a.status === 'PENDING' && ((mine && mine.decision === 'PENDING') || me?.is_system);

  const decide = async (decision) => {
    if (busy) return;
    if (decision === 'REJECTED' && !comment.trim()) { setError('Say why it is rejected — the person who asked sees it.'); return; }
    setBusy(true); setError('');
    try { await apiPost(`/approvals/${a.id}/decide`, { decision, comment: comment.trim() || undefined }); onDecided(); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  const s = STATUS[a.status] || STATUS.PENDING;
  return (
    <article className={`bg-white rounded border p-4 space-y-3 ${highlight ? 'border-[var(--ams-primary)] ring-1 ring-[var(--ams-primary)]' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{a.title}</p>
          <p className="text-xs text-gray-500">
            Asked by {a.requested_by_name || '—'} · {when(a.created_at)}
            {a.mode === 'ALL' ? ' · everyone must approve' : ''}
            {a.escalated_at ? ' · escalated' : ''}
          </p>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>{s.label}</span>
      </div>

      {a.summary && (
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-sm">
          {a.summary.split('\n').map((line, i) => {
            const at = line.indexOf(': ');
            return at > 0
              ? [<dt key={`k${i}`} className="text-gray-500">{line.slice(0, at)}</dt>, <dd key={`v${i}`} className="text-gray-800">{line.slice(at + 2)}</dd>]
              : <dd key={i} className="col-span-2 text-gray-800">{line}</dd>;
          })}
        </dl>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {a.approvers.map((x) => (
          <span key={x.user_id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-700" title={x.comment || ''}>
            {x.decision === 'APPROVED' ? '✓' : x.decision === 'REJECTED' ? '✗' : '…'} {x.name || '—'}{x.is_escalation ? ' (escalated)' : ''}
          </span>
        ))}
      </div>

      {a.status !== 'PENDING' && (
        <p className="text-sm text-gray-700">
          {a.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {a.decided_by_name || '—'} · {when(a.decided_at)}
          {a.comment ? <span className="text-gray-600"> — “{a.comment}”</span> : null}
          {a.status === 'APPROVED' && (a.consumed_at ? ' · done' : ' · not done yet')}
        </p>
      )}

      {canDecide && (
        <div className="space-y-2 pt-1 border-t border-gray-100">
          {!mine && <p className="text-xs text-amber-700 pt-2">You are deciding as Super Admin, in place of the approvers.</p>}
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={1000}
            placeholder="Comment (needed to reject)" className="ams-input w-full text-sm mt-2" aria-label="Comment" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => decide('APPROVED')} disabled={busy}
              className="px-3 py-1.5 text-sm font-medium text-white rounded cursor-pointer disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>Approve</button>
            <button type="button" onClick={() => decide('REJECTED')} disabled={busy} className="btn-danger px-3 py-1.5 text-sm cursor-pointer">Reject</button>
            {a.link && <Link href={a.link} className="ml-auto text-sm text-[var(--ams-primary)] hover:underline">Open the enquiry</Link>}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
      {!canDecide && a.link && <Link href={a.link} className="inline-block text-sm text-[var(--ams-primary)] hover:underline">Open the enquiry</Link>}
    </article>
  );
}

function Approvals() {
  useAuth();
  const params = useSearchParams();
  const focusId = Number(params.get('id')) || null;
  const { me, loading: permLoading } = usePermissions();
  const tabs = me?.is_system ? [...TABS, { key: 'all', label: 'All' }] : TABS;
  const [tab, setTab] = useState('waiting');
  const [data, setData] = useState(null);
  const [focus, setFocus] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (permLoading) return undefined;
    let cancelled = false;
    apiGet(`/approvals?tab=${tab}&limit=100`, { silent: true })
      .then((r) => { if (!cancelled) { setData(r); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [tab, permLoading, version]);

  // ?id= (from a notification or email): that one, on top, whichever tab it is in.
  useEffect(() => {
    if (permLoading || !focusId) return undefined;
    let cancelled = false;
    apiGet(`/approvals/${focusId}`, { silent: true })
      .then((r) => { if (!cancelled) setFocus(r.data); })
      .catch(() => { if (!cancelled) setFocus(null); });
    return () => { cancelled = true; };
  }, [focusId, permLoading, version]);

  if (permLoading) return <div className="p-4"><TableSkeleton cols={4} rows={4} /></div>;
  const items = (data?.data || []).filter((a) => a.id !== focus?.id);

  return (
    <div className="p-4 pb-10 space-y-4 max-w-4xl">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">My Approvals</h1>
        <p className="text-sm text-gray-500">Actions a Flow Builder flow holds until someone approves. The person who asked is told your decision; an approved action goes through when they do it again.</p>
      </header>
      <div className="flex gap-1 border-b border-gray-200" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 cursor-pointer ${tab === t.key ? 'text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            style={tab === t.key ? { borderColor: 'var(--ams-primary)' } : undefined}>
            {t.label}{t.key === 'waiting' && tab === 'waiting' && data ? ` (${data.meta?.pagination?.total ?? data.data.length})` : ''}
          </button>
        ))}
      </div>
      {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
      {focus && <Card a={focus} me={me} onDecided={reload} highlight />}
      {!data ? <TableSkeleton cols={4} rows={4} /> : !items.length && !focus ? (
        <p className="py-16 text-center text-sm text-gray-400 bg-white rounded border border-gray-200">
          {tab === 'waiting' ? 'Nothing is waiting for your approval.' : 'Nothing here yet.'}
        </p>
      ) : (
        <div className="space-y-3">{items.map((a) => <Card key={a.id} a={a} me={me} onDecided={reload} />)}</div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="p-4"><TableSkeleton cols={4} rows={4} /></div>}>
      <Approvals />
    </Suspense>
  );
}
