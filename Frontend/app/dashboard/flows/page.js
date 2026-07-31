'use client';

import { useEffect, useState } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

// `ORIGINATING_HEAD` is a builder-only convenience: it maps to the backend's
// DEPARTMENT_HEAD type with no fixed department, which the engine resolves to
// the head of the ticket's originating department at runtime.
const ASSIGNEE_TYPES = [
  { value: 'USER',             label: 'Specific User' },
  { value: 'ROLE',             label: 'Role' },
  { value: 'DEPARTMENT',       label: 'Department (any member)' },
  { value: 'DEPARTMENT_HEAD',  label: 'Department Head (specific dept)' },
  { value: 'ORIGINATING_HEAD', label: 'Originating Department Head' },
  { value: 'CREATOR',          label: 'Ticket Initiator (who raised it)' },
  { value: 'MANUAL',           label: 'Manual (picked by previous stage)' },
];

const blankStep = () => ({
  name: '', assignee_type: 'USER',
  assignee_user_id: '', assignee_role_id: '', assignee_department_id: '',
});

/** The standard service flow, pre-filled so admins adjust rather than build from scratch. */
const TEMPLATE = {
  name: 'Standard Service Flow',
  description: 'Initiator raises → PM triages → routed to the originating department’s head → resolved → back to the initiator to confirm.',
  is_active: true,
  steps: [
    { ...blankStep(), name: 'Triage',           assignee_type: 'USER' },
    { ...blankStep(), name: 'Route',            assignee_type: 'ORIGINATING_HEAD' },
    { ...blankStep(), name: 'Resolve',          assignee_type: 'MANUAL' },
    { ...blankStep(), name: 'Customer Confirm', assignee_type: 'CREATOR' },
  ],
};

/** Maps a saved step (from the API) into the builder's form shape. */
function stepToForm(s) {
  // DEPARTMENT_HEAD with no department is the "originating" variant.
  const type = s.assignee_type === 'DEPARTMENT_HEAD' && !s.assignee_department_id
    ? 'ORIGINATING_HEAD'
    : s.assignee_type;
  return {
    name: s.name,
    assignee_type: type,
    assignee_user_id: s.assignee_user_id || '',
    assignee_role_id: s.assignee_role_id || '',
    assignee_department_id: s.assignee_department_id || '',
  };
}

/** Maps a builder form step into the API payload. */
function stepToPayload(s) {
  const step = { name: s.name };
  if (s.assignee_type === 'ORIGINATING_HEAD') { step.assignee_type = 'DEPARTMENT_HEAD'; return step; }
  step.assignee_type = s.assignee_type;
  if (s.assignee_type === 'USER')  step.assignee_user_id = s.assignee_user_id;
  if (s.assignee_type === 'ROLE')  step.assignee_role_id = s.assignee_role_id;
  if (s.assignee_type === 'DEPARTMENT' || s.assignee_type === 'DEPARTMENT_HEAD') {
    step.assignee_department_id = s.assignee_department_id;
  }
  return step;
}

/** Human label for a saved step's assignee. */
function assigneeLabel(step) {
  if (step.assignee_type === 'DEPARTMENT_HEAD') {
    return step.assignee_department ? `${step.assignee_department.name} — Head` : 'Originating Dept — Head';
  }
  if (step.assignee_user)       return step.assignee_user.name;
  if (step.assignee_role)       return `${step.assignee_role.name} (role)`;
  if (step.assignee_department) return step.assignee_department.name;
  if (step.assignee_type === 'CREATOR') return 'Ticket initiator';
  if (step.assignee_type === 'MANUAL')  return 'Manual pick';
  return '—';
}

