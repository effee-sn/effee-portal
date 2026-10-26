'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import EnquiryPicker from '@/components/EnquiryPicker';

/**
 * Create / edit a project. A new project also says how many machines it
 * starts with; each gets its Machine ID on save (previewed here).
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

export const STATUSES = [
  { value: 'PLANNING',  label: 'Planning' },
  { value: 'ACTIVE',    label: 'Active' },
  { value: 'ON_HOLD',   label: 'On hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];
const STATUS_STYLE = {
  PLANNING:  { label: 'Planning',  color: '#4F46E5', bg: '#EEF2FF' },
  ACTIVE:    { label: 'Active',    color: '#15803D', bg: '#F0FDF4' },
  ON_HOLD:   { label: 'On hold',   color: '#B45309', bg: '#FFFBEB' },
  COMPLETED: { label: 'Completed', color: '#0F766E', bg: '#ECFDF5' },
  CANCELLED: { label: 'Cancelled', color: '#DC2626', bg: '#FEF2F2' },
};
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/** prefix + separator + zero-padded number — mirrors the server. */
export const formatMachineNo = (n, num) => `${n.prefix}${n.separator || ''}${String(num).padStart(n.digits, '0')}`;

export function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>
  );
}

export default function ProjectModal({ project, users, onClose, onSaved }) {
  const isEdit = Boolean(project);
  const [form, setForm] = useState({
    name:        project?.name || '',
    status:      project?.status || 'PLANNING',
    enquiry_id:  project?.enquiry_id ? String(project.enquiry_id) : '',
    owner_id:    project?.owner_id ? String(project.owner_id) : '',
    start_date:  toDateInput(project?.start_date),
    end_date:    toDateInput(project?.end_date),
    description: project?.description || '',
    machines:    '1',
  });
  const [numbering, setNumbering] = useState(null);
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };

  // The Machine IDs a new project's machines will get.
  useEffect(() => {
    if (isEdit) return undefined;
    let cancelled = false;
    apiGet('/projects/machine-numbering', { silent: true }).then((r) => { if (!cancelled) setNumbering(r.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isEdit]);
  const count = Math.max(0, Math.min(50, Number(form.machines) || 0));
  const preview = numbering && count
    ? count === 1 ? formatMachineNo(numbering, numbering.next_number)
      : `${formatMachineNo(numbering, numbering.next_number)} … ${formatMachineNo(numbering, numbering.next_number + count - 1)}`
    : null;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { machines, ...rest } = form;
      const res = isEdit
        ? await apiPut(`/projects/${project.id}`, rest)
        : await apiPost('/projects', { ...rest, machines: count });
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

          {!isEdit && (
            <div>
              <label className={label}>Machines</label>
              <div className="flex items-center gap-3 flex-wrap">
                <input name="machines" type="number" min={0} max={50} value={form.machines} onChange={change} className="ams-input w-28" />
                {preview && <span className="text-sm text-gray-600">Machine IDs <span className="font-mono font-semibold text-gray-800">{preview}</span> <span className="text-gray-400">(given on save)</span></span>}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Each machine gets its own Machine ID, used in the project&apos;s BOM and tag numbers. You can add more later.</p>
            </div>
          )}

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
