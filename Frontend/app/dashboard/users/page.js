'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import useNav from '@/lib/useNav';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

const PALETTE = ['#6366F1','#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];
const avatarBg = (name) => PALETTE[(name?.charCodeAt(0) ?? 0) % PALETTE.length];
const initials = (name) => {
  if (!name) return '?';
  const p = name.trim().split(' ').filter(Boolean);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0].slice(0, 2).toUpperCase();
};

// ── User Form Modal ───────────────────────────────────────────────────────────
function UserModal({ user, onClose, onSaved }) {
  const isEdit = Boolean(user);
  const [form, setForm] = useState({
    name: user?.name || '', email: user?.email || '', phone: user?.phone || '',
    password: '', role_id: user?.role?.id || '', status: user?.status || 'ACTIVE',
    department_id: user?.department?.id || '', designation: user?.designation || '',
  });
  const [roles, setRoles]             = useState([]);
  const [departments, setDepartments] = useState([]);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    apiGet('/lookup/roles').then(setRoles).catch((e) => setError(e.message));
    apiGet('/lookup/departments').then(setDepartments).catch(() => {});
  }, []);

  const handleChange = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const payload = { ...form };
      if (isEdit && !payload.password) delete payload.password;
      const saved = isEdit ? await apiPut(`/users/${user.id}`, payload) : await apiPost('/users', payload);
      onSaved(saved, isEdit); onClose();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? 'Edit User' : 'New User'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
              <input name="name" value={form.name} onChange={handleChange} required placeholder="John Doe" className="ams-input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone</label>
              <input name="phone" value={form.phone} onChange={handleChange} required placeholder="01XXXXXXXXX" className="ams-input" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
            <input name="email" type="email" value={form.email} onChange={handleChange} required placeholder="you@example.com" className="ams-input" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Password {isEdit && <span className="text-gray-400 font-normal normal-case">(leave blank to keep)</span>}
            </label>
            <input name="password" type="password" value={form.password} onChange={handleChange} required={!isEdit} placeholder="••••••••" className="ams-input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role</label>
              <select name="role_id" value={form.role_id} onChange={handleChange} required className="ams-input">
                <option value="">Select role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Department</label>
              <select name="department_id" value={form.department_id} onChange={handleChange} className="ams-input">
                <option value="">— None —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Designation</label>
            <input name="designation" value={form.designation} onChange={handleChange} placeholder="e.g. Senior Engineer" className="ams-input" />
          </div>
          {isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
              <select name="status" value={form.status} onChange={handleChange} className="ams-input">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2 pb-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center py-2">
              {loading ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ user, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleDelete = async () => {
    setLoading(true);
    try { await apiDelete(`/users/${user.id}`); onDeleted(user.id); onClose(); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete User</h2>
        <p className="text-sm text-gray-500 mb-4">
          Delete <span className="font-medium text-gray-700">{user.name}</span>? This cannot be undone.
        </p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button onClick={handleDelete} disabled={loading} className="btn-danger flex-1 justify-center py-2">
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Delete Modal ─────────────────────────────────────────────────────────
function BulkDeleteModal({ ids, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleDelete = async () => {
    setLoading(true);
    try {
      await Promise.all(ids.map((id) => apiDelete(`/users/${id}`)));
      onDeleted(ids);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete {ids.length} user{ids.length > 1 ? 's' : ''}?</h2>
        <p className="text-sm text-gray-500 mb-4">This action cannot be undone.</p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button onClick={handleDelete} disabled={loading} className="btn-danger flex-1 justify-center py-2">
            {loading ? 'Deleting…' : `Delete ${ids.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Odoo-style Control Panel ──────────────────────────────────────────────────
function ControlPanel({ total, page, limit, canCreate, canDelete, onNew, onBulkDelete, selectedCount,
  search, setSearch, onSearch, onPrev, onNext }) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  return (
    <div className="flex items-center gap-1.5 px-3 py-3 border-b border-gray-200 flex-wrap gap-y-2 bg-white">
      {/* New button */}
      {canCreate && (
        <button onClick={onNew}
          className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm"
          style={{ backgroundColor: '#714B67' }}>
          New
        </button>
      )}

      {/* Bulk delete — shown only when rows are selected */}
      {canDelete && selectedCount > 0 && (
        <button onClick={onBulkDelete}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-sm bg-red-600 hover:bg-red-700 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Delete ({selectedCount})
        </button>
      )}

      {/* Title */}
      <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Users</span>

      <div className="flex-1 min-w-0" />

      {/* Search bar */}
      <form onSubmit={onSearch} className="shrink-0 flex items-center border border-gray-300 rounded bg-white overflow-hidden"
        style={{ minWidth: 240, maxWidth: 360 }}>
        <span className="px-2.5 text-gray-400 shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </span>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="flex-1 min-w-0 py-1.5 pr-2.5 text-sm text-gray-700 outline-none bg-transparent" />
      </form>

      {/* Pagination */}
      <div className="flex items-center gap-0.5 shrink-0 text-sm text-gray-500">
        <span className="px-1 tabular-nums">{total === 0 ? '0' : `${from}-${to}`} / {total}</span>
        <button onClick={onPrev} disabled={page === 1}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <button onClick={onNext} disabled={page * limit >= total}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      <div className="w-px h-5 bg-gray-200 mx-0.5 shrink-0" />

      {/* View switcher */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button className="p-1.5 rounded" title="List view"
          style={{ color: 'var(--ams-primary)', backgroundColor: 'var(--ams-primary-mid)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
          </svg>
        </button>
        <button className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="Kanban view">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <rect x="1" y="1" width="6" height="6" rx="1"/>
            <rect x="9" y="1" width="6" height="6" rx="1"/>
            <rect x="1" y="9" width="6" height="6" rx="1"/>
            <rect x="9" y="9" width="6" height="6" rx="1"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function UsersPageInner() {
  useAuth();
  const { me, can, loading: permLoading } = usePermissions();
  const router       = useRouter();
  const nav          = useNav();
  const searchParams = useSearchParams();

  const [users, setUsers]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [selected, setSelected] = useState(new Set());

  const limit = 10;

  const fetchUsers = async (p = page, s = search) => {
    setLoading(true);
    try {
      const data = await apiGet(`/users?page=${p}&limit=${limit}&search=${encodeURIComponent(s)}`);
      setUsers(data.users); setTotal(data.total);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  };

  const canView   = me?.is_system || can('USER_VIEW');
  const canCreate = me?.is_system || can('USER_CREATE');
  const canEdit   = me?.is_system || can('USER_EDIT');
  const canDelete = me?.is_system || can('USER_DELETE');

  useEffect(() => {
    if (!permLoading && canView) fetchUsers();
    else if (!permLoading) setLoading(false);
  }, [permLoading]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || loading) return;
    apiGet(`/users/${editId}`).then((u) => {
      setModal({ type: 'edit', user: u });
      router.replace('/dashboard/users', { scroll: false });
    }).catch(() => {});
  }, [searchParams, loading]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchUsers(1, search); };

  const handleSaved = (saved, isEdit) => {
    if (isEdit) setUsers((prev) => prev.map((u) => u.id === saved.id ? saved : u));
    else { setUsers((prev) => [saved, ...prev]); setTotal((t) => t + 1); }
  };

  const handleDeleted = (id) => { setUsers((prev) => prev.filter((u) => u.id !== id)); setTotal((t) => t - 1); };

  const toggleAll = (checked) => setSelected(checked ? new Set(users.map((u) => u.id)) : new Set());
  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const goPage = (delta) => { const p = page + delta; setPage(p); fetchUsers(p, search); };

  const handleBulkDelete = () => setModal({ type: 'bulk-delete', ids: [...selected] });

  if (permLoading || loading) return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden">
      <div className="h-10 border-b border-gray-200 animate-pulse bg-gray-50" />
      <TableSkeleton cols={6} rows={7} />
    </div>
  );

  if (!canView) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
      <p className="text-sm text-gray-500">You don&apos;t have permission to view users.</p>
    </div>
  );

  return (
    <div>
      <div className="bg-white rounded border border-gray-200 overflow-hidden">

        {/* Control Panel */}
        <ControlPanel
          total={total} page={page} limit={limit}
          canCreate={canCreate} canDelete={canDelete}
          onNew={() => setModal({ type: 'add' })}
          onBulkDelete={handleBulkDelete}
          selectedCount={selected.size}
          search={search} setSearch={setSearch} onSearch={handleSearch}
          onPrev={() => goPage(-1)} onNext={() => goPage(1)}
        />

        {/* Table */}
        <div className="overflow-x-auto">
            {users.length === 0 ? (
              <div className="py-20 text-center text-sm text-gray-400">No users found.</div>
            ) : (
              <table className="w-full text-sm" style={{ minWidth: 720 }}>
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pl-3 pr-2 py-3 w-8">
                      <input type="checkbox"
                        checked={selected.size === users.length && users.length > 0}
                        onChange={(e) => toggleAll(e.target.checked)}
                        className="w-3.5 h-3.5 cursor-pointer rounded-sm"
                        style={{ accentColor: 'var(--ams-primary)' }} />
                    </th>
                    <th className="px-3 py-3 text-left text-gray-500 font-normal">Name</th>
                    <th className="px-3 py-3 text-left text-gray-500 font-normal">Email</th>
                    <th className="px-3 py-3 text-left text-gray-500 font-normal">Phone</th>
                    <th className="px-3 py-3 text-left text-gray-500 font-normal">Role</th>
                    <th className="px-3 py-3 text-left text-gray-500 font-normal">Department</th>
                    <th className="px-3 py-3 text-left text-gray-500 font-normal">Status</th>
                    <th className="pl-3 pr-3 py-3 w-16 text-right">
                      <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
                      </svg>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer group transition-colors"
                      onClick={() => nav(`/dashboard/users/${user.id}`)}>
                      <td className="pl-3 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(user.id)} onChange={() => toggleOne(user.id)}
                          className="w-3.5 h-3.5 cursor-pointer rounded-sm"
                          style={{ accentColor: 'var(--ams-primary)' }} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: avatarBg(user.name) }}>
                            {initials(user.name)}
                          </div>
                          <span className="font-medium text-gray-800">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{user.email}</td>
                      <td className="px-3 py-3 text-gray-600">{user.phone || '—'}</td>
                      <td className="px-3 py-3">
                        <span style={{ color: 'var(--ams-primary)' }}>{user.role?.name}</span>
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        {user.department?.name || '—'}
                        {user.designation && <span className="block text-xs text-gray-400">{user.designation}</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-sm ${
                          user.status === 'ACTIVE' ? 'text-green-600' : 'text-red-500'
                        }`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${user.status === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'}`} />
                          {user.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="pl-3 pr-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEdit && (
                            <button onClick={() => setModal({ type: 'edit', user })}
                              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                              title="Edit">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                              </svg>
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setModal({ type: 'delete', user })}
                              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
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

      {/* Modals */}
      {modal?.type === 'add'         && <UserModal onClose={() => setModal(null)} onSaved={handleSaved} />}
      {modal?.type === 'edit'        && <UserModal user={modal.user} onClose={() => setModal(null)} onSaved={handleSaved} />}
      {modal?.type === 'delete'      && <DeleteModal user={modal.user} onClose={() => setModal(null)} onDeleted={handleDeleted} />}
      {modal?.type === 'bulk-delete' && (
        <BulkDeleteModal
          ids={modal.ids}
          onClose={() => setModal(null)}
          onDeleted={(ids) => {
            setUsers((prev) => prev.filter((u) => !ids.includes(u.id)));
            setTotal((t) => t - ids.length);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

export default function UsersPage() {
  return <Suspense><UsersPageInner /></Suspense>;
}
