'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import usePageSize from '@/lib/usePageSize';
import PageSizeSelect from '@/components/PageSizeSelect';
import { MATERIAL_TYPES, MATERIAL_TYPE_LABEL } from '@/lib/materialOptions';
import AsyncSearchSelect from '@/components/AsyncSearchSelect';

/**
 * Master Data → Materials. The list, with search and filters; new materials
 * are added in bulk on /new; a row opens its edit form. The IMM code is
 * generated from the chosen prefix and never changes.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

function EditModal({ material, canEdit, canDelete, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState({
    drawing_no: material.drawing_no || '', item_name: material.item_name, description: material.description,
    technical_spec: material.technical_spec, material_type: material.material_type, material: material.material,
    remarks: material.remarks || '', is_active: material.is_active,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };
  // The drawing no. is picked from the BOM subassemblies (or left empty).
  const fetchDrawings = (q, skip) => apiGet(`/materials/drawing-options?q=${encodeURIComponent(q)}&skip=${skip}`, { silent: true }).then((r) => r.data);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try { const r = await apiPut(`/materials/${material.id}`, { ...form, drawing_no: form.drawing_no || null }); onSaved(r.data); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const del = async () => {
    if (!window.confirm(`Delete ${material.imm_code} (${material.item_name})?`)) return;
    try { await apiDelete(`/materials/${material.id}`); onDeleted(material.id); onClose(); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-500">IMM code</p>
            <h2 className="text-base font-semibold font-mono text-gray-800">{material.imm_code}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <fieldset disabled={!canEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="m-name">Item name<span className="text-red-500"> *</span></label>
                <input id="m-name" value={form.item_name} onChange={(e) => set('item_name', e.target.value)} required maxLength={191} className="ams-input" />
              </div>
              <div>
                <span className={label}>Drawing no. <span className="normal-case font-normal text-gray-400">(from the BOM, optional)</span></span>
                {canEdit
                  ? <AsyncSearchSelect value={form.drawing_no} onChange={(v) => set('drawing_no', v || '')} fetchPage={fetchDrawings}
                      getValue={(d) => d.drawing_no} describe={(d) => ({ label: d.drawing_no, sub: d.name })}
                      placeholder="None" searchPlaceholder="Search drawing no. or name…" />
                  : <p className="text-sm text-gray-700 py-1.5">{form.drawing_no || '—'}</p>}
              </div>
              <div>
                <label className={label} htmlFor="m-type">Material type<span className="text-red-500"> *</span></label>
                <select id="m-type" value={form.material_type} onChange={(e) => set('material_type', e.target.value)} className="ams-input">
                  {MATERIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="m-mat">Material<span className="text-red-500"> *</span></label>
                <input id="m-mat" value={form.material} onChange={(e) => set('material', e.target.value)} required maxLength={191} placeholder="e.g. MS, SS304, Copper" className="ams-input" />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="m-desc">Description<span className="text-red-500"> *</span></label>
              <textarea id="m-desc" value={form.description} onChange={(e) => set('description', e.target.value)} required rows={2} className="ams-input resize-y" />
            </div>
            <div>
              <label className={label} htmlFor="m-spec">Technical specification<span className="text-red-500"> *</span></label>
              <textarea id="m-spec" value={form.technical_spec} onChange={(e) => set('technical_spec', e.target.value)} required rows={3} className="ams-input resize-y" />
            </div>
            <div>
              <label className={label} htmlFor="m-rem">Remarks</label>
              <textarea id="m-rem" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2} placeholder="Optional" className="ams-input resize-y" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Active
            </label>
          </fieldset>
          <div className="flex gap-3 pt-1">
            {canDelete && <button type="button" onClick={del} className="btn-danger justify-center py-2">Delete</button>}
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">{canEdit ? 'Cancel' : 'Close'}</button>
            {canEdit && <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Save'}</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MaterialsPage() {
  useAuth();
  const { me, can, loading: permLoading } = usePermissions();
  const has = (code) => me?.is_system || can(code);
  const canView = has('MATERIAL_VIEW');
  const canCreate = has('MATERIAL_CREATE');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [prefixId, setPrefixId] = useState('');
  const [prefixes, setPrefixes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [limit, setLimit, limitRef] = usePageSize('materials', 20);

  const fetchRows = async (p = page, s = search, t = type, px = prefixId) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(p), limit: String(limitRef.current), search: s });
      if (t) q.set('material_type', t);
      if (px) q.set('prefix_id', px);
      const res = await apiGet(`/materials?${q.toString()}`);
      setRows(res.data); setTotal(res.meta.pagination.total);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) {
      fetchRows(1);
      apiGet('/materials/prefixes', { silent: true }).then((r) => setPrefixes(r.data || [])).catch(() => {});
    } else if (!permLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); fetchRows(1, search); };
  const onType = (v) => { setType(v); setPage(1); fetchRows(1, search, v); };
  const onPrefix = (v) => { setPrefixId(v); setPage(1); fetchRows(1, search, type, v); };
  const goPage = (d) => { const p = page + d; setPage(p); fetchRows(p); };
  const onPageSize = (n) => { setLimit(n); setPage(1); fetchRows(1); };
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  if (permLoading) return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={6} rows={6} /></div>;
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view materials.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap">
        {canCreate && (
          <Link href="/dashboard/master-data/materials/new"
            className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm" style={{ backgroundColor: 'var(--ams-primary)' }}>New</Link>
        )}
        <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Materials</span>
        <div className="flex-1" />
        <select value={type} onChange={(e) => onType(e.target.value)} aria-label="Material type"
          className="py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer">
          <option value="">All types</option>
          {MATERIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={prefixId} onChange={(e) => onPrefix(e.target.value)} aria-label="Prefix"
          className="py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer">
          <option value="">All prefixes</option>
          {prefixes.map((p) => <option key={p.id} value={p.id}>{p.prefix}</option>)}
        </select>
        <form onSubmit={onSearch} className="flex items-center border border-gray-300 rounded overflow-hidden min-w-[220px]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, name, drawing, material…"
            className="flex-1 min-w-0 py-1.5 px-2.5 text-sm text-gray-700 outline-none bg-transparent" />
        </form>
        <div className="flex items-center gap-0.5 shrink-0 text-sm text-gray-500">
          <PageSizeSelect value={limit} onChange={onPageSize} />
          <span className="px-1 tabular-nums">{total === 0 ? '0' : `${from}-${to}`} / {total}</span>
          <button onClick={() => goPage(-1)} disabled={page === 1} aria-label="Previous page"
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">‹</button>
          <button onClick={() => goPage(1)} disabled={page * limit >= total} aria-label="Next page"
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">›</button>
        </div>
      </div>

      {loading ? <TableSkeleton cols={6} rows={6} /> : rows.length === 0 ? (
        <p className="py-14 text-center text-sm text-gray-400">
          No materials {search || type || prefixId ? 'match your filters' : 'yet'}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-3 font-normal">IMM code</th>
                <th className="px-3 py-3 font-normal">Item name</th>
                <th className="px-3 py-3 font-normal">Drawing no.</th>
                <th className="px-3 py-3 font-normal">Type</th>
                <th className="px-3 py-3 font-normal">Material</th>
                <th className="px-3 py-3 font-normal">Description</th>
                <th className="px-3 py-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} onClick={() => setEditing(m)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-800 whitespace-nowrap">{m.imm_code}</td>
                  <td className="px-3 py-2.5 text-gray-800">{m.item_name}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{m.drawing_no || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{MATERIAL_TYPE_LABEL[m.material_type]}</td>
                  <td className="px-3 py-2.5 text-gray-600">{m.material}</td>
                  <td className="px-3 py-2.5 text-gray-500 max-w-xs truncate" title={m.description}>{m.description}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${m.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditModal material={editing} canEdit={has('MATERIAL_EDIT')} canDelete={has('MATERIAL_DELETE')}
          onClose={() => setEditing(null)}
          onSaved={(m) => setRows((prev) => prev.map((r) => (r.id === m.id ? m : r)))}
          onDeleted={(id) => { setRows((prev) => prev.filter((r) => r.id !== id)); setTotal((t) => t - 1); }} />
      )}
    </div>
  );
}
