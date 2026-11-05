'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { loadMaterialTypes } from '@/lib/materialTypes';

/**
 * Material types — a section of Administrator → Configuration.
 *
 * The kinds of item in the material master, and how each behaves:
 *   - drawing revisions: its materials have Original → Rev A … (draft → release);
 *   - tag each piece: for project tagging (being redesigned — no effect yet);
 *   - default make / buy.
 * A type in use can't be deleted — make it inactive so it isn't offered for
 * new materials. "Subassembly" is built in (a subassembly's own item).
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
const MAKE_BUY = [
  { value: 'MAKE', label: 'Make' },
  { value: 'BUY', label: 'Buy' },
  { value: 'SUBCONTRACT', label: 'Subcontract' },
];
const MAKE_BUY_LABEL = Object.fromEntries(MAKE_BUY.map((m) => [m.value, m.label]));
const bySort = (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

function TypeModal({ type, onClose, onSaved }) {
  const isEdit = Boolean(type);
  const [form, setForm] = useState({
    name: type?.name || '', has_revisions: type?.has_revisions ?? false, tag_each_piece: type?.tag_each_piece ?? false,
    default_make_buy: type?.default_make_buy || 'BUY', sort_order: String(type?.sort_order ?? 0), is_active: type?.is_active ?? true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };
  const used = (type?.material_count ?? 0) > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (isEdit && used && type.has_revisions && !form.has_revisions
      && !window.confirm(`Switch drawing revisions off for ${type.name}? Its ${type.material_count} material(s) keep their past revisions as history, and are edited directly from now on.`)) return;
    if (isEdit && used && !type.has_revisions && form.has_revisions
      && !window.confirm(`Switch drawing revisions on for ${type.name}? Each of its ${type.material_count} material(s) gets its first revision from its current details; changes then go through draft → release.`)) return;
    setSaving(true); setError('');
    try {
      const body = { ...form, name: form.name.trim(), sort_order: Number(form.sort_order) || 0 };
      const res = isEdit ? await apiPut(`/materials/types/${type.id}`, body) : await apiPost('/materials/types', body);
      onSaved(res.data);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? `Edit ${type.name}` : 'New material type'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>
        <form onSubmit={submit} className="px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={label} htmlFor="t-name">Name<span className="text-red-500"> *</span></label>
              <input id="t-name" value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={60}
                placeholder="e.g. Raw material" className="ams-input" autoFocus />
            </div>
            <div>
              <label className={label} htmlFor="t-sort">Order</label>
              <input id="t-sort" type="number" min={0} max={9999} value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} className="ams-input" />
            </div>
          </div>
          {isEdit && <p className="text-[11px] text-gray-500 -mt-2">Code <span className="font-mono">{type.code}</span> — fixed (materials store it).</p>}

          <div className="rounded-md border border-gray-200 px-3 py-3 space-y-3">
            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={form.has_revisions} onChange={(e) => set('has_revisions', e.target.checked)} />
              <span><b className="font-medium">Drawing revisions</b><br />
                <span className="text-xs text-gray-500">Original → Rev A, B …; description, specification and material change through draft → release with a change note.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={form.tag_each_piece} onChange={(e) => set('tag_each_piece', e.target.checked)} />
              <span><b className="font-medium">Tag each piece</b><br />
                <span className="text-xs text-gray-500">For project tagging (being redesigned): each piece its own tag, for parts traced piece by piece. Off: one tag carries the quantity. No effect yet.</span></span>
            </label>
            <div>
              <label className={label} htmlFor="t-mb">Default make / buy</label>
              <select id="t-mb" value={form.default_make_buy} onChange={(e) => set('default_make_buy', e.target.value)} className="ams-input">
                {MAKE_BUY.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
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

const Flag = ({ on }) => (
  <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${on ? 'bg-[var(--ams-primary-mid)] text-[var(--ams-primary)]' : 'bg-gray-100 text-gray-500'}`}>{on ? 'On' : 'Off'}</span>
);

/** @param {{ has: (code: string) => boolean }} props */
export default function MaterialTypesConfig({ has }) {
  const canView = has('MATERIAL_CONFIG_VIEW');
  const canCreate = has('MATERIAL_CONFIG_CREATE');
  const canEdit = has('MATERIAL_CONFIG_EDIT');
  const canDelete = has('MATERIAL_CONFIG_DELETE');

  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    apiGet('/materials/types')
      .then((r) => { if (!cancelled) setRows(r.data); })
      .catch((e) => { if (!cancelled) { setRows([]); setError(e.message); } });
    return () => { cancelled = true; };
  }, [canView]);

  const upsert = (t) => {
    setRows((prev) => (prev.some((r) => r.id === t.id) ? prev.map((r) => (r.id === t.id ? { ...r, ...t } : r)) : [...prev, t]).sort(bySort));
    setNotice(t.revisions_started ? `${t.name} saved — ${t.revisions_started} material(s) got their first drawing revision.` : `${t.name} saved.`);
    loadMaterialTypes(true); // other screens on this page pick up the change
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete material type ${t.name}?`)) return;
    setError(''); setNotice('');
    try {
      await apiDelete(`/materials/types/${t.id}`);
      setRows((prev) => prev.filter((r) => r.id !== t.id));
      loadMaterialTypes(true);
    } catch (e) { setError(e.message); }
  };

  if (canView && rows === null) {
    return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={6} rows={4} /></div>;
  }
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view material types.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap">
        {canCreate && (
          <button onClick={() => { setModal({ type: null }); setNotice(''); }}
            className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer" style={{ backgroundColor: 'var(--ams-primary)' }}>New</button>
        )}
        <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Material Types</span>
        <span className="text-xs text-gray-400">The kinds of item, and how each behaves</span>
      </div>
      {error && <p className="mx-3 mt-3 px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
      {notice && <p className="mx-3 mt-3 px-3 py-2 rounded text-sm border bg-green-50 border-green-200 text-green-800">{notice}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 760 }}>
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-3 py-3 font-normal">Type</th>
              <th className="px-3 py-3 font-normal">Drawing revisions</th>
              <th className="px-3 py-3 font-normal">Tag each piece</th>
              <th className="px-3 py-3 font-normal">Default</th>
              <th className="px-3 py-3 font-normal text-right">Materials</th>
              <th className="px-3 py-3 font-normal text-right">Prefixes</th>
              <th className="px-3 py-3 font-normal">Status</th>
              <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2.5">
                  <span className="font-medium text-gray-800">{t.name}</span>
                  <span className="ml-2 font-mono text-[11px] text-gray-400">{t.code}</span>
                  {t.is_system && <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700" title="A subassembly's own item — revised on its subassembly">Built in</span>}
                </td>
                <td className="px-3 py-2.5">{t.is_system ? <span className="text-xs text-gray-500">On the subassembly</span> : <Flag on={t.has_revisions} />}</td>
                <td className="px-3 py-2.5"><Flag on={t.tag_each_piece} /></td>
                <td className="px-3 py-2.5 text-gray-700">{MAKE_BUY_LABEL[t.default_make_buy] ?? t.default_make_buy}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{t.material_count}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{t.is_system ? '—' : t.prefix_count}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${t.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {!t.is_system && canEdit && <button onClick={() => { setModal({ type: t }); setNotice(''); }} className="text-xs font-medium text-[var(--ams-primary)] hover:underline cursor-pointer">Edit</button>}
                  {!t.is_system && canDelete && t.material_count === 0 && t.prefix_count === 0 && (
                    <button onClick={() => remove(t)} className="ml-3 text-xs font-medium text-red-600 hover:underline cursor-pointer">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-3 text-[11px] text-gray-500 border-t border-gray-100">
        Link a prefix to its type in <b>Material Codes</b>, so picking the prefix picks the type. A type in use can&apos;t be deleted — make it inactive instead.
      </p>

      {modal && <TypeModal type={modal.type} onClose={() => setModal(null)} onSaved={upsert} />}
    </div>
  );
}
