'use client';

import { useState } from 'react';
import { apiPost, apiPut, apiDelete } from '@/lib/api';
import EnquiryPicker from '@/components/EnquiryPicker';
import useCurrencies from '@/lib/money';

/**
 * Projects: the create / edit form, the delete dialog and the status badge —
 * shared by the list (Projects) and a project's own page.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

export const STATUSES = [
  { value: 'PLANNING',  label: 'Planning' },
  { value: 'ACTIVE',    label: 'Active' },
  { value: 'ON_HOLD',   label: 'On hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];
export const STATUS_STYLE = {
  PLANNING:  { label: 'Planning',  color: '#4F46E5', bg: '#EEF2FF' },
  ACTIVE:    { label: 'Active',    color: '#15803D', bg: '#F0FDF4' },
  ON_HOLD:   { label: 'On hold',   color: '#B45309', bg: '#FFFBEB' },
  COMPLETED: { label: 'Completed', color: '#0F766E', bg: '#ECFDF5' },
  CANCELLED: { label: 'Cancelled', color: '#DC2626', bg: '#FEF2F2' },
};
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>
  );
}

// ── Create / edit modal ─────────────────────────────────────────────────────────
export function ProjectModal({ project, users, onClose, onSaved }) {
  const isEdit = Boolean(project);
  const [form, setForm] = useState({
    name:        project?.name || '',
    status:      project?.status || 'PLANNING',
    enquiry_id:  project?.enquiry_id ? String(project.enquiry_id) : '',
    owner_id:    project?.owner_id ? String(project.owner_id) : '',
    start_date:  toDateInput(project?.start_date),
    end_date:    toDateInput(project?.end_date),
    description: project?.description || '',
    cost:          project?.cost != null ? String(project.cost) : '',
    cost_currency: project?.cost_currency || '',
  });
  const currencies = useCurrencies();
  // A new project starts in the default currency.
  const currency = form.cost_currency || currencies?.defaultCode || 'INR';
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = isEdit
        ? await apiPut(`/projects/${project.id}`, { ...form, cost_currency: currency })
        : await apiPost('/projects', { ...form, cost_currency: currency });
      onSaved(res.data, isEdit);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? `Edit ${project.code}` : 'New Project'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

          <div>
            <label className={label}>Name<span className="text-red-500"> *</span></label>
            <input name="name" value={form.name} onChange={change} required placeholder="e.g. Solar rooftop — HQ" className="ams-input" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Status</label>
              <select name="status" value={form.status} onChange={change} className="ams-input">
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Owner</label>
              <select name="owner_id" value={form.owner_id} onChange={change} className="ams-input">
                <option value="">— None —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Linked enquiry <span className="normal-case font-normal text-gray-400">(optional)</span></label>
            <EnquiryPicker
              initialEnquiry={project?.enquiry || null}
              onChange={(id) => setForm((f) => ({ ...f, enquiry_id: id ? String(id) : '' }))}
            />
          </div>

          <div>
            <label className={label}>Project cost</label>
            <div className="flex gap-2">
              <select name="cost_currency" value={currency} onChange={change} aria-label="Cost currency" className="ams-input w-28 shrink-0">
                {(currencies?.list || [{ code: currency }]).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
              <input name="cost" type="number" min="0" step="0.01" inputMode="decimal" value={form.cost} onChange={change}
                placeholder="Amount" aria-label="Project cost" className="ams-input flex-1" />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Entered here for now — later it will come from the linked enquiry&apos;s final costing value.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Start date</label>
              <input name="start_date" type="date" value={form.start_date} onChange={change} className="ams-input" />
            </div>
            <div>
              <label className={label}>End date</label>
              <input name="end_date" type="date" value={form.end_date} onChange={change} className="ams-input" />
            </div>
          </div>

          <div>
            <label className={label}>Description</label>
            <textarea name="description" value={form.description} onChange={change} rows={3} className="ams-input resize-none" />
          </div>

          <div className="flex gap-3 pt-1 pb-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete modal ──────────────────────────────────────────────────────────────
export function DeleteModal({ project, onClose, onDeleted }) {
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const del = async () => {
    setSaving(true); setError('');
    try { await apiDelete(`/projects/${project.id}`); onDeleted(project.id); onClose(); }
    catch (err) { setError(err.message); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete Project</h2>
        <p className="text-sm text-gray-500 mb-4">Delete <span className="font-medium text-gray-700">{project.code} · {project.name}</span>? This cannot be undone.</p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button onClick={del} disabled={saving} className="btn-danger flex-1 justify-center py-2">{saving ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}
