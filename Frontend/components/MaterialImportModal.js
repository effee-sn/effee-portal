'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, apiPostForm, downloadFile } from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';
import { MATERIAL_TYPE_LABEL, formatImmCode, prefixForCode, fromImportRow, IMPORT_HANDOFF } from '@/lib/materialOptions';

/**
 * Materials → Import: the whole Excel import in one popup.
 *
 *   1. Download the example Excel (the template), fill it, choose it.
 *   2. Every row is checked here — required fields, prefix, unit, type, drawing
 *      no. and kept IMM code (used or repeated) — and shows Ready or what is
 *      wrong; look-alikes of existing materials are only warned about.
 *   3. Import saves the ready rows (rows with problems are left out and listed)
 *      and shows the IMM codes given. "Fix in the grid" opens New with every
 *      row instead, to correct them there.
 *
 * @param {object} props
 * @param {boolean} props.canKeepCodes  Super Admin / prefix editors: IMM codes in the file are kept
 * @param {() => void} props.onClose
 * @param {() => void} props.onImported  something was saved (refresh the list)
 */

const REQUIRED = [
  ['item_name', 'Item name'], ['description', 'Description'], ['technical_spec', 'Technical specification'],
  ['material_type', 'Material type'], ['material', 'Material'],
];
const up = (s) => String(s || '').trim().toUpperCase();
const low = (s) => String(s || '').trim().toLowerCase();

