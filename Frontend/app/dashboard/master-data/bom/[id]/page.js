'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import useNav from '@/lib/useNav';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { MATERIAL_TYPE_LABEL } from '@/lib/materialOptions';

/**
 * Master Data → BOM → a subassembly (new or existing).
 *
 * Name and drawing no., then the builder: search the material master by IMM
 * code, drawing no. or item name, pick a result to add it, and set how many
 * are needed. Saved all at once.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

/** Search-as-you-type picker over the material master. */
function MaterialPicker({ excludeIds, onPick, disabled }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  // Materials already on the subassembly are left out by the server, so each page is 10 new ones.
  const exclude = [...excludeIds].join(',');
  const url = (skip) => `/bom/material-search?q=${encodeURIComponent(q)}&skip=${skip}&exclude=${exclude}`;

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await apiGet(`/bom/material-search?q=${encodeURIComponent(q)}&exclude=${exclude}`, { silent: true });
        if (!cancelled) { setResults(r.data.items || []); setHasMore(Boolean(r.data.has_more)); }
      } catch { if (!cancelled) { setResults([]); setHasMore(false); } }
      finally { if (!cancelled) setBusy(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open, exclude]);

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const shown = results.filter((m) => !excludeIds.has(m.id));
  const more = async () => {
    setBusy(true);
    try {
      const r = await apiGet(url(results.length), { silent: true });
      setResults((prev) => [...prev, ...(r.data.items || [])]); setHasMore(Boolean(r.data.has_more));
    } catch { /* keep what we have */ }
    finally { setBusy(false); }
  };

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor="mat-search" className="sr-only">Add material</label>
      <input id="mat-search" value={q} disabled={disabled} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        placeholder="Add material — search by IMM code, drawing no. or item name…" className="ams-input" />
      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {busy && shown.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">{q ? 'No matching materials' : 'No more materials to add'}</p>
          ) : (
            <ul>
              {shown.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => { onPick(m); setQ(''); setOpen(false); }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-gray-800">{m.imm_code}</span>
                      <span className="text-sm text-gray-800">{m.item_name}</span>
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {m.drawing_no ? `Drawing ${m.drawing_no} · ` : ''}{MATERIAL_TYPE_LABEL[m.material_type]} · {m.material}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <button type="button" onClick={more} disabled={busy}
              className="w-full py-2 text-xs font-medium text-[var(--ams-primary)] border-t border-gray-100 hover:bg-gray-50 cursor-pointer disabled:opacity-50">
              {busy ? 'Loading…' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SubassemblyPage() {
  useAuth();
  const nav = useNav();
  const { id } = useParams();
  const isNew = id === 'new';
  const { me, can, loading: permLoading } = usePermissions();
  const has = (code) => me?.is_system || can(code);
  const canSave = isNew ? has('BOM_CREATE') : has('BOM_EDIT');

  const [form, setForm] = useState({ name: '', drawing_no: '' });
  const [lines, setLines] = useState([]); // { material, quantity }
  const [loaded, setLoaded] = useState(isNew);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    if (isNew || permLoading) return undefined;
    let cancelled = false;
    apiGet(`/bom/subassemblies/${id}`)
      .then((r) => {
        if (cancelled) return;
        setForm({ name: r.data.name, drawing_no: r.data.drawing_no });
        setLines(r.data.items.map((i) => ({ material: i.material, quantity: String(Number(i.quantity)) })));
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) { setNotFound(true); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [id, isNew, permLoading]);

  const addMaterial = (m) => { setLines((prev) => [...prev, { material: m, quantity: '1' }]); setError(''); };
  const setQty = (mid, v) => setLines((prev) => prev.map((l) => (l.material.id === mid ? { ...l, quantity: v } : l)));
  const removeLine = (mid) => setLines((prev) => prev.filter((l) => l.material.id !== mid));
  const qtyBad = (v) => !(Number(v) > 0);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (lines.some((l) => qtyBad(l.quantity))) { setError('Every quantity must be more than 0.'); return; }
    setSaving(true);
    try {
      const body = { ...form, items: lines.map((l) => ({ material_id: l.material.id, quantity: Number(l.quantity) })) };
      if (isNew) {
        const r = await apiPost('/bom/subassemblies', body);
        nav(`/dashboard/master-data/bom/${r.data.id}`);
      } else {
        await apiPut(`/bom/subassemblies/${id}`, body);
        setSavedAt(new Date());
      }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete subassembly ${form.name} (${form.drawing_no})?`)) return;
    try { await apiDelete(`/bom/subassemblies/${id}`); nav('/dashboard/master-data/bom'); }
    catch (err) { setError(err.message); }
  };

  if (permLoading || !loaded) return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={5} rows={5} /></div>;
  if (!has('BOM_VIEW') || notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">{notFound ? 'Subassembly not found' : 'Access Denied'}</p>
        <Link href="/dashboard/master-data/bom" className="text-sm text-[var(--ams-primary)] hover:underline mt-1">Back to BOM</Link>
      </div>
    );
  }

  const ids = new Set(lines.map((l) => l.material.id));

  return (
    <form onSubmit={save} className="space-y-3 pb-10">
      <div className="bg-white rounded border border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link href="/dashboard/master-data/bom" className="text-sm text-gray-500 hover:text-gray-800">← BOM</Link>
        <h1 className="text-base font-semibold text-gray-900">{isNew ? 'New subassembly' : form.name || 'Subassembly'}</h1>
        <div className="flex-1" />
        {savedAt && <span className="text-xs text-green-700">Saved</span>}
        {!isNew && has('BOM_DELETE') && (
          <button type="button" onClick={remove} className="btn-danger px-3 py-1.5">Delete</button>
        )}
        {canSave && <button type="submit" disabled={saving} className="btn-primary px-4 py-1.5">{saving ? 'Saving…' : 'Save'}</button>}
      </div>

      {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}

      <fieldset disabled={!canSave} className="bg-white rounded border border-gray-200 px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="sa-name">Subassembly name<span className="text-red-500"> *</span></label>
          <input id="sa-name" value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setSavedAt(null); }}
            required maxLength={191} placeholder="e.g. Coil assembly" className="ams-input" />
        </div>
        <div>
          <label className={label} htmlFor="sa-dwg">Drawing no.<span className="text-red-500"> *</span></label>
          <input id="sa-dwg" value={form.drawing_no} onChange={(e) => { setForm((f) => ({ ...f, drawing_no: e.target.value })); setSavedAt(null); }}
            required maxLength={100} placeholder="e.g. DWG-1203" className="ams-input font-mono" />
        </div>
      </fieldset>

      <div className="bg-white rounded border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800 shrink-0">Materials <span className="text-gray-400 font-normal tabular-nums">{lines.length}</span></h2>
          {canSave && <div className="flex-1 min-w-[260px]"><MaterialPicker excludeIds={ids} onPick={(m) => { addMaterial(m); setSavedAt(null); }} /></div>}
        </div>

        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            No materials yet.{canSave && ' Search above and pick a material to add it.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 760 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2.5 font-normal w-8">#</th>
                  <th className="px-3 py-2.5 font-normal">IMM code</th>
                  <th className="px-3 py-2.5 font-normal">Item name</th>
                  <th className="px-3 py-2.5 font-normal">Drawing no.</th>
                  <th className="px-3 py-2.5 font-normal">Type · Material</th>
                  <th className="px-3 py-2.5 font-normal w-32">Quantity</th>
                  <th className="px-3 py-2.5 w-10"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const m = l.material;
                  const flag = m.deleted_at ? 'Deleted' : !m.is_active ? 'Inactive' : null;
                  return (
                    <tr key={m.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-800 whitespace-nowrap">
                        {m.imm_code}
                        {flag && <span className="ml-2 font-sans font-medium text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{flag}</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-800">{m.item_name}</td>
                      <td className="px-3 py-2 text-gray-600">{m.drawing_no || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{MATERIAL_TYPE_LABEL[m.material_type]} · {m.material}</td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="any" inputMode="decimal" aria-label={`Quantity of ${m.imm_code}`}
                          value={l.quantity} disabled={!canSave} onChange={(e) => { setQty(m.id, e.target.value); setSavedAt(null); }}
                          className={`w-28 text-sm text-right tabular-nums border rounded px-2 py-1 ${qtyBad(l.quantity) ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canSave && (
                          <button type="button" onClick={() => { removeLine(m.id); setSavedAt(null); }} aria-label={`Remove ${m.imm_code}`}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </form>
  );
}
