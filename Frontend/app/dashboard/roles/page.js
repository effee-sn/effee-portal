'use client';

import { useEffect, useState } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

// ── Create Role Modal ─────────────────────────────────────────────────────────
function CreateRoleModal({ onClose, onCreated }) {
  const [form, setForm]       = useState({ name: '', slug: '', description: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev, [name]: value,
      ...(name === 'name' ? { slug: value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') } : {}),
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try { const r = await apiPost('/roles', form); onCreated(r); onClose(); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">New Role</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role Name<span className="text-red-500"> *</span></label>
            <input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Account Manager" className="ams-input" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Slug<span className="text-red-500"> *</span></label>
            <input name="slug" value={form.slug} onChange={handleChange} required placeholder="e.g. account-manager" className="ams-input" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Description <span className="text-gray-400 font-normal normal-case">(optional)</span>
            </label>
            <input name="description" value={form.description} onChange={handleChange} placeholder="Brief description" className="ams-input" />
          </div>
          <div className="flex gap-3 pt-1 pb-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center py-2">
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Role Modal ─────────────────────────────────────────────────────────
function DeleteRoleModal({ role, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleDelete = async () => {
    setLoading(true);
    try { await apiDelete(`/roles/${role.id}`); onDeleted(role.id); onClose(); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete Role</h2>
        <p className="text-sm text-gray-500 mb-4">
          Delete <span className="font-medium text-gray-700">{role.name}</span>? This cannot be undone.
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

// ── Permission Matrix Panel ───────────────────────────────────────────────────
const ACTION_ORDER = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'FINANCE'];
const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

function PermissionPanel({ role, onClose, canEdit }) {
  const [permissions, setPermissions] = useState(role.rolePermissions);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [error, setError]             = useState('');

  // Rows = modules (in their natural order); columns = the actions that exist.
  const modules = [];
  const byModule = {};
  for (const rp of permissions) {
    const m = rp.permission.module.name;
    if (!byModule[m]) { byModule[m] = {}; modules.push(m); }
    byModule[m][rp.permission.action] = rp;
  }
  const actions = ACTION_ORDER.filter((a) => permissions.some((rp) => rp.permission.action === a));

  const grantedCount = permissions.filter((rp) => rp.allowed).length;
  const allOn = permissions.length > 0 && grantedCount === permissions.length;

  const setMany = (match, value) => {
    setPermissions((prev) => prev.map((rp) => (match(rp) ? { ...rp, allowed: value } : rp)));
    setSaved(false); setError('');
  };
  const toggle       = (permId) => { setMany((rp) => rp.permission.id === permId, !permissions.find((rp) => rp.permission.id === permId).allowed); };
  const toggleModule = (m) => { const on = permissions.filter((rp) => rp.permission.module.name === m).every((rp) => rp.allowed); setMany((rp) => rp.permission.module.name === m, !on); };
  const toggleColumn = (a) => { const on = permissions.filter((rp) => rp.permission.action === a).every((rp) => rp.allowed); setMany((rp) => rp.permission.action === a, !on); };
  const toggleAll    = () => setMany(() => true, !allOn);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await apiPut(`/roles/${role.id}`, {
        permissions: permissions.map((rp) => ({ permission_id: rp.permission.id, allowed: rp.allowed })),
      });
      setSaved(true);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl bg-white rounded-lg shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">{role.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Permissions{!role.is_system ? ` · ${grantedCount}/${permissions.length} granted` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {role.is_system ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            System roles have full access and cannot be modified.
          </div>
        ) : (
          <>
            {canEdit && (
              <div className="px-6 pt-3 flex items-center gap-3">
                <button type="button" onClick={toggleAll}
                  className="text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer">
                  {allOn ? 'Clear all' : 'Select all'}
                </button>
                <span className="text-xs text-gray-300">·</span>
                <span className="text-xs text-gray-400">Tip: click a module or a column header to toggle its whole row/column.</span>
              </div>
            )}
            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left font-normal text-xs uppercase tracking-wider text-gray-400 py-2 pr-2">Module</th>
                    {actions.map((a) => (
                      <th key={a} className="py-2 px-1 text-center">
                        <button type="button" onClick={() => canEdit && toggleColumn(a)}
                          disabled={!canEdit}
                          className={`text-[11px] font-semibold uppercase tracking-wide text-gray-500 ${canEdit ? 'hover:text-gray-900 cursor-pointer' : 'cursor-default'}`}
                          title={canEdit ? `Toggle all ${titleCase(a)}` : a}>
                          {titleCase(a)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => {
                    const rowOn = Object.values(byModule[m]).every((rp) => rp.allowed);
                    return (
                      <tr key={m} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-2">
                          <button type="button" onClick={() => canEdit && toggleModule(m)}
                            disabled={!canEdit}
                            className={`font-medium ${rowOn ? 'text-gray-900' : 'text-gray-700'} ${canEdit ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                            title={canEdit ? 'Toggle whole module' : m}>
                            {titleCase(m)}
                          </button>
                        </td>
                        {actions.map((a) => {
                          const rp = byModule[m][a];
                          return (
                            <td key={a} className="py-2 px-1 text-center">
                              {rp ? (
                                <input type="checkbox" checked={rp.allowed}
                                  onChange={() => canEdit && toggle(rp.permission.id)}
                                  disabled={!canEdit} title={rp.permission.code}
                                  className="w-4 h-4 align-middle cursor-pointer disabled:cursor-default"
                                  style={{ accentColor: 'var(--ams-primary)' }} />
                              ) : (
                                <span className="text-gray-300">–</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
              {error && <p className="flex-1 text-sm text-red-600">{error}</p>}
              {saved && !error && <p className="flex-1 text-sm text-green-600">Saved.</p>}
              {!error && !saved && <span className="flex-1" />}
              <button onClick={onClose} className="btn-secondary">Close</button>
              {canEdit && (
                <button onClick={handleSave} disabled={saving} className="btn-primary">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Bulk Delete Roles Modal ───────────────────────────────────────────────────
function BulkDeleteRolesModal({ ids, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleDelete = async () => {
    setLoading(true);
    try {
      await Promise.all(ids.map((id) => apiDelete(`/roles/${id}`)));
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
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete {ids.length} role{ids.length > 1 ? 's' : ''}?</h2>
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
function ControlPanel({ total, canCreate, canDelete, onNew, onBulkDelete, selectedCount }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-3 border-b border-gray-200 bg-white">
      {canCreate && (
        <button onClick={onNew}
          className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm"
          style={{ backgroundColor: '#714B67' }}>
          New
        </button>
      )}
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
      <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Roles &amp; Permissions</span>
      <div className="flex-1" />
      <span className="text-sm text-gray-500 px-1">{total} roles</span>
      <div className="w-px h-5 bg-gray-200 mx-0.5 shrink-0" />
      <div className="flex items-center gap-0.5 shrink-0">
        <button className="p-1.5 rounded" style={{ color: 'var(--ams-primary)', backgroundColor: 'var(--ams-primary-mid)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
          </svg>
        </button>
        <button className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
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
export default function RolesPage() {
  useAuth();
  const { me, can, loading: permLoading } = usePermissions();

  const [roles, setRoles]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [selected, setSelected] = useState(new Set());

  const canView   = me?.is_system || can('ROLE_VIEW');
  const canCreate = me?.is_system || can('ROLE_CREATE');
  const canEdit   = me?.is_system || can('ROLE_EDIT');
  const canDelete = me?.is_system || can('ROLE_DELETE');

  useEffect(() => {
    if (permLoading) return undefined;
    let cancelled = false;
    (async () => {
      if (canView) {
        try { const r = await apiGet('/roles'); if (!cancelled) setRoles(r); }
        catch { if (!cancelled) setRoles([]); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [permLoading]);

  const handleCreated = (role) => setRoles((prev) => [...prev, role]);
  const handleDeleted = (id)  => setRoles((prev) => prev.filter((r) => r.id !== id));

  const toggleAll = (checked) => setSelected(checked ? new Set(roles.filter((r) => !r.is_system).map((r) => r.id)) : new Set());
  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleBulkDelete = () => setModal({ type: 'bulk-delete', ids: [...selected] });

  if (permLoading || loading) return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden">
      <div className="h-10 border-b border-gray-200 animate-pulse bg-gray-50" />
      <TableSkeleton cols={5} rows={5} />
    </div>
  );

  if (!canView) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
      <p className="text-sm text-gray-500">You don&apos;t have permission to view roles.</p>
    </div>
  );

  return (
    <div>
      <div className="bg-white rounded border border-gray-200 overflow-hidden">

        {/* Control Panel */}
        <ControlPanel
          total={roles.length} canCreate={canCreate} canDelete={canDelete}
          onNew={() => setModal({ type: 'create' })}
          onBulkDelete={handleBulkDelete} selectedCount={selected.size}
        />

        {/* Table */}
        <div className="overflow-x-auto">
            {roles.length === 0 ? (
              <div className="py-20 text-center text-sm text-gray-400">No roles found.</div>
            ) : (
              <table className="w-full text-sm" style={{ minWidth: 560 }}>
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pl-3 pr-2 py-3 w-8">
                      <input type="checkbox"
                        checked={selected.size === roles.length && roles.length > 0}
                        onChange={(e) => toggleAll(e.target.checked)}
                        className="w-3.5 h-3.5 cursor-pointer rounded-sm"
                        style={{ accentColor: 'var(--ams-primary)' }} />
                    </th>
                    <th className="px-3 py-3 text-left text-gray-500 font-normal">Name</th>
                    <th className="px-3 py-3 text-left text-gray-500 font-normal">Slug</th>
                    <th className="px-3 py-3 text-left text-gray-500 font-normal">Description</th>
                    <th className="px-3 py-3 text-left text-gray-500 font-normal">Type</th>
                    <th className="pl-3 pr-3 py-3 w-16 text-right">
                      <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
                      </svg>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer group transition-colors"
                      onClick={() => setModal({ type: 'permissions', role })}>
                      <td className="pl-3 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(role.id)} onChange={() => toggleOne(role.id)}
                          className="w-3.5 h-3.5 cursor-pointer rounded-sm"
                          style={{ accentColor: 'var(--ams-primary)' }} />
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-800">{role.name}</td>
                      <td className="px-3 py-3">
                        <code className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{role.slug}</code>
                      </td>
                      <td className="px-3 py-3 text-gray-500">{role.description || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3">
                        {role.is_system ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: 'var(--ams-primary-mid)', color: 'var(--ams-primary)' }}>
                            System
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                            Custom
                          </span>
                        )}
                      </td>
                      <td className="pl-3 pr-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setModal({ type: 'permissions', role })}
                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                            title="Manage permissions">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                            </svg>
                          </button>
                          {canDelete && !role.is_system && (
                            <button onClick={() => setModal({ type: 'delete', role })}
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
      {modal?.type === 'create'      && <CreateRoleModal onClose={() => setModal(null)} onCreated={handleCreated} />}
      {modal?.type === 'delete'      && <DeleteRoleModal role={modal.role} onClose={() => setModal(null)} onDeleted={handleDeleted} />}
      {modal?.type === 'permissions' && <PermissionPanel role={modal.role} canEdit={canEdit} onClose={() => setModal(null)} />}
      {modal?.type === 'bulk-delete' && (
        <BulkDeleteRolesModal
          ids={modal.ids}
          onClose={() => setModal(null)}
          onDeleted={(ids) => {
            setRoles((prev) => prev.filter((r) => !ids.includes(r.id)));
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
