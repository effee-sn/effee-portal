'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { SideCard, SideRow, KeyFacts, TabBar } from '@/components/DetailSide';
import { MATERIAL_TYPES, MATERIAL_TYPE_LABEL, revName } from '@/lib/materialOptions';

/**
 * Master Data → Materials → one material: its details, where it is used (the
 * subassemblies listing it, or the subassembly it is the item of), its drawing
 * revisions (Finished parts: Original, then Rev A, B … — a change to the
 * description, specification or material is a new revision, released with
 * Materials → Approve) and its change history. Edited in a form; a material on a subassembly keeps its unit and
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
  // A Finished part changes its description, specification and material through a new revision.
  const revised = isRevisable(material);
  // Active units, plus the current one even if it has since been made inactive.
  const unitChoices = units.filter((u) => u.is_active || u.id === material.uom_id);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = { ...form, drawing_no: form.drawing_no || null, uom_id: Number(form.uom_id) };
      if (unitLocked) delete body.uom_id;
      if (owned) { delete body.item_name; delete body.drawing_no; delete body.material_type; }
      if (revised) { delete body.description; delete body.technical_spec; delete body.material; }
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
          {revised && (
            <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-2.5 py-2">
              Its description, technical specification and material change through a new drawing revision (Revisions tab).
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="m-name">Item name<span className="text-red-500"> *</span></label>
              <input id="m-name" value={form.item_name} onChange={(e) => set('item_name', e.target.value)} required maxLength={191} disabled={owned} className="ams-input disabled:bg-gray-50" />
            </div>
            <div>
              <label className={label} htmlFor="m-dwg">Drawing no. <span className="normal-case font-normal text-gray-400">(optional, one material each)</span></label>
              {owned ? <p className="text-sm text-gray-700 py-2 font-mono">{form.drawing_no}</p> : (
                <input id="m-dwg" value={form.drawing_no} onChange={(e) => set('drawing_no', e.target.value)} maxLength={100} placeholder="None" className="ams-input font-mono" />
              )}
            </div>
            <div>
              <label className={label} htmlFor="m-type">Material type<span className="text-red-500"> *</span></label>
              <select id="m-type" value={form.material_type} onChange={(e) => set('material_type', e.target.value)} disabled={owned} className="ams-input disabled:bg-gray-50">
                {MATERIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="m-mat">Material<span className="text-red-500"> *</span></label>
              <input id="m-mat" value={form.material} onChange={(e) => set('material', e.target.value)} required maxLength={191} placeholder="e.g. MS, SS304, Copper" disabled={revised} className="ams-input disabled:bg-gray-50" />
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
            <textarea id="m-desc" value={form.description} onChange={(e) => set('description', e.target.value)} required rows={2} disabled={revised} className="ams-input resize-y disabled:bg-gray-50" />
          </div>
          <div>
            <label className={label} htmlFor="m-spec">Technical specification<span className="text-red-500"> *</span></label>
            <textarea id="m-spec" value={form.technical_spec} onChange={(e) => set('technical_spec', e.target.value)} required rows={3} disabled={revised} className="ams-input resize-y disabled:bg-gray-50" />
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

/** A Finished part (not a subassembly's item): it has drawing revisions. */
const isRevisable = (m) => m.material_type === 'FINISHED' && !m.subassembly;
const REV_STATUS = {
  DRAFT: { text: 'Draft', cls: 'bg-amber-50 text-amber-800' },
  RELEASED: { text: 'Released', cls: 'bg-green-50 text-green-700' },
  SUPERSEDED: { text: 'Superseded', cls: 'bg-gray-100 text-gray-500' },
};
const REV_FIELDS = [['description', 'Description'], ['technical_spec', 'Technical specification'], ['material_text', 'Material']];

