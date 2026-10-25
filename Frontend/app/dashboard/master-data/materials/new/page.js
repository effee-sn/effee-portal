'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost } from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';
import AsyncSearchSelect from '@/components/AsyncSearchSelect';
import { TableSkeleton } from '@/components/Skeleton';
import { MATERIAL_TYPES, formatImmCode } from '@/lib/materialOptions';

/**
 * Master Data → Materials → New: add many materials at once.
 *
 * A grid, one material per row. Each row picks its IMM code prefix (searchable);
 * the code itself is generated on save, so the grid only shows what it will
 * be. The drawing no. is optional and, when given, is picked from the BOM
 * subassemblies' drawing numbers. Rows left completely empty are ignored. Rows
 * can also be pasted from Excel. Everything is saved together, or nothing is.
 */

const REQUIRED = ['prefix_id', 'item_name', 'description', 'technical_spec', 'material_type', 'material'];
const FIELDS = ['drawing_no', 'item_name', 'description', 'technical_spec', 'material_type', 'material', 'remarks'];
let seq = 0;
const blank = (prefix_id = '') => ({
  key: (seq += 1), prefix_id, drawing_no: '', item_name: '', description: '', technical_spec: '', material_type: '', material: '', remarks: '',
});
const isEmpty = (r) => FIELDS.every((f) => !String(r[f] || '').trim());

/** "Bought-out", "bought out", "BO" … → BOUGHT_OUT. */
function typeFromText(t) {
  const s = String(t || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!s) return '';
  if (s.startsWith('fin')) return 'FINISHED';
  if (s.startsWith('bo') || s.startsWith('bought')) return 'BOUGHT_OUT';
  if (s.startsWith('con')) return 'CONSUMABLE';
  return '';
}

const cell = 'w-full text-sm border rounded px-2 py-1.5 bg-[var(--ams-surface)] text-[var(--ams-input-text)] outline-none focus:border-[var(--ams-primary)]';

