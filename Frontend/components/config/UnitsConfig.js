'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

/**
 * Units of measure — a section of Administrator → Configuration.
 *
 * What material quantities are counted in (Nos, m, kg…). A unit used by
 * materials keeps its code (its name can still change) and can't be deleted,
 * only made inactive so it isn't offered for new materials.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
const bySort = (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code);

function UnitModal({ unit, onClose, onSaved }) {
  const isEdit = Boolean(unit);
  const used = (unit?.material_count ?? 0) > 0;
  const [form, setForm] = useState({
    code: unit?.code || '', name: unit?.name || '', sort_order: String(unit?.sort_order ?? 0), is_active: unit?.is_active ?? true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = { code: form.code.trim(), name: form.name.trim(), sort_order: Number(form.sort_order) || 0, is_active: form.is_active };
      if (isEdit && used) delete body.code;
      const res = isEdit ? await apiPut(`/materials/units/${unit.id}`, body) : await apiPost('/materials/units', body);
      onSaved(res.data);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? `Edit unit ${unit.code}` : 'New unit of measure'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>
        <form onSubmit={submit} className="px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          {used && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
              {unit.material_count} material(s) use this unit, so its code is fixed. The name can still change.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="u-code">Code<span className="text-red-500"> *</span></label>
              <input id="u-code" value={form.code} onChange={(e) => set('code', e.target.value)} required maxLength={20} disabled={used}
                placeholder="e.g. kg" className="ams-input disabled:bg-gray-50 font-mono" />
            </div>
            <div>
              <label className={label} htmlFor="u-sort">Order in lists</label>
              <input id="u-sort" type="number" min={0} max={9999} value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} className="ams-input" />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="u-name">Name<span className="text-red-500"> *</span></label>
            <input id="u-name" value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={100}
              placeholder="e.g. Kilogram" className="ams-input" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            Active (offered when adding materials)
          </label>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** @param {{ has: (code: string) => boolean }} props */
export default function UnitsConfig({ has }) {
  const canView = has('MATERIAL_CONFIG_VIEW');
  const canCreate = has('MATERIAL_CONFIG_CREATE');
  const canEdit = has('MATERIAL_CONFIG_EDIT');
  const canDelete = has('MATERIAL_CONFIG_DELETE');

  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    apiGet('/materials/units')
      .then((r) => { if (!cancelled) setRows(r.data); })
      .catch((e) => { if (!cancelled) { setRows([]); setError(e.message); } });
    return () => { cancelled = true; };
  }, [canView]);

  const upsert = (u) => setRows((prev) => (prev.some((r) => r.id === u.id) ? prev.map((r) => (r.id === u.id ? u : r)) : [...prev, u]).sort(bySort));

  const remove = async (u) => {
    if (!window.confirm(`Delete unit ${u.code}?`)) return;
    setError('');
    try { await apiDelete(`/materials/units/${u.id}`); setRows((prev) => prev.filter((r) => r.id !== u.id)); }
    catch (e) { setError(e.message); }
  };

  if (canView && rows === null) {
    return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={5} rows={4} /></div>;
  }
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view units of measure.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap">
        {canCreate && (
          <button onClick={() => setModal({ unit: null })}
            className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer" style={{ backgroundColor: 'var(--ams-primary)' }}>New</button>
        )}
        <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Units of Measure</span>
        <span className="text-xs text-gray-400">What material quantities are counted in</span>
      </div>
      {error && <p className="mx-3 mt-3 px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}

      {rows.length === 0 ? (
        <p className="py-14 text-center text-sm text-gray-400">No units yet.{canCreate && ' Add the first one with New.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 560 }}>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-3 font-normal">Code</th>
                <th className="px-3 py-3 font-normal">Name</th>
                <th className="px-3 py-3 font-normal text-right">Materials</th>
                <th className="px-3 py-3 font-normal">Status</th>
                <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-mono font-semibold text-gray-800">{u.code}</td>
                  <td className="px-3 py-2.5 text-gray-700">{u.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{u.material_count}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${u.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {canEdit && <button onClick={() => setModal({ unit: u })} className="text-xs font-medium text-[var(--ams-primary)] hover:underline cursor-pointer">Edit</button>}
                    {canDelete && u.material_count === 0 && (
                      <button onClick={() => remove(u)} className="ml-3 text-xs font-medium text-red-600 hover:underline cursor-pointer">Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <UnitModal unit={modal.unit} onClose={() => setModal(null)} onSaved={upsert} />}
    </div>
  );
}