// ── Create / edit workflow modal ──────────────────────────────────────────────
function WorkflowModal({ workflow, onClose, onSaved }) {
  const isEdit = Boolean(workflow);
  const [form, setForm]   = useState(
    isEdit
      ? { name: workflow.name, description: workflow.description || '', is_active: workflow.is_active }
      : { name: '', description: '', is_active: false }
  );
  const [steps, setSteps] = useState(
    isEdit ? workflow.steps.map(stepToForm) : [blankStep()]
  );
  const [lookups, setLookups] = useState({ users: [], roles: [], departments: [] });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiGet('/lookup/users').catch(() => []),
      apiGet('/lookup/roles').catch(() => []),
      apiGet('/lookup/departments').catch(() => []),
    ]).then(([users, roles, departments]) => setLookups({ users, roles, departments }));
  }, []);

  const changeForm = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    setError('');
  };

  const changeStep = (i, field, value) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
    setError('');
  };

  const addStep    = () => setSteps((prev) => [...prev, blankStep()]);
  const removeStep = (i) => setSteps((prev) => prev.filter((_, idx) => idx !== i));

  const applyTemplate = () => {
    setForm({ name: TEMPLATE.name, description: TEMPLATE.description, is_active: TEMPLATE.is_active });
    setSteps(TEMPLATE.steps.map((s) => ({ ...blankStep(), ...s })));
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        name: form.name,
        module: 'service',
        description: form.description,
        is_active: form.is_active,
        steps: steps.map(stepToPayload),
      };
      const res = isEdit
        ? await apiPut(`/flow/workflows/${workflow.id}`, payload)
        : await apiPost('/flow/workflows', payload);
      onSaved(res.data, isEdit);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

  /** Renders the target picker for a step, based on its assignee type. */
  const targetSelect = (s, i) => {
    if (s.assignee_type === 'USER') {
      return (
        <select value={s.assignee_user_id} onChange={(e) => changeStep(i, 'assignee_user_id', e.target.value)} required className="ams-input">
          <option value="">Select user…</option>
          {lookups.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      );
    }
    if (s.assignee_type === 'ROLE') {
      return (
        <select value={s.assignee_role_id} onChange={(e) => changeStep(i, 'assignee_role_id', e.target.value)} required className="ams-input">
          <option value="">Select role…</option>
          {lookups.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      );
    }
    if (s.assignee_type === 'DEPARTMENT' || s.assignee_type === 'DEPARTMENT_HEAD') {
      return (
        <select value={s.assignee_department_id} onChange={(e) => changeStep(i, 'assignee_department_id', e.target.value)} required className="ams-input">
          <option value="">Select department…</option>
          {lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      );
    }
    if (s.assignee_type === 'ORIGINATING_HEAD') {
      return <div className="text-sm text-gray-400 py-2 px-1">Head of the ticket’s originating department.</div>;
    }
    if (s.assignee_type === 'CREATOR') {
      return <div className="text-sm text-gray-400 py-2 px-1">Routes to whoever created the ticket.</div>;
    }
    return <div className="text-sm text-gray-400 py-2 px-1">Assigned by the previous stage owner.</div>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl bg-white rounded-lg shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? 'Edit Workflow' : 'New Workflow'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

          {!isEdit && (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--ams-primary-light)] border border-[var(--ams-primary-mid)]">
              <span className="text-sm text-gray-600">Not sure where to start?</span>
              <button type="button" onClick={applyTemplate} className="text-sm font-medium" style={{ color: 'var(--ams-primary)' }}>
                Use standard service flow →
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={label}>Workflow Name<span className="text-red-500"> *</span></label>
              <input name="name" value={form.name} onChange={changeForm} required placeholder="Service Complaint Flow" className="ams-input" />
            </div>
            <div>
              <label className={label}>Module</label>
              <input value="Service" disabled className="ams-input bg-gray-50 text-gray-400" />
            </div>
          </div>

          <div>
            <label className={label}>Description</label>
            <input name="description" value={form.description} onChange={changeForm} placeholder="Optional" className="ams-input" />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={changeForm}
              className="w-4 h-4 rounded" style={{ accentColor: 'var(--ams-primary)' }} />
            <span className="text-sm text-gray-700">Set as the active workflow for Service</span>
          </label>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className={label + ' mb-0'}>Stages</label>
              <button type="button" onClick={addStep} className="text-sm font-medium" style={{ color: 'var(--ams-primary)' }}>+ Add stage</button>
            </div>

            <div className="space-y-3">
              {steps.map((s, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                    <input value={s.name} onChange={(e) => changeStep(i, 'name', e.target.value)} required
                      placeholder="Stage name (e.g. Triage)" className="ams-input flex-1" />
                    {steps.length > 1 && (
                      <button type="button" onClick={() => removeStep(i)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0" title="Remove stage">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pl-8">
                    <select value={s.assignee_type} onChange={(e) => changeStep(i, 'assignee_type', e.target.value)} className="ams-input">
                      {ASSIGNEE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {targetSelect(s, i)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2 pb-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create Workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function DeleteModal({ workflow, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const del = async () => {
    setSaving(true);
    try { await apiDelete(`/flow/workflows/${workflow.id}`); onDeleted(workflow.id); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete workflow</h2>
        <p className="text-sm text-gray-500 mb-4">
          Delete <span className="font-medium text-gray-700">{workflow.name}</span>? This cannot be undone.
        </p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button onClick={del} disabled={saving} className="btn-danger flex-1 justify-center py-2">
            {saving ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FlowBuilderPage() {
  useAuth();
  const { me, can, loading: permLoading } = usePermissions();

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);

  const canView   = me?.is_system || can('FLOW_VIEW');
  const canCreate = me?.is_system || can('FLOW_CREATE');
  const canEdit   = me?.is_system || can('FLOW_EDIT');
  const canDelete = me?.is_system || can('FLOW_DELETE');

  const fetchRows = async () => {
    setLoading(true);
    try { const res = await apiGet('/flow/workflows?limit=50'); setRows(res.data); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) fetchRows();
    else if (!permLoading) setLoading(false);
  }, [permLoading]);

  const onSaved = (w, isEdit) => {
    setRows((prev) => (isEdit ? prev.map((r) => (r.id === w.id ? w : r)) : [w, ...prev]));
  };
  const onDeleted = (id) => setRows((prev) => prev.filter((w) => w.id !== id));

  if (permLoading || loading) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={4} rows={5} />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view the Flow Builder.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 bg-white">
          {canCreate && (
            <button onClick={() => setModal({ type: 'create' })}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              New Workflow
            </button>
          )}
          <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Workflows</span>
        </div>

        {rows.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-400">No workflows yet. Create one to define a flow.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((w) => (
              <div key={w.id} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-800">{w.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">{w.module}</span>
                  {w.is_active && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Active</span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">{w.steps.length} stage{w.steps.length !== 1 ? 's' : ''}</span>
                  {canEdit && (
                    <button onClick={() => setModal({ type: 'edit', workflow: w })}
                      className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200" title="Edit workflow">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => setModal({ type: 'delete', workflow: w })}
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete workflow">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-1">
                  {w.steps.map((s, i) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1">
                        <span className="font-medium text-gray-700">{s.name}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500">{assigneeLabel(s)}</span>
                      </span>
                      {i < w.steps.length - 1 && (
                        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal?.type === 'create' && <WorkflowModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'edit'   && <WorkflowModal workflow={modal.workflow} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'delete' && <DeleteModal workflow={modal.workflow} onClose={() => setModal(null)} onDeleted={onDeleted} />}
    </div>
  );
}