export default function NewMaterialsPage() {
  useAuth();
  const { me, can, loading } = usePermissions();
  const canCreate = me?.is_system || can('MATERIAL_CREATE');

  const [prefixes, setPrefixes] = useState(null);
  // Drawing numbers known to be BOM subassemblies' (picked ones, and pasted ones checked with the server).
  const [knownDrawings, setKnownDrawings] = useState(() => new Set());
  const [checkedDrawings, setCheckedDrawings] = useState(() => new Set());
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, () => blank()));
  const [defaultPrefix, setDefaultPrefix] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [paste, setPaste] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (loading || !canCreate) return undefined;
    let cancelled = false;
    apiGet('/materials/prefixes').then((r) => { if (!cancelled) setPrefixes(r.data || []); })
      .catch((e) => { if (!cancelled) { setPrefixes([]); setError(e.message); } });
    return () => { cancelled = true; };
  }, [loading, canCreate]);

  const activePrefixes = useMemo(() => (prefixes || []).filter((p) => p.is_active), [prefixes]);
  const prefixOptions = useMemo(() => activePrefixes.map((p) => ({
    value: String(p.id), label: p.prefix, sub: `next ${p.preview}${p.description ? ` · ${p.description}` : ''}`,
  })), [activePrefixes]);

  const fetchDrawings = (q, skip) => apiGet(`/materials/drawing-options?q=${encodeURIComponent(q)}&skip=${skip}`, { silent: true }).then((r) => r.data);
  const pickDrawing = (key, v) => {
    if (v) setKnownDrawings((s) => new Set(s).add(v));
    set(key, 'drawing_no', v || '');
  };
  // A drawing no. (e.g. pasted) the server says isn't a BOM subassembly's.
  const unknownDrawing = (r) => Boolean(r.drawing_no) && checkedDrawings.has(r.drawing_no) && !knownDrawings.has(r.drawing_no);

  // Pasted drawing numbers are checked against the BOM in one call.
  const checkDrawings = async (nos) => {
    const list = [...new Set(nos.filter(Boolean))];
    if (!list.length) return;
    try {
      const r = await apiGet(`/materials/drawing-options?nos=${encodeURIComponent(list.join(','))}`, { silent: true });
      setKnownDrawings((s) => { const n = new Set(s); (r.data.known || []).forEach((k) => n.add(k)); return n; });
      setCheckedDrawings((s) => { const n = new Set(s); list.forEach((k) => n.add(k)); return n; });
    } catch { /* the server checks on save anyway */ }
  };

  // The code each filled row will get, in order, per prefix (shown only).
  const previews = useMemo(() => {
    const cursor = new Map(activePrefixes.map((p) => [String(p.id), p.next_number]));
    const byId = new Map(activePrefixes.map((p) => [String(p.id), p]));
    return rows.map((r) => {
      if (!r.prefix_id || isEmpty(r) || !byId.has(r.prefix_id)) return '';
      const n = cursor.get(r.prefix_id); cursor.set(r.prefix_id, n + 1);
      return formatImmCode(byId.get(r.prefix_id), n);
    });
  }, [rows, activePrefixes]);

  const set = (key, field, value) => { setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))); setError(''); };
  const addRows = (n) => setRows((prev) => [...prev, ...Array.from({ length: n }, () => blank(defaultPrefix))]);
  const removeRow = (key) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : [blank(defaultPrefix)]));
  const duplicate = (key) => setRows((prev) => {
    const i = prev.findIndex((r) => r.key === key);
    const copy = { ...prev[i], key: (seq += 1) };
    return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
  });
  const applyPrefixToEmpty = (v) => {
    setDefaultPrefix(v);
    if (v) setRows((prev) => prev.map((r) => (r.prefix_id ? r : { ...r, prefix_id: v })));
  };

  const applyPaste = () => {
    const lines = paste.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
    if (!lines.length) return;
    const pasted = lines.map((l) => {
      const c = l.split('\t');
      return { ...blank(defaultPrefix), drawing_no: c[0] || '', item_name: c[1] || '', description: c[2] || '',
        technical_spec: c[3] || '', material_type: typeFromText(c[4]), material: c[5] || '', remarks: c[6] || '' };
    });
    setRows((prev) => [...prev.filter((r) => !isEmpty(r)), ...pasted]);
    setPaste(''); setShowPaste(false);
    checkDrawings(pasted.map((p) => p.drawing_no));
  };

  const filled = rows.filter((r) => !isEmpty(r));
  const missing = (r, f) => tried && !isEmpty(r) && !String(r[f] || '').trim();
  const invalidCount = filled.filter((r) => REQUIRED.some((f) => !String(r[f] || '').trim()) || unknownDrawing(r)).length;

  const save = async () => {
    setTried(true); setError('');
    if (!filled.length) { setError('Fill in at least one material.'); return; }
    if (invalidCount) { setError(`${invalidCount} row(s) need attention: a missing required field, or a drawing no. that isn't in the BOM (marked in red).`); return; }
    setSaving(true);
    try {
      const body = { rows: filled.map((r) => ({ ...Object.fromEntries(FIELDS.map((f) => [f, r[f]])), prefix_id: Number(r.prefix_id) })) };
      const res = await apiPost('/materials/bulk', body);
      setCreated(res.data);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading || (canCreate && prefixes === null)) {
    return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={8} rows={5} /></div>;
  }
  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to add materials.</p>
      </div>
    );
  }

  if (created) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden max-w-3xl">
        <div className="px-5 py-4 border-b border-gray-200">
          <h1 className="text-base font-semibold text-gray-800">{created.length} material{created.length === 1 ? '' : 's'} added</h1>
          <p className="text-sm text-gray-500 mt-0.5">Their IMM codes:</p>
        </div>
        <ul className="divide-y divide-gray-100">
          {created.map((m) => (
            <li key={m.id} className="px-5 py-2.5 flex gap-4 text-sm">
              <span className="font-mono font-semibold text-gray-800 w-40 shrink-0">{m.imm_code}</span>
              <span className="text-gray-700">{m.item_name}</span>
            </li>
          ))}
        </ul>
        <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
          <button type="button" onClick={() => { setCreated(null); setRows(Array.from({ length: 5 }, () => blank(defaultPrefix))); setTried(false); }}
            className="btn-secondary px-4 py-2">Add more</button>
          <Link href="/dashboard/master-data/materials" className="btn-primary px-4 py-2">Back to materials</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded border border-gray-200">
      <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-200 flex-wrap">
        <Link href="/dashboard/master-data/materials" className="text-sm text-gray-500 hover:text-gray-800">← Materials</Link>
        <span className="text-sm font-medium text-gray-700">New materials</span>
        <span className="text-xs text-gray-400">IMM codes are given on save · empty rows are ignored</span>
        <div className="flex-1" />
        <div className="w-56">
          <SearchableSelect options={prefixOptions} value={defaultPrefix} onChange={applyPrefixToEmpty} placeholder="Prefix for all rows…" />
        </div>
        <button type="button" onClick={() => setShowPaste((v) => !v)} className="btn-secondary px-3 py-1.5">Paste from Excel</button>
      </div>

      {activePrefixes.length === 0 && (
        <p className="mx-3 mt-3 px-3 py-2 rounded text-sm border bg-amber-50 border-amber-200 text-amber-800">
          No active IMM code prefixes yet — add one in Administrator → Configuration → Material Codes first.
        </p>
      )}

      {showPaste && (
        <div className="mx-3 mt-3 rounded border border-gray-200 p-3 space-y-2">
          <p className="text-xs text-gray-600">
            Copy rows from Excel with these columns, in this order:{' '}
            <b>Drawing no. · Item name · Description · Technical specification · Material type · Material · Remarks</b>.
            Material type: Finished, Bought-out or Consumables. A drawing no. must be a BOM subassembly&apos;s (or left empty).
            The prefix chosen above is applied to every pasted row.
          </p>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} className="ams-input font-mono text-xs" placeholder="Paste here (Ctrl+V)…" />
          <div className="flex gap-2">
            <button type="button" onClick={applyPaste} className="btn-primary px-3 py-1.5">Add pasted rows</button>
            <button type="button" onClick={() => { setShowPaste(false); setPaste(''); }} className="btn-secondary px-3 py-1.5">Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="mx-3 mt-3 px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}

      <table className="w-full text-sm mt-2" style={{ minWidth: 1360 }}>
        <thead>
          <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <th className="px-2 py-2 font-medium w-8">#</th>
            <th className="px-2 py-2 font-medium w-52">IMM code prefix <span className="text-red-500">*</span></th>
            <th className="px-2 py-2 font-medium w-48">Drawing no.</th>
            <th className="px-2 py-2 font-medium w-48">Item name <span className="text-red-500">*</span></th>
            <th className="px-2 py-2 font-medium">Description <span className="text-red-500">*</span></th>
            <th className="px-2 py-2 font-medium">Technical specification <span className="text-red-500">*</span></th>
            <th className="px-2 py-2 font-medium w-36">Material type <span className="text-red-500">*</span></th>
            <th className="px-2 py-2 font-medium w-36">Material <span className="text-red-500">*</span></th>
            <th className="px-2 py-2 font-medium w-44">Remarks</th>
            <th className="px-2 py-2 w-16"><span className="sr-only">Row actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const bad = (f) => (missing(r, f) ? 'border-red-400 bg-red-50' : 'border-gray-300');
            return (
              <tr key={r.key} className="border-b border-gray-100 align-top">
                <td className="px-2 py-2 text-xs text-gray-400 tabular-nums pt-3">{i + 1}</td>
                <td className={`px-2 py-2 ${missing(r, 'prefix_id') ? 'rounded ring-1 ring-red-400' : ''}`}>
                  <SearchableSelect options={prefixOptions} value={r.prefix_id} onChange={(v) => set(r.key, 'prefix_id', v)} placeholder="Choose prefix…" />
                  {previews[i] && <p className="text-[11px] text-gray-500 mt-1 font-mono">→ {previews[i]}</p>}
                </td>
                <td className={`px-2 py-2 ${unknownDrawing(r) ? 'rounded ring-1 ring-red-400' : ''}`}>
                  <AsyncSearchSelect value={r.drawing_no} onChange={(v) => pickDrawing(r.key, v)} fetchPage={fetchDrawings}
                    getValue={(d) => d.drawing_no} describe={(d) => ({ label: d.drawing_no, sub: d.name })}
                    placeholder="None" searchPlaceholder="Search drawing no. or name…" invalid={unknownDrawing(r)} />
                  {unknownDrawing(r) && <p className="text-[11px] text-red-600 mt-1">{r.drawing_no} isn&apos;t in the BOM</p>}
                </td>
                <td className="px-2 py-2">
                  <input aria-label={`Row ${i + 1} item name`} value={r.item_name} onChange={(e) => set(r.key, 'item_name', e.target.value)} maxLength={191} className={`${cell} ${bad('item_name')}`} />
                </td>
                <td className="px-2 py-2">
                  <textarea aria-label={`Row ${i + 1} description`} value={r.description} onChange={(e) => set(r.key, 'description', e.target.value)} rows={2} className={`${cell} resize-y ${bad('description')}`} />
                </td>
                <td className="px-2 py-2">
                  <textarea aria-label={`Row ${i + 1} technical specification`} value={r.technical_spec} onChange={(e) => set(r.key, 'technical_spec', e.target.value)} rows={2} className={`${cell} resize-y ${bad('technical_spec')}`} />
                </td>
                <td className="px-2 py-2">
                  <select aria-label={`Row ${i + 1} material type`} value={r.material_type} onChange={(e) => set(r.key, 'material_type', e.target.value)} className={`${cell} ${bad('material_type')}`}>
                    <option value="">Select…</option>
                    {MATERIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input aria-label={`Row ${i + 1} material`} value={r.material} onChange={(e) => set(r.key, 'material', e.target.value)} maxLength={191} placeholder="e.g. MS, SS304" className={`${cell} ${bad('material')}`} />
                </td>
                <td className="px-2 py-2">
                  <input aria-label={`Row ${i + 1} remarks`} value={r.remarks} onChange={(e) => set(r.key, 'remarks', e.target.value)} placeholder="Optional" className={`${cell} border-gray-300`} />
                </td>
                <td className="px-2 py-2 whitespace-nowrap pt-2.5">
                  <button type="button" onClick={() => duplicate(r.key)} title="Duplicate row" aria-label={`Duplicate row ${i + 1}`}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">⧉</button>
                  <button type="button" onClick={() => removeRow(r.key)} title="Remove row" aria-label={`Remove row ${i + 1}`}
                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex items-center gap-2 px-3 py-3 flex-wrap">
        <button type="button" onClick={() => addRows(1)} className="btn-secondary px-3 py-1.5">+ Add row</button>
        <button type="button" onClick={() => addRows(5)} className="btn-secondary px-3 py-1.5">+ Add 5 rows</button>
        <div className="flex-1" />
        <span className="text-sm text-gray-500">{filled.length} material{filled.length === 1 ? '' : 's'} to add</span>
        <button type="button" onClick={save} disabled={saving || !filled.length} className="btn-primary px-5 py-2">
          {saving ? 'Saving…' : `Save ${filled.length || ''}`.trim()}
        </button>
      </div>
    </div>
  );
}
