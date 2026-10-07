'use client';

import { useEffect, useState } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import EnquiryPicker from '@/components/EnquiryPicker';

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

const STATUSES = [
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

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>
  );
}

// ── Create / edit modal ─────────────────────────────────────────────────────────
function ProjectModal({ project, users, onClose, onSaved }) {
  const isEdit = Boolean(project);
  const [form, setForm] = useState({
    name:        project?.name || '',
    status:      project?.status || 'PLANNING',
    enquiry_id:  project?.enquiry_id ? String(project.enquiry_id) : '',
    owner_id:    project?.owner_id ? String(project.owner_id) : '',
    start_date:  toDateInput(project?.start_date),
    end_date:    toDateInput(project?.end_date),
    description: project?.description || '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = isEdit
        ? await apiPut(`/projects/${project.id}`, form)
        : await apiPost('/projects', form);
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
function DeleteModal({ project, onClose, onDeleted }) {
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

// ── Page ────────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  useAuth();
  const { me, can, loading: permLoading } = usePermissions();

  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [users, setUsers]     = useState([]);
  const [modal, setModal]     = useState(null);

  const limit = 10;

  const canView   = me?.is_system || can('PROJECT_VIEW');
  const canCreate = me?.is_system || can('PROJECT_CREATE');
  const canEdit   = me?.is_system || can('PROJECT_EDIT');
  const canDelete = me?.is_system || can('PROJECT_DELETE');

  const fetchRows = async (p = page, s = search) => {
    setLoading(true);
    try {
      const res = await apiGet(`/projects?page=${p}&limit=${limit}&search=${encodeURIComponent(s)}`);
      setRows(res.data); setTotal(res.meta.pagination.total);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) {
      fetchRows();
      apiGet('/lookup/users').then(setUsers).catch(() => {});
    } else if (!permLoading) setLoading(false);
  }, [permLoading]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); fetchRows(1, search); };
  const goPage = (delta) => { const p = page + delta; setPage(p); fetchRows(p, search); };

  const onSaved = (row, isEdit) => {
    if (isEdit) setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ...row } : r));
    else { fetchRows(1, ''); setPage(1); setSearch(''); }
  };
  const onDeleted = (id) => { setRows((prev) => prev.filter((r) => r.id !== id)); setTotal((n) => n - 1); };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  if (permLoading || loading) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={5} rows={6} />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view projects.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        {/* Control panel */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap bg-white">
          {canCreate && (
            <button onClick={() => setModal({ type: 'create' })}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              New
            </button>
          )}
          <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Projects</span>
          <div className="flex-1 min-w-0" />
          <form onSubmit={onSearch} className="shrink-0 flex items-center border border-gray-300 rounded bg-white overflow-hidden" style={{ minWidth: 220 }}>
            <span className="px-2.5 text-gray-400 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, name…"
              className="flex-1 min-w-0 py-1.5 pr-2.5 text-sm text-gray-700 outline-none bg-transparent" />
          </form>
          <div className="flex items-center gap-0.5 shrink-0 text-sm text-gray-500">
            <span className="px-1 tabular-nums">{total === 0 ? '0' : `${from}-${to}`} / {total}</span>
            <button onClick={() => goPage(-1)} disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => goPage(1)} disabled={page * limit >= total}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">No projects yet. Click <span className="font-medium">New</span> to add one.</div>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: 760 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 sticky top-0 bg-white z-10">
                  <th className="px-3 py-3 font-normal">Code</th>
                  <th className="px-3 py-3 font-normal">Project</th>
                  <th className="px-3 py-3 font-normal">Status</th>
                  <th className="px-3 py-3 font-normal">Linked enquiry</th>
                  <th className="px-3 py-3 font-normal">Owner</th>
                  <th className="px-3 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                    <td className="px-3 py-3 font-mono text-xs text-gray-500 tabular-nums">{p.code}</td>
                    <td className="px-3 py-3"><div className="font-medium text-gray-800">{p.name}</div></td>
                    <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-3 py-3 text-gray-600">{p.enquiry ? `${p.enquiry.ref_no}` : '—'}</td>
                    <td className="px-3 py-3 text-gray-600">{p.owner?.name || '—'}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && (
                          <button onClick={() => setModal({ type: 'edit', project: p })}
                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 cursor-pointer" title="Edit">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setModal({ type: 'delete', project: p })}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer" title="Delete">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal?.type === 'create' && <ProjectModal users={users} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'edit'   && <ProjectModal project={modal.project} users={users} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'delete' && <DeleteModal project={modal.project} onClose={() => setModal(null)} onDeleted={onDeleted} />}
    </div>
  );
}
