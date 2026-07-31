'use client';

import { useEffect, useState } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

// ── Create / Edit modal ───────────────────────────────────────────────────────
function DepartmentModal({ dept, onClose, onSaved }) {
  const isEdit = Boolean(dept);
  const [form, setForm] = useState({
    name: dept?.name || '',
    description: dept?.description || '',
    head_user_id: dept?.head_user_id || '',
  });
  const [users, setUsers]   = useState([]);
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { apiGet('/lookup/users').then(setUsers).catch(() => {}); }, []);

  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = isEdit
        ? await apiPut(`/departments/${dept.id}`, form)
        : await apiPost('/departments', form);
      onSaved(res.data, isEdit);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? 'Edit Department' : 'New Department'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <div>
            <label className={label}>Name<span className="text-red-500"> *</span></label>
            <input name="name" value={form.name} onChange={change} required placeholder="Engineering" className="ams-input" />
          </div>
          <div>
            <label className={label}>Head / Lead <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
            <select name="head_user_id" value={form.head_user_id} onChange={change} className="ams-input">
              <option value="">— None —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea name="description" value={form.description} onChange={change} rows={3}
              placeholder="Optional description" className="ams-input resize-none" />
          </div>
          <div className="flex gap-3 pt-2 pb-1">
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

// ── Delete confirm ────────────────────────────────────────────────────────────
function DeleteModal({ dept, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const del = async () => {
    setSaving(true);
    try { await apiDelete(`/departments/${dept.id}`); onDeleted(dept.id); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete Department</h2>
        <p className="text-sm text-gray-500 mb-4">
          Delete <span className="font-medium text-gray-700">{dept.name}</span>? This cannot be undone.
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
export default function DepartmentsPage() {
  useAuth();
  const { me, can, loading: permLoading } = usePermissions();

  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);

  const limit = 10;

  const canView   = me?.is_system || can('DEPT_VIEW');
  const canCreate = me?.is_system || can('DEPT_CREATE');
  const canEdit   = me?.is_system || can('DEPT_EDIT');
  const canDelete = me?.is_system || can('DEPT_DELETE');

  const fetchRows = async (p = page, s = search) => {
    setLoading(true);
    try {
      const res = await apiGet(`/departments?page=${p}&limit=${limit}&search=${encodeURIComponent(s)}`);
      setRows(res.data); setTotal(res.meta.pagination.total);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) fetchRows();
    else if (!permLoading) setLoading(false);
  }, [permLoading]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); fetchRows(1, search); };
  const goPage = (delta) => { const p = page + delta; setPage(p); fetchRows(p, search); };

  const onSaved = (row, isEdit) => {
    if (isEdit) setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ...row } : r));
    else { setRows((prev) => [row, ...prev]); setTotal((n) => n + 1); }
  };
  const onDeleted = (id) => { setRows((prev) => prev.filter((r) => r.id !== id)); setTotal((n) => n - 1); };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  if (permLoading || loading) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={4} rows={6} />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view departments.</p>
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
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              New
            </button>
          )}
          <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Departments</span>
          <div className="flex-1 min-w-0" />
          <form onSubmit={onSearch} className="shrink-0 flex items-center border border-gray-300 rounded bg-white overflow-hidden"
            style={{ minWidth: 220 }}>
            <span className="px-2.5 text-gray-400 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search departments…"
              className="flex-1 min-w-0 py-1.5 pr-2.5 text-sm text-gray-700 outline-none bg-transparent" />
          </form>
          <div className="flex items-center gap-0.5 shrink-0 text-sm text-gray-500">
            <span className="px-1 tabular-nums">{total === 0 ? '0' : `${from}-${to}`} / {total}</span>
            <button onClick={() => goPage(-1)} disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={() => goPage(1)} disabled={page * limit >= total}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">No departments found.</div>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: 480 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-3 font-normal">Name</th>
                  <th className="px-3 py-3 font-normal">Head / Lead</th>
                  <th className="px-3 py-3 font-normal">Description</th>
                  <th className="px-3 py-3 font-normal">Members</th>
                  <th className="px-3 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                    <td className="px-3 py-3 font-medium text-gray-800">{d.name}</td>
                    <td className="px-3 py-3 text-gray-600">{d.head?.name || '—'}</td>
                    <td className="px-3 py-3 text-gray-500 truncate max-w-[280px]">{d.description || '—'}</td>
                    <td className="px-3 py-3 text-gray-600 tabular-nums">{d._count?.users ?? 0}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && (
                          <button onClick={() => setModal({ type: 'edit', dept: d })}
                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200" title="Edit">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setModal({ type: 'delete', dept: d })}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

      {modal?.type === 'create' && <DepartmentModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'edit'   && <DepartmentModal dept={modal.dept} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'delete' && <DeleteModal dept={modal.dept} onClose={() => setModal(null)} onDeleted={onDeleted} />}
    </div>
  );
}
