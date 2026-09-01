'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/api';

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

/**
 * Sales workflow configuration, surfaced inside the Flow Builder. The sales
 * pipeline hands each enquiry between the field initiator (whoever raises it)
 * and a single Internal Sales handler selected here — it is not a step
 * workflow, so it lives as its own card rather than a Workflow row.
 *
 * Saving hits `/sales/workflow` (SALES_EDIT); pass `canEdit` to enable it.
 */
export default function SalesWorkflowCard({ canEdit = false }) {
  const [users, setUsers]           = useState([]);
  const [internalId, setInternalId] = useState('');
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [saved, setSaved]           = useState(false);

  useEffect(() => {
    Promise.all([
      apiGet('/sales/workflow').then((r) => setInternalId(r.data?.internal_user_id ? String(r.data.internal_user_id) : '')).catch(() => {}),
      apiGet('/lookup/users').then(setUsers).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      await apiPut('/sales/workflow', { internal_user_id: internalId ? Number(internalId) : null });
      setSaved(true);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden mb-4">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700 px-1">Sales Workflow</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">sales</span>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <p className="text-sm text-gray-400 py-2">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* The handoff, at a glance */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">How an enquiry flows</p>
              <ol className="text-sm text-gray-600 space-y-1.5">
                <li><span className="font-medium text-gray-800">Field</span> raises it → moves to Review</li>
                <li><span className="font-medium text-gray-800">Internal</span> handles Review → Costing Review → prepares &amp; sends the offer</li>
                <li><span className="font-medium text-gray-800">Field</span> follows up</li>
                <li><span className="font-medium text-gray-800">Internal</span> prepares &amp; sends each revised (negotiation) offer</li>
                <li><span className="font-medium text-gray-800">Field</span> follows up — loops until the follow-up is ended</li>
                <li><span className="font-medium text-gray-800">Internal</span> marks it Won / Lost</li>
              </ol>
              <p className="text-xs text-gray-400 mt-3">
                The <span className="font-medium">Field</span> person is whoever raises each enquiry. The
                <span className="font-medium"> Internal</span> person is selected here.
              </p>
            </div>

            {/* The selection */}
            <form onSubmit={save} className="space-y-3">
              {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
              {saved && <div className="px-3 py-2.5 rounded bg-green-50 border border-green-200 text-green-700 text-sm">Saved.</div>}
              <div>
                <label className={label}>Internal Sales handler</label>
                <select value={internalId} disabled={!canEdit}
                  onChange={(e) => { setInternalId(e.target.value); setSaved(false); }}
                  className="ams-input disabled:bg-gray-50 disabled:text-gray-500">
                  <option value="">— None (stays with the field initiator) —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Until this is set, enquiries stay with whoever raised them.</p>
              </div>
              {canEdit ? (
                <button type="submit" disabled={saving} className="btn-primary px-4 py-2 justify-center">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              ) : (
                <p className="text-xs text-gray-400">You need the Sales edit permission to change this.</p>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