export default function MaterialImportModal({ canKeepCodes, onClose, onImported }) {
  const router = useRouter();
  const fileInput = useRef(null);
  const [prefixes, setPrefixes] = useState([]);
  const [units, setUnits] = useState([]);
  const [file, setFile] = useState(null); // { name, data } as read
  const [taken, setTaken] = useState({ drawings: new Map(), codes: new Map() });
  const [dupes, setDupes] = useState(new Map()); // row index → match
  const [defaultPrefix, setDefaultPrefix] = useState('');
  const [defaultUnit, setDefaultUnit] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [done, setDone] = useState(null); // { created, left }

  useEffect(() => {
    apiGet('/materials/prefixes').then((r) => setPrefixes(r.data || [])).catch((e) => setError(e.message));
    apiGet('/materials/units').then((r) => setUnits(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const activePrefixes = useMemo(() => prefixes.filter((p) => p.is_active), [prefixes]);
  const activeUnits = useMemo(() => units.filter((u) => u.is_active), [units]);
  const prefixOptions = useMemo(() => activePrefixes.map((p) => ({
    value: String(p.id), label: p.prefix, sub: `next ${p.preview}${p.description ? ` · ${p.description}` : ''}`,
  })), [activePrefixes]);

  /** The file's rows matched to prefixes, units and types (before the defaults chosen here). */
  const mapped = useMemo(() => (file?.data.rows || []).map((x) => ({
    excelRow: x.row, ...fromImportRow(x, { prefixes: activePrefixes, units, canKeepCodes }),
  })), [file, activePrefixes, units, canKeepCodes]);

  /** Each row as it would be saved, with what stops it. */
  const checked = useMemo(() => {
    const firstDrawing = new Map();
    const firstCode = new Map();
    return mapped.map(({ excelRow, row: r, notes }, i) => {
      const row = { ...r, prefix_id: r.prefix_id || (r.imm_code ? '' : defaultPrefix), uom_id: r.uom_id || defaultUnit };
      const issues = [...notes];
      REQUIRED.forEach(([f, label]) => { if (!String(row[f] || '').trim() && !notes.some((n) => n.startsWith(label.toLowerCase()))) issues.push(`${label} missing`); });
      if (!row.uom_id && !notes.some((n) => n.startsWith('unit'))) issues.push('Unit missing');
      if (row.imm_code) {
        const t = taken.codes.get(up(row.imm_code));
        if (!prefixForCode(row.imm_code, activePrefixes)) issues.push(`IMM code ${row.imm_code} matches no active prefix's format`);
        else if (t) issues.push(`IMM code ${row.imm_code} already used${t.deleted ? ' (deleted material)' : ` by ${t.item_name}`}`);
        else if (firstCode.has(up(row.imm_code))) issues.push(`IMM code repeated — same as Excel row ${firstCode.get(up(row.imm_code))}`);
        if (!firstCode.has(up(row.imm_code))) firstCode.set(up(row.imm_code), excelRow);
      } else if (!row.prefix_id && !notes.some((n) => n.startsWith('prefix'))) issues.push('Prefix missing — choose one above');
      if (row.drawing_no) {
        const t = taken.drawings.get(low(row.drawing_no));
        if (t) issues.push(`Drawing no. already used by ${t.imm_code}`);
        else if (firstDrawing.has(low(row.drawing_no))) issues.push(`Drawing no. repeated — same as Excel row ${firstDrawing.get(low(row.drawing_no))}`);
        if (!firstDrawing.has(low(row.drawing_no))) firstDrawing.set(low(row.drawing_no), excelRow);
      }
      return { excelRow, row, issues, dupe: dupes.get(i) };
    });
  }, [mapped, defaultPrefix, defaultUnit, taken, dupes, activePrefixes]);

  const ready = checked.filter((c) => !c.issues.length);
  const blocked = checked.length - ready.length;

  // The code each ready row will get — new numbers carry on after the highest kept code.
  const codes = useMemo(() => {
    const cursor = new Map(activePrefixes.map((p) => [String(p.id), p.next_number]));
    ready.forEach(({ row }) => {
      const hit = row.imm_code ? prefixForCode(row.imm_code, activePrefixes) : null;
      if (hit) cursor.set(String(hit.prefix.id), Math.max(cursor.get(String(hit.prefix.id)), hit.number + 1));
    });
    const byId = new Map(activePrefixes.map((p) => [String(p.id), p]));
    return new Map(ready.map(({ excelRow, row }) => {
      if (row.imm_code) return [excelRow, row.imm_code];
      const p = byId.get(row.prefix_id);
      if (!p) return [excelRow, ''];
      const n = cursor.get(row.prefix_id); cursor.set(row.prefix_id, n + 1);
      return [excelRow, formatImmCode(p, n)];
    }));
  }, [ready, activePrefixes]);

  const read = async (f) => {
    if (!f) return;
    setBusy('reading'); setError(''); setFile(null); setDupes(new Map());
    try {
      const fd = new FormData();
      fd.append('file', f);
      const { data } = await apiPostForm('/materials/import/read', fd);
      const nos = [...new Set(data.rows.map((x) => String(x.drawing_no || '').trim()).filter(Boolean))];
      const [drawings, look] = await Promise.all([
        nos.length ? apiGet(`/materials/drawing-check?nos=${encodeURIComponent(nos.join(','))}`, { silent: true }).catch(() => null) : null,
        apiPost('/materials/duplicates', { rows: data.rows.map((x) => ({ item_name: x.item_name || '', material: x.material || '', technical_spec: x.technical_spec || '' })) }, { silent: true }).catch(() => null),
      ]);
      setTaken({
        drawings: new Map((drawings?.data?.taken || []).map((t) => [low(t.drawing_no), t])),
        codes: new Map((data.taken_codes || []).map((t) => [up(t.imm_code), t])),
      });
      setDupes(new Map((look?.data?.matches || []).map((m) => [m.row, m])));
      setFile({ name: f.name, data });
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const save = async () => {
    setBusy('saving'); setError('');
    try {
      const res = await apiPost('/materials/bulk', { rows: ready.map(({ row }) => ({
        prefix_id: Number(row.prefix_id), uom_id: Number(row.uom_id), ...(row.imm_code ? { imm_code: row.imm_code } : {}),
        drawing_no: row.drawing_no, item_name: row.item_name, description: row.description, technical_spec: row.technical_spec,
        material_type: row.material_type, material: row.material, remarks: row.remarks,
      })) });
      setDone({ created: res.data, left: checked.filter((c) => c.issues.length) });
      onImported();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  /** Every row to the New page's grid, to fix there. */
  const toGrid = () => {
    try { sessionStorage.setItem(IMPORT_HANDOFF, JSON.stringify(file)); } catch { /* full or blocked */ }
    router.push('/dashboard/master-data/materials/new');
  };

  const template = () => downloadFile('/materials/import/template', 'materials-import-template.xlsx').catch((e) => setError(e.message));
  const selectCls = 'py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="mat-import-title">
      <div className={`w-full ${file || done ? 'max-w-6xl' : 'max-w-2xl'} bg-white rounded-lg shadow-xl flex flex-col max-h-[92vh]`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="mat-import-title" className="text-base font-semibold text-gray-800">
            Import materials from Excel{file && !done ? <span className="font-normal text-gray-500"> — {file.name}</span> : null}
          </h2>
          <button type="button" onClick={onClose} disabled={!!busy} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

          {done && (
            <>
              <div className="px-3 py-2.5 rounded bg-green-50 border border-green-200 text-green-800 text-sm">
                <b>{done.created.length}</b> material{done.created.length === 1 ? '' : 's'} added.
                {done.left.length > 0 && <> <b>{done.left.length}</b> row{done.left.length === 1 ? ' was' : 's were'} left out — listed below; fix them in the file and import those again.</>}
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2 font-medium w-44">IMM code</th><th className="px-2 py-2 font-medium">Item name</th><th className="px-2 py-2 font-medium">Drawing no.</th>
                </tr></thead>
                <tbody>
                  {done.created.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 font-mono font-semibold text-gray-800">{m.imm_code}</td>
                      <td className="px-2 py-1.5 text-gray-700">{m.item_name}</td>
                      <td className="px-2 py-1.5 text-gray-500 font-mono text-xs">{m.drawing_no || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {done.left.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Left out</p>
                  <ul className="text-sm space-y-1">
                    {done.left.map((c) => (
                      <li key={c.excelRow}><span className="text-gray-500">Excel row {c.excelRow}</span> · {c.row.item_name || '(no name)'} — <span className="text-red-600">{c.issues.join('; ')}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {!done && !file && (
            <>
              <div className="rounded border border-gray-200 bg-gray-50 p-4 flex items-start gap-4">
                <div className="flex-1 text-sm text-gray-600 space-y-1.5">
                  <p className="font-medium text-gray-800">1. Download the example Excel and fill it in</p>
                  <p>
                    One material per row, under the headings: <b>IMM code</b> (optional), <b>IMM code prefix</b>, Drawing no., <b>Item name</b>,
                    <b> Description</b>, <b>Technical specification</b>, <b>Material type</b> (Finished, Bought-out or Consumables), <b>Material</b>,
                    <b> Unit</b> (code or name) and Remarks. Bold ones are needed. The file&apos;s second sheet lists the prefixes and units you can use.
                  </p>
                  <p className="text-xs text-gray-500">
                    {canKeepCodes
                      ? 'IMM code: leave it empty for the next number, or write an existing code to keep it (the prefix then continues after the highest one kept).'
                      : 'IMM codes are given on import (codes written in the file are not kept).'}
                    {' '}At most 200 materials per file.
                  </p>
                </div>
                <button type="button" onClick={template} className="btn-secondary px-3 py-1.5 shrink-0">⬇ Example Excel</button>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-800 mb-2">2. Choose the filled file</p>
                <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
                <button type="button" onClick={() => fileInput.current?.click()} disabled={!!busy}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); read(e.dataTransfer.files?.[0]); }}
                  className={`w-full rounded border-2 border-dashed px-4 py-8 text-sm cursor-pointer transition-colors ${drag ? 'border-[var(--ams-primary)] bg-blue-50' : 'border-gray-300 hover:border-gray-400'} text-gray-600`}>
                  {busy === 'reading' ? 'Reading and checking…' : <>Drop the Excel file here, or <span className="text-[var(--ams-primary)] font-medium">choose a file</span> (.xlsx, .xls, .csv)</>}
                </button>
              </div>
            </>
          )}

          {!done && file && (
            <>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-gray-700"><b>{checked.length}</b> rows read ·</span>
                <span className="text-green-700"><b>{ready.length}</b> ready</span>
                {blocked > 0 && <span className="text-red-600">· <b>{blocked}</b> need fixing</span>}
                {dupes.size > 0 && <span className="text-amber-700">· <b>{dupes.size}</b> look like existing materials</span>}
                <div className="flex-1" />
                <div className="w-52">
                  <SearchableSelect options={prefixOptions} value={defaultPrefix} onChange={setDefaultPrefix} placeholder="Prefix for rows without one…" />
                </div>
                <select value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)} aria-label="Unit for rows without one" className={selectCls}>
                  <option value="">Unit for rows without one…</option>
                  {activeUnits.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                </select>
              </div>
              {file.data.skipped_columns?.length > 0 && (
                <p className="text-xs text-gray-500">Columns not used: {file.data.skipped_columns.join(', ')}.</p>
              )}
              {!canKeepCodes && file.data.rows.some((x) => x.imm_code) && (
                <p className="text-xs text-amber-700">The file has IMM codes; they are not kept — new codes are given (only a Super Admin or whoever edits the prefixes can keep codes).</p>
              )}

              <div className="border border-gray-200 rounded overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 960 }}>
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="px-2 py-2 font-medium w-14">Row</th>
                      <th className="px-2 py-2 font-medium w-40">IMM code</th>
                      <th className="px-2 py-2 font-medium w-32">Drawing no.</th>
                      <th className="px-2 py-2 font-medium">Item name</th>
                      <th className="px-2 py-2 font-medium w-28">Type</th>
                      <th className="px-2 py-2 font-medium w-28">Material</th>
                      <th className="px-2 py-2 font-medium w-16">Unit</th>
                      <th className="px-2 py-2 font-medium w-72">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checked.map((c) => (
                      <tr key={c.excelRow} className={`border-b border-gray-100 align-top ${c.issues.length ? 'bg-red-50/40' : ''}`}>
                        <td className="px-2 py-1.5 text-xs text-gray-400 tabular-nums">{c.excelRow}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">
                          {c.row.imm_code
                            ? <span className="font-semibold text-gray-800" title="Kept from the file">{c.row.imm_code}</span>
                            : <span className="text-gray-500">{codes.get(c.excelRow) ? `→ ${codes.get(c.excelRow)}` : '—'}</span>}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-xs text-gray-600">{c.row.drawing_no || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-800">{c.row.item_name || <span className="text-gray-400">—</span>}</td>
                        <td className="px-2 py-1.5 text-gray-600">{MATERIAL_TYPE_LABEL[c.row.material_type] || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-600">{c.row.material || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-600">{units.find((u) => String(u.id) === c.row.uom_id)?.code || '—'}</td>
                        <td className="px-2 py-1.5 text-xs">
                          {c.issues.length
                            ? <ul className="text-red-600 space-y-0.5">{c.issues.map((t) => <li key={t}>✕ {t}</li>)}</ul>
                            : <span className="text-green-700 font-medium">✓ Ready</span>}
                          {c.dupe && (
                            <p className="text-amber-700 mt-0.5">
                              ⚠ Looks like {c.dupe.kind === 'existing' ? c.dupe.imm_code : `Excel row ${checked[c.dupe.other_row]?.excelRow}`} — imported anyway
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-3 border-t border-gray-100 flex-wrap">
          {done ? (
            <>
              <div className="flex-1" />
              <button type="button" onClick={() => { setDone(null); setFile(null); }} className="btn-secondary px-4 py-2">Import another file</button>
              <button type="button" onClick={onClose} className="btn-primary px-4 py-2">Done</button>
            </>
          ) : file ? (
            <>
              <button type="button" onClick={() => setFile(null)} disabled={!!busy} className="btn-secondary px-3 py-1.5">Choose another file</button>
              <button type="button" onClick={toGrid} disabled={!!busy} className="btn-secondary px-3 py-1.5" title="Open every row in the New materials grid to correct them there">Fix in the grid</button>
              <div className="flex-1" />
              {blocked > 0 && ready.length > 0 && <span className="text-xs text-gray-500">{blocked} row{blocked === 1 ? '' : 's'} with problems will be left out</span>}
              <button type="button" onClick={save} disabled={!!busy || !ready.length} className="btn-primary px-4 py-2">
                {busy === 'saving' ? 'Importing…' : `Import ${ready.length} material${ready.length === 1 ? '' : 's'}`}
              </button>
            </>
          ) : (
            <>
              <div className="flex-1" />
              <button type="button" onClick={onClose} className="btn-secondary px-4 py-2">Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
