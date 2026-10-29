'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

/**
 * Shown on an enquiry waiting in a department's queue (a Flow Builder flow sent
 * it to the department, "head picks"): who is to assign it, and — for that
 * department's head or a Super Admin — the choice of team member right here.
 */
export default function EnquiryQueueBanner({ enquiry, me, onAssigned }) {
  const dept = enquiry.queue_department;
  const canAssign = Boolean(me?.is_system || (me?.id != null && me.id === dept?.head_user_id));
  const [team, setTeam] = useState([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canAssign) return;
    apiGet('/sales/team-queue', { silent: true })
      .then((r) => setTeam(r.data.departments.find((d) => d.id === enquiry.queue_department_id)?.team || []))
      .catch(() => {});
  }, [canAssign, enquiry.queue_department_id]);

  const assign = async () => {
    if (!pick || busy) return;
    setBusy(true); setError('');
    try { const r = await apiPost(`/sales/enquiries/${enquiry.id}/assign-from-queue`, { user_id: Number(pick) }); onAssigned(r.data); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 flex items-center gap-3 flex-wrap rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>
        Waiting in <strong>{dept?.name || 'a department'}</strong>&rsquo;s queue —{' '}
        {canAssign ? 'choose who in the team takes it:' : `${enquiry.handler?.name || 'the department head'} will assign it to someone in the team.`}
      </span>
      {canAssign && (
        <>
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Team member"
            className="text-sm border border-amber-300 rounded px-2 py-1 bg-white text-gray-800 cursor-pointer">
            <option value="">Choose…</option>
            {team.map((u) => <option key={u.id} value={u.id}>{u.name}{u.is_head ? ' (head — keep it)' : ''}</option>)}
          </select>
          <button type="button" onClick={assign} disabled={!pick || busy} className="btn-primary px-3 py-1 text-sm disabled:opacity-50">
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </>
      )}
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
}
