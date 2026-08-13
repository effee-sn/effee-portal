'use client';

import { useState } from 'react';
import { apiPut } from '@/lib/api';
import { BILLING_TYPES } from '@/lib/serviceOptions';

/**
 * Ticket billing classification (finance/sales): billable / non-billable + a
 * free-text cost centre. Set at creation and editable here until the ticket is
 * closed, by anyone who can edit the ticket. Everyone with view access sees it.
 *
 * @param {{ ticketId: string|number, billingType: string|null, costCenter: string|null,
 *   closed: boolean, canEdit: boolean, onSaved: (ticket: object) => void }} props
 */
export default function TicketBilling({ ticketId, billingType, costCenter, closed, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [bt, setBt]           = useState(billingType || '');
  const [cc, setCc]           = useState(costCenter || '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const typeLabel = BILLING_TYPES.find((b) => b.value === billingType)?.label;
  const badge = billingType === 'BILLABLE'
    ? { color: '#15803d', bg: '#f0fdf4' }
    : { color: '#6b7280', bg: '#f3f4f6' };

  const open = () => { setBt(billingType || ''); setCc(costCenter || ''); setError(''); setEditing(true); };
  const cancel = () => { setEditing(false); setError(''); };

  // A billable ticket must carry a cost centre; a non-billable one never does.
  const needsCostCenter = bt === 'BILLABLE';
  const canSave = bt && (!needsCostCenter || cc.trim());

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setError('');
    try {
      const res = await apiPut(`/service/tickets/${ticketId}`, { billing_type: bt, cost_center: needsCostCenter ? cc : '' });
      onSaved?.(res.data);
      setEditing(false);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Billing</h2>
        {canEdit && !closed && !editing && (
          <button onClick={open} className="cursor-pointer text-sm text-gray-500 hover:text-gray-800">Edit</button>
        )}
        {editing && (
          <div className="flex items-center gap-2">
            <button onClick={cancel} className="cursor-pointer text-sm text-gray-500 hover:text-gray-800">Cancel</button>
            <button onClick={save} disabled={saving || !canSave}
              className="cursor-pointer px-3 py-1 text-sm font-medium text-white rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
        {closed && !editing && <span className="text-xs text-gray-400">Read-only (closed)</span>}
      </div>

      <div className="px-5 py-4">
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-4">{error}</div>}

        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Billing Type</label>
              <select value={bt} onChange={(e) => setBt(e.target.value)} className="ams-input">
                <option value="">— Select —</option>
                {BILLING_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            {needsCostCenter && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Cost Center <span className="text-red-500">*</span>
                </label>
                <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="e.g. CC-Sales-01" className="ams-input" />
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Billing Type</p>
              {billingType
                ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ color: badge.color, backgroundColor: badge.bg }}>{typeLabel}</span>
                : <span className="text-sm text-gray-400">Not set</span>}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Cost Center</p>
              <p className="text-sm text-gray-700">{costCenter || <span className="text-gray-400">—</span>}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
