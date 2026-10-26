'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import AsyncSearchSelect from '@/components/AsyncSearchSelect';
import { MATERIAL_TYPES, MATERIAL_TYPE_LABEL } from '@/lib/materialOptions';

/**
 * Master Data → Materials → one material: its details, where it is used (the
 * subassemblies listing it, and the drawing it belongs to) and its change
 * history. Edited in a form; a material on a subassembly keeps its unit and
 * can't be deleted, only made inactive.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

// History: readable field names and values.
const FIELD_LABEL = {
  drawing_no: 'Drawing no.', item_name: 'Item name', description: 'Description', technical_spec: 'Technical specification',
  material_type: 'Material type', material: 'Material', uom_id: 'Unit', remarks: 'Remarks', is_active: 'Status',
};
const ACTION_LABEL = { CREATE: 'Created', UPDATE: 'Changed', DELETE: 'Deleted' };
const when = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function EditModal({ material, units, unitLocked, onClose, onSaved }) {
  const [form, setForm] = useState({
    drawing_no: material.drawing_no || '', item_name: material.item_name, description: material.description,
    technical_spec: material.technical_spec, material_type: material.material_type, material: material.material,
    uom_id: String(material.uom_id), remarks: material.remarks || '', is_active: material.is_active,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };
  // A subassembly's own item takes its name, drawing no. and type from the subassembly.
  const owned = Boolean(material.subassembly);
  // The drawing no. is picked from the subassemblies (or left empty).
  const fetchDrawings = (q, skip) => apiGet(`/materials/drawing-options?q=${encodeURIComponent(q)}&skip=${skip}`, { silent: true }).then((r) => r.data);
  // Active units, plus the current one even if it has since been made inactive.
  const unitChoices = units.filter((u) => u.is_active || u.id === material.uom_id);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = { ...form, drawing_no: form.drawing_no || null, uom_id: Number(form.uom_id) };
      if (unitLocked) delete body.uom_id;
      if (owned) { delete body.item_name; delete body.drawing_no; delete body.material_type; }
      const r = await apiPut(`/materials/${material.id}`, body);
      onSaved(r.data); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-500">Edit material</p>
            <h2 className="text-base font-semibold font-mono text-gray-800">{material.imm_code}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          {owned && (
            <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-2.5 py-2">
              This is a subassembly&apos;s item: its name, drawing no. and type are changed on the subassembly.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="m-name">Item name<span className="text-red-500"> *</span></label>
              <input id="m-name" value={form.item_name} onChange={(e) => set('item_name', e.target.value)} required maxLength={191} disabled={owned} className="ams-input disabled:bg-gray-50" />
            </div>
            <div>
              <span className={label}>Drawing no. <span className="normal-case font-normal text-gray-400">(a subassembly&apos;s, optional)</span></span>
              {owned ? <p className="text-sm text-gray-700 py-2 font-mono">{form.drawing_no}</p> : <AsyncSearchSelect value={form.drawing_no} onChange={(v) => set('drawing_no', v || '')} fetchPage={fetchDrawings}
                getValue={(d) => d.drawing_no} describe={(d) => ({ label: d.drawing_no, sub: d.name })}
                placeholder="None" searchPlaceholder="Search drawing no. or name…" />}
            </div>
            <div>
              <label className={label} htmlFor="m-type">Material type<span className="text-red-500"> *</span></label>
              <select id="m-type" value={form.material_type} onChange={(e) => set('material_type', e.target.value)} disabled={owned} className="ams-input disabled:bg-gray-50">
                {MATERIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="m-mat">Material<span className="text-red-500"> *</span></label>
              <input id="m-mat" value={form.material} onChange={(e) => set('material', e.target.value)} required maxLength={191} placeholder="e.g. MS, SS304, Copper" className="ams-input" />
            </div>
            <div>
              <label className={label} htmlFor="m-uom">Unit of measure<span className="text-red-500"> *</span></label>
              <select id="m-uom" value={form.uom_id} onChange={(e) => set('uom_id', e.target.value)} disabled={unitLocked} className="ams-input disabled:bg-gray-50">
                {unitChoices.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </select>
              {unitLocked && <p className="text-[11px] text-gray-500 mt-1">Fixed: this material is on a subassembly.</p>}
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
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            Active (inactive materials can&apos;t be added to subassemblies)
          </label>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ name, children, wide = false }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className={label}>{name}</dt>
      <dd className="text-sm text-gray-800 whitespace-pre-wrap break-words">{children || <span className="text-gray-400">—</span>}</dd>
    </div>
  );
}

function WhereUsed({ data }) {
  if (!data) return <TableSkeleton cols={3} rows={3} />;
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{data.self ? 'It is this subassembly' : 'Its drawing'}</h3>
        {data.drawing ? (
          <Link href={`/dashboard/master-data/subassemblies/${data.drawing.id}`} className="inline-flex items-center gap-2 text-sm hover:underline">
            <span className="font-mono font-semibold text-gray-800">{data.drawing.drawing_no}</span>
            <span className="text-gray-600">{data.drawing.name}</span>
          </Link>
        ) : <p className="text-sm text-gray-400">No drawing no. set.</p>}
      </div>
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Used on subassemblies ({data.subassemblies.length})</h3>
        <p className="text-xs text-gray-500 mb-2">In their current and draft revisions; earlier revisions keep it in their history.</p>
        {data.subassemblies.length === 0 ? (
          <p className="text-sm text-gray-400">Not on any subassembly yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-normal">Drawing no.</th>
                <th className="py-2 pr-3 font-normal">Subassembly</th>
                <th className="py-2 pr-3 font-normal">Revision</th>
                <th className="py-2 font-normal text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {data.subassemblies.map((s) => (
                <tr key={`${s.id}-${s.revision?.rev}`} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-mono text-xs font-semibold">
                    <Link href={`/dashboard/master-data/subassemblies/${s.id}`} className="text-gray-800 hover:underline">{s.drawing_no}</Link>
                  </td>
                  <td className="py-2 pr-3 text-gray-700">{s.name}</td>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                    {s.revision ? <>Rev {s.revision.rev} <span className="text-xs text-gray-400">{s.revision.status === 'DRAFT' ? '(draft)' : '(current)'}</span></> : '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{Number(s.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function History({ materialId, units }) {
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet(`/materials/${materialId}/history?page=${page}&limit=20`, { silent: true })
      .then((r) => { if (!cancelled) { setItems((prev) => (page === 1 ? r.data : [...(prev || []), ...r.data])); setTotal(r.meta.pagination.total); } })
      .catch(() => { if (!cancelled) setItems((prev) => prev || []); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [materialId, page]);

  const unitCode = (id) => units.find((u) => u.id === Number(id))?.code ?? id;
  const show = (field, v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (field === 'material_type') return MATERIAL_TYPE_LABEL[v] || v;
    if (field === 'uom_id') return unitCode(v);
    if (field === 'is_active') return v ? 'Active' : 'Inactive';
    return String(v);
  };

  if (items === null) return <TableSkeleton cols={3} rows={3} />;
  if (items.length === 0) return <p className="text-sm text-gray-400">No history recorded.</p>;
  return (
    <div>
      <ol className="space-y-3">
        {items.map((e) => {
          const changes = e.changes && typeof e.changes === 'object' ? e.changes : {};
          const fields = e.action === 'UPDATE' ? Object.entries(changes).filter(([, v]) => v && typeof v === 'object' && 'from' in v) : [];
          return (
            <li key={e.id} className="border-l-2 border-gray-200 pl-3">
              <p className="text-sm text-gray-800">
                <span className="font-medium">{ACTION_LABEL[e.action] || e.action}</span>
                <span className="text-gray-500"> by {e.actor_label || e.actor_email || 'system'} · {when(e.created_at)}</span>
              </p>
              {e.action === 'CREATE' && changes.imm_code && (
                <p className="text-xs text-gray-600 mt-0.5">as <span className="font-mono">{changes.imm_code}</span>{changes.unit ? `, counted in ${changes.unit}` : ''}</p>
              )}
              {fields.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {fields.map(([k, v]) => (
                    <li key={k} className="text-xs text-gray-600 break-words">
                      <span className="text-gray-500">{FIELD_LABEL[k] || k}:</span>{' '}
                      <span className="line-through text-gray-400">{show(k, v.from)}</span> → <span className="text-gray-800">{show(k, v.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {items.length < total && (
        <button type="button" onClick={() => { setBusy(true); setPage((p) => p + 1); }} disabled={busy} className="mt-4 btn-secondary px-3 py-1.5">
          {busy ? 'Loading…' : 'Show older'}
        </button>
      )}
    </div>
  );
}

export default function MaterialPage() {
  useAuth();
  const { id } = useParams();
  const router = useRouter();
  const { me, can, loading: permLoading } = usePermissions();
  const has = (code) => me?.is_system || can(code);
  const canView = has('MATERIAL_VIEW');
  const canEdit = has('MATERIAL_EDIT');
  const canDelete = has('MATERIAL_DELETE');

  const [material, setMaterial] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [used, setUsed] = useState(null);
  const [units, setUnits] = useState([]);
  const [tab, setTab] = useState('details');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (permLoading || !canView) return undefined;
    let cancelled = false;
    apiGet(`/materials/${id}`, { silent: true })
      .then((r) => { if (!cancelled) setMaterial(r.data); })
      .catch(() => { if (!cancelled) setNotFound(true); });
    apiGet(`/materials/${id}/where-used`, { silent: true }).then((r) => { if (!cancelled) setUsed(r.data); }).catch(() => {});
    apiGet('/materials/units', { silent: true }).then((r) => { if (!cancelled) setUnits(r.data || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, permLoading, canView]);

  const usedCount = used?.subassemblies.length ?? 0;

  const del = async () => {
    if (!window.confirm(`Delete ${material.imm_code} (${material.item_name})?`)) return;
    setError('');
    try { await apiDelete(`/materials/${material.id}`); router.push('/dashboard/master-data/materials'); }
    catch (e) { setError(e.message); }
  };

  if (permLoading || (canView && !material && !notFound)) {
    return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={4} rows={6} /></div>;
  }
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view materials.</p>
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Material not found</p>
        <Link href="/dashboard/master-data/materials" className="text-sm text-[var(--ams-primary)] hover:underline">← Back to materials</Link>
      </div>
    );
  }

  const tabs = [
    { key: 'details', label: 'Details' },
    { key: 'used', label: `Where used${used ? ` (${usedCount})` : ''}` },
    { key: 'history', label: 'History' },
  ];

  return (
    <div className="bg-white rounded border border-gray-200 max-w-5xl">
      <div className="px-5 py-4 border-b border-gray-200">
        <Link href="/dashboard/master-data/materials" className="text-sm text-gray-500 hover:text-gray-800">← Materials</Link>
        <div className="flex items-start gap-3 mt-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold text-gray-500">{material.imm_code}</p>
            <h1 className="text-lg font-semibold text-gray-800 break-words">{material.item_name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
              <span className={`inline-flex px-2 py-0.5 rounded font-medium ${material.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {material.is_active ? 'Active' : 'Inactive'}
              </span>
              {material.subassembly && (
                <Link href={`/dashboard/master-data/subassemblies/${material.subassembly.id}`} className="inline-flex px-2 py-0.5 rounded font-medium bg-indigo-50 text-indigo-700 hover:underline">
                  Subassembly — open it
                </Link>
              )}
              <span className="text-gray-500">{MATERIAL_TYPE_LABEL[material.material_type]} · {material.material} · counted in {material.uom?.code}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {canEdit && <button type="button" onClick={() => setEditing(true)} className="btn-primary px-4 py-1.5">Edit</button>}
            {canDelete && (
              <button type="button" onClick={del} disabled={usedCount > 0 || Boolean(material.subassembly)} className="btn-danger px-4 py-1.5 disabled:opacity-40"
                title={material.subassembly ? 'A subassembly’s item — delete the subassembly instead' : usedCount > 0 ? 'On a subassembly — make it inactive instead' : undefined}>Delete</button>
            )}
          </div>
        </div>
        {error && <p className="mt-3 px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
      </div>

      <div className="flex gap-1 px-5 border-b border-gray-200" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2.5 text-sm -mb-px border-b-2 cursor-pointer ${tab === t.key ? 'border-[var(--ams-primary)] text-gray-800 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-5">
        {tab === 'details' && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <Field name="IMM code"><span className="font-mono">{material.imm_code}</span></Field>
            <Field name="Drawing no.">{material.drawing_no}</Field>
            <Field name="Item name">{material.item_name}</Field>
            <Field name="Material type">{MATERIAL_TYPE_LABEL[material.material_type]}</Field>
            <Field name="Material">{material.material}</Field>
            <Field name="Unit of measure">{material.uom ? `${material.uom.code} — ${material.uom.name}` : null}</Field>
            <Field name="Description" wide>{material.description}</Field>
            <Field name="Technical specification" wide>{material.technical_spec}</Field>
            <Field name="Remarks" wide>{material.remarks}</Field>
            <Field name="Added">{when(material.created_at)}</Field>
            <Field name="Last changed">{when(material.updated_at)}</Field>
          </dl>
        )}
        {tab === 'used' && <WhereUsed data={used} />}
        {tab === 'history' && <History key={material.updated_at} materialId={material.id} units={units} />}
      </div>

      {editing && (
        <EditModal material={material} units={units} unitLocked={usedCount > 0} onClose={() => setEditing(false)}
          onSaved={(m) => setMaterial(m)} />
      )}
    </div>
  );
}
