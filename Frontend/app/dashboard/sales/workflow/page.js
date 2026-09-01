'use client';

import { useEffect, useState } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPut } from '@/lib/api';

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

/**
 * Sales Workflow settings — selects the single Internal Sales handler the
 * enquiry hands off to for the preparation, negotiation-send and close phases.
 * The field initiator (whoever raises an enquiry) owns intake and every
 * follow-up; this is the person on the other side of the baton.
 */
export default function SalesWorkflowPage() {
  useAuth();
  const { can, loading: permLoading } = usePermissions();
  const canEdit = can('SALES_EDIT');

  const [users, setUsers]     = useState([]);
  const [internalId, setInternalId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    if (permLoading) return;
    Promise.all([
      apiGet('/sales/workflow').then((r) => setInternalId(r.data?.internal_user_id ? String(r.data.internal_user_id) : '')).catch(() => {}),
      apiGet('/lookup/users').then(setUsers).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [permLoading]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      await apiPut('/sales/workflow', { internal_user_id: internalId ? Number(internalId) : null });
      setSaved(true);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  if (permLoading || loading) {
    return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  }
  if (!canEdit) {
    return <div className="p-6 text-sm text-gray-500">You don’t have permission to configure the sales workflow.</div>;
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">Sales Workflow</h1>
        <p className="text-sm text-gray-500 mt-0.5">Who handles the internal part of every enquiry.</p>
      </div>

      {/* The handoff, at a glance */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">How an enquiry flows</p>
        <ol className="text-sm text-gray-600 space-y-1.5">
          <li><span className="font-medium text-gray-800">Field</span> raises it → moves to Review</li>
          <li><span className="font-medium text-gray-800">Internal</span> handles Review → Costing Review → prepares & sends the offer</li>
          <li><span className="font-medium text-gray-800">Field</span> follows up</li>
          <li><span className="font-medium text-gray-800">Internal</span> prepares & sends each revised (negotiation) offer</li>
          <li><span className="font-medium text-gray-800">Field</span> follows up — loops until the follow-up is ended</li>
          <li><span className="font-medium text-gray-800">Internal</span> marks it Won / Lost</li>
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          The <span className="font-medium">Field</span> person is whoever raises each enquiry. The
          <span className="font-medium"> Internal</span> person is selected below.
        </p>
      </div>

      {/* The selection */}
      <form onSubmit={save} className="bg-white rounded-lg border border-gray-200 px-5 py-4 space-y-4">
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
        {saved && <div className="px-3 py-2.5 rounded bg-green-50 border border-green-200 text-green-700 text-sm">Saved.</div>}
        <div>
          <label className={label}>Internal Sales handler</label>
          <select value={internalId} onChange={(e) => { setInternalId(e.target.value); setSaved(false); }} className="ams-input">
            <option value="">— None (stays with the field initiator) —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Until this is set, enquiries stay with whoever raised them.</p>
        </div>
        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 justify-center">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