/** A Finished part's drawing revisions: the list, a draft being changed, and its release. */
function Revisions({ material, canEdit, canApprove, onReleased }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null); // a revision shown in full
  const [draft, setDraft] = useState(null); // the draft's fields being edited
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiGet(`/materials/${material.id}/revisions`, { silent: true })
      .then((r) => {
        if (cancelled) return;
        setData(r.data);
        const d = r.data.items.find((x) => x.status === 'DRAFT');
        setDraft(d ? { id: d.id, rev: d.rev, description: d.description, technical_spec: d.technical_spec, material: d.material_text } : null);
      })
      .catch((e) => { if (!cancelled) { setData({ items: [], revisable: false }); setError(e.message); } });
    return () => { cancelled = true; };
  }, [material.id, version]);

  const run = async (fn, done) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); if (done) setNotice(done); setVersion((v) => v + 1); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const start = () => run(() => apiPost(`/materials/${material.id}/revisions`, {}), 'New revision started as a draft — change it below, then release it.');
  const saveDraft = () => run(() => apiPut(`/materials/${material.id}/revisions/${draft.id}`, {
    description: draft.description, technical_spec: draft.technical_spec, material: draft.material,
  }), `${revName(draft.rev)} saved.`);
  const discard = () => {
    if (!window.confirm(`Discard draft ${revName(draft.rev)}? Its changes are lost.`)) return;
    run(() => apiDelete(`/materials/${material.id}/revisions/${draft.id}`), 'Draft discarded.');
  };
  const release = () => run(async () => {
    await apiPut(`/materials/${material.id}/revisions/${draft.id}`, { description: draft.description, technical_spec: draft.technical_spec, material: draft.material });
    const r = await apiPost(`/materials/${material.id}/revisions/${draft.id}/release`, { change_note: note });
    setNote('');
    onReleased(r.data);
  }, `${revName(draft.rev)} released — it is now the current revision.`);

  if (!data) return <TableSkeleton cols={4} rows={3} />;
  if (!data.revisable) return <p className="text-sm text-gray-500">Only Finished parts have drawing revisions{material.subassembly ? ' — this is a subassembly’s item, revised on its subassembly' : ''}.</p>;

  const items = data.items;
  const previousOf = (r) => items.find((x) => x.seq < r.seq && x.status !== 'DRAFT');
  const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

  return (
    <div className="space-y-4">
      {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
      {notice && <p className="px-3 py-2 rounded text-sm border bg-green-50 border-green-200 text-green-800">{notice}</p>}

      {draft ? (
        <div className="rounded border border-amber-200 bg-amber-50/40 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-800">{revName(draft.rev)} <span className="ml-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">Draft</span>
            <span className="ml-2 font-normal text-gray-500">— until it is released, the part and everything using it stay on the current revision.</span></p>
          <fieldset disabled={!canEdit || busy} className="space-y-3">
            <div><label className={label} htmlFor="rv-desc">Description</label>
              <textarea id="rv-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="ams-input resize-y" /></div>
            <div><label className={label} htmlFor="rv-spec">Technical specification</label>
              <textarea id="rv-spec" rows={3} value={draft.technical_spec} onChange={(e) => setDraft({ ...draft, technical_spec: e.target.value })} className="ams-input resize-y" /></div>
            <div><label className={label} htmlFor="rv-mat">Material</label>
              <input id="rv-mat" value={draft.material} onChange={(e) => setDraft({ ...draft, material: e.target.value })} maxLength={191} className="ams-input" /></div>
          </fieldset>
          {canApprove && (
            <div><label className={label} htmlFor="rv-note">Change note <span className="text-red-500">*</span></label>
              <textarea id="rv-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why" className="ams-input resize-y" /></div>
          )}
          <div className="flex gap-2 flex-wrap">
            {canEdit && <button type="button" onClick={saveDraft} disabled={busy} className="btn-secondary px-3 py-1.5">Save draft</button>}
            {canEdit && <button type="button" onClick={discard} disabled={busy} className="btn-secondary px-3 py-1.5">Discard draft</button>}
            {canApprove && <button type="button" onClick={release} disabled={busy || !note.trim()} className="btn-primary px-3 py-1.5 disabled:opacity-40">Release {revName(draft.rev)}</button>}
          </div>
          {!canApprove && <p className="text-xs text-gray-500">Releasing needs Materials → Approve.</p>}
        </div>
      ) : canEdit && (
        <button type="button" onClick={start} disabled={busy} className="btn-primary px-4 py-1.5">New revision</button>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2 pr-3 font-normal">Revision</th>
            <th className="py-2 pr-3 font-normal">Status</th>
            <th className="py-2 pr-3 font-normal">Change note</th>
            <th className="py-2 font-normal">Released</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const prev = previousOf(r);
            const changed = prev ? REV_FIELDS.filter(([k]) => prev[k] !== r[k]) : [];
            return (
              <Fragment key={r.id}>
                <tr className="border-b border-gray-100 cursor-pointer hover:bg-gray-50" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td className="py-2 pr-3 font-medium text-gray-800 whitespace-nowrap">{open === r.id ? '▾' : '▸'} {revName(r.rev)}</td>
                  <td className="py-2 pr-3"><span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${REV_STATUS[r.status].cls}`}>{REV_STATUS[r.status].text}</span></td>
                  <td className="py-2 pr-3 text-gray-700">{r.change_note || '—'}{changed.length > 0 && <span className="ml-2 text-xs text-gray-400">({changed.map(([, l]) => l.toLowerCase()).join(', ')} changed)</span>}</td>
                  <td className="py-2 text-gray-500 whitespace-nowrap">{r.released_at ? `${when(r.released_at)}${r.released_by_name ? ` · ${r.released_by_name}` : ''}` : '—'}</td>
                </tr>
                {open === r.id && (
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <td colSpan={4} className="px-3 py-3">
                      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2">
                        {REV_FIELDS.map(([k, l]) => (
                          <div key={k}>
                            <dt className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{l}{prev && prev[k] !== r[k] && <span className="ml-1 normal-case font-medium text-amber-700">changed</span>}</dt>
                            <dd className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                              {prev && prev[k] !== r[k] && <span className="block line-through text-gray-400">{prev[k]}</span>}
                              {r[k]}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A labelled block of text on the Details tab. */
function Field({ name, children, big = false }) {
  return (
    <div>
      <dt className={label}>{name}</dt>
      <dd className={`${big ? 'text-[15px] leading-relaxed' : 'text-sm'} text-gray-800 whitespace-pre-wrap break-words`}>{children || <span className="text-gray-400">—</span>}</dd>
    </div>
  );
}


function WhereUsed({ data }) {
  if (!data) return <TableSkeleton cols={3} rows={3} />;
  return (
    <div className="space-y-5">
      {data.self && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">It is this subassembly</h3>
          <Link href={`/dashboard/master-data/subassemblies/${data.self.id}`} className="inline-flex items-center gap-2 text-sm hover:underline">
            <span className="font-mono font-semibold text-gray-800">{data.self.drawing_no}</span>
            <span className="text-gray-600">{data.self.name}</span>
          </Link>
        </div>
      )}
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
                    {s.held && <span className="mr-2 text-xs text-gray-700">holds <b>{revName(s.held.rev)}</b> ·</span>}{s.revision ? <>{revName(s.revision.rev)} <span className="text-xs text-gray-400">{s.revision.status === 'DRAFT' ? '(draft)' : '(current)'}</span></> : '—'}
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
  const canApprove = has('MATERIAL_APPROVE');

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

  const revisable = isRevisable(material);
  const currentRev = material.revisions?.find((r) => r.status === 'RELEASED');
  const draftRev = material.revisions?.find((r) => r.status === 'DRAFT');
  const tabs = [
    { key: 'details', label: 'Details' },
    ...(revisable ? [{ key: 'revisions', label: 'Revisions' }] : []),
    { key: 'used', label: `Where used${used ? ` (${new Set(used.subassemblies.map((s) => s.id)).size})` : ''}` },
    { key: 'history', label: 'History' },
  ];

  // Distinct subassemblies using it (a current and a draft revision of one count once).
  const usedOn = used ? [...new Map(used.subassemblies.map((s) => [s.id, s])).values()] : [];
  const chip = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium';

  return (
    <div className="space-y-4 p-4 pb-8">
      {/* Header: who it is, its state, and what can be done with it */}
      <header className="bg-white rounded border border-gray-200 px-5 py-4">
        <Link href="/dashboard/master-data/materials" className="text-sm text-gray-500 hover:text-gray-800">← Materials</Link>
        <div className="flex items-start gap-4 mt-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-500">{material.imm_code}</span>
              <span className={`${chip} ${material.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{material.is_active ? 'Active' : 'Inactive'}</span>
              <span className={`${chip} bg-gray-100 text-gray-700`}>{MATERIAL_TYPE_LABEL[material.material_type]}</span>
              {revisable && currentRev && <span className={`${chip} bg-[var(--ams-primary-mid)] text-[var(--ams-primary)]`} title="Current drawing revision">{revName(currentRev.rev)}</span>}
              {revisable && draftRev && (
                <button type="button" onClick={() => setTab('revisions')} className={`${chip} bg-amber-50 text-amber-800 hover:underline cursor-pointer`}>Draft {revName(draftRev.rev)} open</button>
              )}
              {material.subassembly && (
                <Link href={`/dashboard/master-data/subassemblies/${material.subassembly.id}`} className={`${chip} bg-indigo-50 text-indigo-700 hover:underline`}>Subassembly — open it</Link>
              )}
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mt-1 break-words">{material.item_name}</h1>
            {/* Key facts at a glance */}
            <KeyFacts items={[
              ['Drawing no.', material.drawing_no, true],
              ['Material', material.material],
              ['Unit', material.uom ? `${material.uom.code} — ${material.uom.name}` : null],
              ['Used on', used ? `${usedOn.length} subassembl${usedOn.length === 1 ? 'y' : 'ies'}` : '…'],
            ]} />
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
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Left: the tabs */}
        <div className="lg:col-span-2 bg-white rounded border border-gray-200 min-w-0">
          <TabBar tabs={tabs} active={tab} onPick={setTab} />

          <div className="px-5 py-5">
            {tab === 'details' && (
              <div className="space-y-6">
                <section>
                  <h2 className="text-sm font-semibold text-gray-800 mb-3">Specification{revisable && currentRev && <span className="ml-2 text-xs font-normal text-gray-500">as in {revName(currentRev.rev)}</span>}</h2>
                  <dl className="space-y-4">
                    <Field name="Description" big>{material.description}</Field>
                    <Field name="Technical specification" big>{material.technical_spec}</Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field name="Material">{material.material}</Field>
                      <Field name="Unit of measure">{material.uom ? `${material.uom.code} — ${material.uom.name}` : null}</Field>
                    </div>
                  </dl>
                  {revisable && <p className="mt-3 text-xs text-gray-500">The description, specification and material change through a new revision (Revisions tab).</p>}
                </section>
                <section className="border-t border-gray-100 pt-5">
                  <h2 className="text-sm font-semibold text-gray-800 mb-3">Notes</h2>
                  <dl><Field name="Remarks">{material.remarks}</Field></dl>
                </section>
              </div>
            )}
            {tab === 'revisions' && revisable && (
              <Revisions material={material} canEdit={canEdit} canApprove={canApprove}
                onReleased={(m) => setMaterial(m)} />
            )}
            {tab === 'used' && <WhereUsed data={used} />}
            {tab === 'history' && <History key={material.updated_at} materialId={material.id} units={units} />}
          </div>
        </div>

        {/* Right: the summary, on every tab */}
        <aside className="space-y-4">
          <SideCard title="Identification">
            <SideRow name="IMM code" mono>{material.imm_code}</SideRow>
            <SideRow name="Prefix" mono>{material.prefix?.prefix}</SideRow>
            <SideRow name="Drawing no." mono>{material.drawing_no}</SideRow>
            <SideRow name="Type">{MATERIAL_TYPE_LABEL[material.material_type]}</SideRow>
            <SideRow name="Unit">{material.uom?.code}</SideRow>
            <SideRow name="Status">{material.is_active ? 'Active' : 'Inactive'}</SideRow>
          </SideCard>

          {revisable && (
            <SideCard title="Drawing revision"
              action={<button type="button" onClick={() => setTab('revisions')} className="text-xs text-[var(--ams-primary)] hover:underline cursor-pointer">All revisions</button>}>
              <SideRow name="Current">{currentRev ? revName(currentRev.rev) : null}</SideRow>
              <SideRow name="Draft">{draftRev ? `${revName(draftRev.rev)} open` : 'None'}</SideRow>
            </SideCard>
          )}

          <SideCard title="Usage"
            action={usedOn.length > 0 && <button type="button" onClick={() => setTab('used')} className="text-xs text-[var(--ams-primary)] hover:underline cursor-pointer">Details</button>}>
            {material.subassembly && (
              <SideRow name="Item of">
                <Link href={`/dashboard/master-data/subassemblies/${material.subassembly.id}`} className="text-[var(--ams-primary)] hover:underline">its subassembly</Link>
              </SideRow>
            )}
            {!used ? <p className="text-sm text-gray-400">Loading…</p> : usedOn.length === 0 ? (
              <p className="text-sm text-gray-500">Not on any subassembly yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {usedOn.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <Link href={`/dashboard/master-data/subassemblies/${s.id}`} className="font-mono text-xs font-semibold text-gray-800 hover:underline shrink-0">{s.drawing_no}</Link>
                    <span className="text-gray-600 truncate text-right">{s.name}</span>
                  </li>
                ))}
                {usedOn.length > 5 && <li className="text-xs text-gray-500">and {usedOn.length - 5} more</li>}
              </ul>
            )}
          </SideCard>

          <SideCard title="Record">
            <SideRow name="Added">{when(material.created_at)}</SideRow>
            <SideRow name="Last changed">{when(material.updated_at)}</SideRow>
          </SideCard>
        </aside>
      </div>

      {editing && (
        <EditModal material={material} units={units} unitLocked={usedCount > 0} onClose={() => setEditing(false)}
          onSaved={(m) => setMaterial(m)} />
      )}
    </div>
  );
}
