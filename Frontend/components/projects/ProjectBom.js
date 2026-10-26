'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost, apiPut, apiDelete, downloadFile } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { MATERIAL_TYPE_LABEL } from '@/lib/materialOptions';

/**
 * A project's BOM (the BOM tab of a project).
 *
 * Revisions Rev 1, 2 …: a draft holds, per machine, the subassemblies (each
 * held at a released revision) and loose materials needed, with quantities
 * and the department each comes from. Locking it (BOM → Approve) explodes
 * every level into tag numbers — a frozen snapshot — and supersedes the BOM
 * locked before; a change means a new revision. Tags, material totals and
 * the revision history are shown for any revision; a locked one exports to
 * Excel.
 */

const SUBS = '/dashboard/master-data/subassemblies';
const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
const qtyFmt = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const STATUS = {
  DRAFT: { text: 'Draft', cls: 'bg-amber-50 text-amber-800' },
  RELEASED: { text: 'Locked', cls: 'bg-green-50 text-green-700' },
  SUPERSEDED: { text: 'Superseded', cls: 'bg-gray-100 text-gray-500' },
};

function StatusChip({ status }) {
  const s = STATUS[status];
  return s ? <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${s.cls}`}>{s.text}</span> : null;
}
function SubBadge() {
  return <span className="font-sans font-medium text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">Subassembly</span>;
}
function Empty({ children }) {
  return <p className="py-10 text-center text-sm text-gray-400">{children}</p>;
}

/** Search-as-you-type over materials and released subassemblies. */
function LinePicker({ excludeIds, onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  const exclude = [...excludeIds].join(',');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await apiGet(`/projects/bom-material-search?q=${encodeURIComponent(q)}&exclude=${exclude}`, { silent: true });
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

  const more = async () => {
    setBusy(true);
    try {
      const r = await apiGet(`/projects/bom-material-search?q=${encodeURIComponent(q)}&skip=${results.length}&exclude=${exclude}`, { silent: true });
      setResults((prev) => [...prev, ...(r.data.items || [])]); setHasMore(Boolean(r.data.has_more));
    } catch { /* keep what we have */ }
    finally { setBusy(false); }
  };

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor="bom-line-search" className="sr-only">Add a subassembly or material</label>
      <input id="bom-line-search" value={q} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        placeholder="Add a subassembly or material — search by IMM code, drawing no. or name…" className="ams-input" />
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {busy && results.length === 0 ? <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
            : results.length === 0 ? <p className="px-4 py-3 text-sm text-gray-400">{q ? 'Nothing matches' : 'Nothing more to add'}</p>
            : (
              <ul>
                {results.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => { onPick(m); setQ(''); setOpen(false); }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-gray-800">{m.imm_code}</span>
                        <span className="text-sm text-gray-800">{m.item_name}</span>
                        {m.subassembly && <SubBadge />}
                        {m.subassembly?.revisions?.[0] && <span className="text-[11px] text-gray-500">Rev {m.subassembly.revisions[0].rev}</span>}
                      </span>
                      <span className="block text-xs text-gray-500 mt-0.5">
                        {m.drawing_no ? `Drawing ${m.drawing_no} · ` : ''}{MATERIAL_TYPE_LABEL[m.material_type]} · {m.material} · {m.uom?.code}
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

/** Lock a draft: a change note (needed after the first lock). */
function LockModal({ draft, current, onClose, onLock }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (current && !note.trim()) { setError('Say what changed and why.'); return; }
    setBusy(true); setError('');
    try { await onLock(note.trim()); onClose(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={submit} className="w-full max-w-lg bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Lock BOM Rev {draft.rev}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <p className="text-sm text-gray-600">
            Every level is exploded into tag numbers and frozen — quantities, the subassembly revisions held and each
            material&apos;s details as they are now. Rev {draft.rev} becomes the project&apos;s BOM{current ? `; Rev ${current.rev} is superseded` : ''}.
            After this, changes need a new revision.
          </p>
          <div>
            <label className={label} htmlFor="lock-note">Change note{current && <span className="text-red-500"> *</span>}</label>
            <textarea id="lock-note" value={note} onChange={(e) => { setNote(e.target.value); setError(''); }} rows={4} maxLength={5000} autoFocus
              placeholder={current ? 'What changed and why — e.g. M2 coils to Rev B after design change' : 'Optional for the first lock'} className="ams-input resize-y" />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary flex-1 justify-center py-2">{busy ? 'Locking…' : `Lock Rev ${draft.rev}`}</button>
        </div>
      </form>
    </div>
  );
}

/** A revision's tags for one machine, indented by level. */
function Tags({ projectId, bomId, machineId, version }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  useEffect(() => {
    let cancelled = false;
    apiGet(`/projects/${projectId}/bom/${bomId}/tags?machine_id=${machineId}`, { silent: true })
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [projectId, bomId, machineId, version]);
  if (error) return <p className="px-4 py-6 text-sm text-red-600">{error}</p>;
  if (!data) return <TableSkeleton cols={5} rows={5} />;
  if (!data.items.length) return <Empty>No tags for this machine{data.preview ? ' yet — add lines, each with a department that has a number' : ''}.</Empty>;
  const f = filter.trim().toLowerCase();
  const items = f ? data.items.filter((i) => i.tag.toLowerCase().includes(f) || i.item_name.toLowerCase().includes(f)) : data.items;
  return (
    <div>
      <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap border-b border-gray-100">
        {data.preview && <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">Preview of the draft as last saved — tags are fixed when it is locked</span>}
        <span className="text-xs text-gray-500">{data.count} tag{data.count === 1 ? '' : 's'}</span>
        <div className="flex-1" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter tag or name…" aria-label="Filter tags"
          className="py-1 px-2 text-sm border border-gray-300 rounded outline-none w-56" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 900 }}>
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-2 font-normal">Tag</th>
              <th className="px-3 py-2 font-normal">Item name</th>
              <th className="px-3 py-2 font-normal">Rev</th>
              <th className="px-3 py-2 font-normal">Type</th>
              <th className="px-3 py-2 font-normal text-right">Qty per parent</th>
              <th className="px-3 py-2 font-normal text-right">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.tag} className="border-b border-gray-100">
                <td className="px-4 py-1.5 font-mono text-xs text-gray-800 whitespace-nowrap">
                  <span style={{ paddingLeft: (i.level - 1) * 16 }}>{i.tag}</span>
                </td>
                <td className="px-3 py-1.5 text-gray-700">{i.item_name}{i.is_subassembly && <span className="ml-2"><SubBadge /></span>}</td>
                <td className="px-3 py-1.5 text-gray-600">{i.rev ?? ''}</td>
                <td className="px-3 py-1.5 text-gray-500">{MATERIAL_TYPE_LABEL[i.material_type]}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{qtyFmt(i.qty_per_parent)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-800 whitespace-nowrap">{qtyFmt(i.quantity)} <span className="text-xs text-gray-500">{i.uom}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Material totals and subassemblies to build: per machine and for the project. */
function Totals({ projectId, bomId, version }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    apiGet(`/projects/${projectId}/bom/${bomId}/totals`, { silent: true })
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [projectId, bomId, version]);
  if (error) return <p className="px-4 py-6 text-sm text-red-600">{error}</p>;
  if (!data) return <TableSkeleton cols={5} rows={5} />;
  const table = (title, hint, rows) => (
    <div>
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      {rows.length === 0 ? <p className="text-sm text-gray-400">None.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 560 + data.machines.length * 90 }}>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-normal">IMM code</th>
                <th className="py-2 pr-3 font-normal">Item name</th>
                <th className="py-2 pr-3 font-normal">Type</th>
                {data.machines.map((m) => <th key={m.id} className="py-2 pr-3 font-normal text-right font-mono text-xs">{m.machine_no}</th>)}
                <th className="py-2 font-normal text-right">Project total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.material_id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 font-mono text-xs font-semibold text-gray-800">{t.imm_code}</td>
                  <td className="py-1.5 pr-3 text-gray-700">{t.item_name}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{MATERIAL_TYPE_LABEL[t.material_type]}</td>
                  {data.machines.map((m) => <td key={m.id} className="py-1.5 pr-3 text-right tabular-nums text-gray-600">{t.per_machine[m.id] ? qtyFmt(t.per_machine[m.id]) : '—'}</td>)}
                  <td className="py-1.5 text-right tabular-nums font-medium text-gray-800 whitespace-nowrap">{qtyFmt(t.quantity)} <span className="text-xs text-gray-500 font-normal">{t.uom}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
  return (
    <div className="px-4 py-4 space-y-6">
      {data.preview && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">Preview of the draft as last saved</p>}
      {table('Materials needed', 'Every plain material at the bottom of the structure, quantities multiplied through the levels — what procurement and stores work from.', data.materials)}
      {table('Subassemblies to build', 'How many of each subassembly, at every level.', data.subassemblies)}
    </div>
  );
}

const toLines = (bomLines) => bomLines.map((l) => ({
  machine_id: l.machine_id, material: l.material, quantity: String(Number(l.quantity)),
  department_id: l.department ? String(l.department.id) : '', child: l.child,
}));

/** @param {{ projectId: number|string, canEdit: boolean, canApprove: boolean }} props */
export default function ProjectBom({ projectId, canEdit, canApprove }) {
  const [overview, setOverview] = useState(null);
  const [bomId, setBomId] = useState(null);
  const [bom, setBom] = useState(null);
  const [lines, setLines] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [machineId, setMachineId] = useState(null);
  const [tab, setTab] = useState('lines');
  const [departments, setDepartments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [locking, setLocking] = useState(false);
  const [version, setVersion] = useState(0);

  const loadOverview = useCallback(async (preferBom) => {
    const o = (await apiGet(`/projects/${projectId}/bom`)).data;
    setOverview(o);
    setBomId(preferBom ?? o.draft?.id ?? o.current?.id ?? o.revisions[0]?.id ?? null);
    setMachineId((m) => m ?? o.machines[0]?.id ?? null);
    return o;
  }, [projectId]);

  useEffect(() => {
    loadOverview().catch((e) => setError(e.message));
    apiGet('/lookup/departments', { silent: true }).then((r) => setDepartments(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, [loadOverview]);

  useEffect(() => {
    if (!bomId) { setBom(null); setLines([]); return undefined; }
    let cancelled = false;
    apiGet(`/projects/${projectId}/bom/${bomId}`, { silent: true })
      .then((r) => { if (!cancelled) { setBom(r.data); setLines(toLines(r.data.lines)); setDirty(false); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [projectId, bomId, version]);

  const isDraft = bom?.status === 'DRAFT';
  const editable = isDraft && canEdit;
  const run = async (fn, ok) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); if (ok) setNotice(ok); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const touch = () => { setDirty(true); setError(''); setNotice(''); };
  const machineLines = lines.filter((l) => l.machine_id === machineId);
  const setLine = (mid, patch) => { setLines((prev) => prev.map((l) => (l.machine_id === machineId && l.material.id === mid ? { ...l, ...patch } : l))); touch(); };
  const addLine = (m) => {
    const current = m.subassembly?.revisions?.[0] ?? null;
    setLines((prev) => [...prev, {
      machine_id: machineId, material: m, quantity: '1', department_id: '',
      child: m.subassembly ? { subassembly_id: m.subassembly.id, held: current, current, newer: false } : null,
    }]);
    touch();
  };
  const removeLine = (mid) => { setLines((prev) => prev.filter((l) => !(l.machine_id === machineId && l.material.id === mid))); touch(); };
  const copyFrom = (fromId) => {
    const from = lines.filter((l) => l.machine_id === Number(fromId));
    const have = new Set(machineLines.map((l) => l.material.id));
    const add = from.filter((l) => !have.has(l.material.id)).map((l) => ({ ...l, machine_id: machineId }));
    if (!add.length) { setNotice('Nothing new to copy — this machine already has those lines.'); return; }
    setLines((prev) => [...prev, ...add]);
    touch();
    setNotice(`Copied ${add.length} line(s) — save the draft to keep them.`);
  };

  const body = () => ({
    lines: lines.map((l) => ({
      machine_id: l.machine_id, material_id: l.material.id, quantity: Number(l.quantity),
      department_id: l.department_id ? Number(l.department_id) : null,
      ...(l.child?.held ? { child_revision_id: l.child.held.id } : {}),
    })),
  });
  const qtyOk = () => {
    if (lines.some((l) => !(Number(l.quantity) > 0))) { setError('Every quantity must be more than 0.'); return false; }
    return true;
  };
  const saveDraft = async () => {
    const r = await apiPut(`/projects/${projectId}/bom/${bomId}`, body());
    setBom(r.data); setLines(toLines(r.data.lines)); setDirty(false); setVersion((v) => v + 1);
  };
  const start = () => run(async () => { const r = await apiPost(`/projects/${projectId}/bom`, {}); await loadOverview(r.data.id); setTab('lines'); },
    overview?.current ? 'New BOM revision started — change it, then lock it.' : 'BOM started — add each machine\'s lines, then lock it.');
  const discard = () => {
    if (!window.confirm(`Discard draft BOM Rev ${bom.rev}? Its changes are lost.`)) return;
    run(async () => { await apiDelete(`/projects/${projectId}/bom/${bomId}`); await loadOverview(overview.current?.id ?? null); }, 'Draft discarded.');
  };
  const openLock = () => { if (qtyOk()) run(async () => { if (dirty) await saveDraft(); setLocking(true); }); };
  const lock = async (note) => {
    await apiPost(`/projects/${projectId}/bom/${bomId}/lock`, { change_note: note || null });
    await loadOverview(bomId);
    setVersion((v) => v + 1);
    setNotice(`BOM Rev ${bom.rev} locked.`);
  };
  const exportXlsx = () => run(() => downloadFile(`/projects/${projectId}/bom/${bomId}/export`, `BOM-Rev${bom.rev}.xlsx`));
  const pickRev = (id) => { if (dirty && !window.confirm('Leave this draft without saving its changes?')) return; setBomId(id); };

  if (!overview) return error ? <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p> : <TableSkeleton cols={5} rows={5} />;

  const banner = (
    <>
      {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700 whitespace-pre-line">{error}</p>}
      {notice && <p className="px-3 py-2 rounded text-sm border bg-green-50 border-green-200 text-green-800">{notice}</p>}
    </>
  );

  if (!overview.revisions.length) {
    return (
      <div className="space-y-3">
        {banner}
        <div className="bg-white rounded border border-gray-200 px-4 py-10 text-center">
          <p className="text-sm text-gray-600">No BOM yet.</p>
          <p className="text-xs text-gray-500 mt-1 max-w-lg mx-auto">
            The BOM says, for each machine, which subassemblies and materials it needs. Locking it creates the tag numbers and the material totals.
          </p>
          {!overview.machines.length && <p className="text-xs text-amber-700 mt-2">Add the project&apos;s machines first (Overview tab).</p>}
          {canEdit && <button type="button" onClick={start} disabled={busy || !overview.machines.length} className="btn-primary px-4 py-2 mt-4 disabled:opacity-40">Start BOM</button>}
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'lines', label: 'Lines' },
    { key: 'tags', label: isDraft ? 'Tags (preview)' : 'Tags' },
    { key: 'totals', label: 'Totals' },
    { key: 'revisions', label: `Revisions (${overview.revisions.length})` },
  ];
  const countOf = (mid) => lines.filter((l) => l.machine_id === mid).length;
  const exclude = new Set(machineLines.map((l) => l.material.id));

  return (
    <div className="space-y-3">
      {banner}
      <div className="bg-white rounded border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 flex-wrap">
          <label htmlFor="bom-rev" className="text-sm text-gray-600">BOM</label>
          <select id="bom-rev" value={bomId ?? ''} onChange={(e) => pickRev(Number(e.target.value))}
            className="py-1.5 px-2 text-sm text-gray-800 border border-gray-300 rounded bg-white outline-none cursor-pointer">
            {overview.revisions.map((r) => <option key={r.id} value={r.id}>Rev {r.rev} · {STATUS[r.status].text}{r.status === 'RELEASED' ? ' (current)' : ''}</option>)}
          </select>
          {bom && <StatusChip status={bom.status} />}
          {bom && bom.status !== 'DRAFT' && <span className="text-xs text-gray-500">locked {when(bom.locked_at)}{bom.locked_by_name ? ` by ${bom.locked_by_name}` : ''} · {bom.tag_count} tags</span>}
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <div className="flex-1" />
          {canEdit && !overview.draft && overview.current && <button type="button" onClick={start} disabled={busy} className="btn-secondary px-3 py-1.5">New revision</button>}
          {editable && overview.current && <button type="button" onClick={discard} disabled={busy} className="btn-secondary px-3 py-1.5">Discard draft</button>}
          {editable && <button type="button" onClick={() => { if (qtyOk()) run(saveDraft, `Draft Rev ${bom.rev} saved.`); }} disabled={busy || !dirty} className="btn-secondary px-3 py-1.5 disabled:opacity-40">Save draft</button>}
          {isDraft && canApprove && <button type="button" onClick={openLock} disabled={busy} className="btn-primary px-4 py-1.5">Lock Rev {bom.rev}…</button>}
          {isDraft && !canApprove && <span className="text-xs text-gray-500">Locking needs BOM → Approve</span>}
          {bom && bom.status !== 'DRAFT' && <button type="button" onClick={exportXlsx} disabled={busy} className="btn-secondary px-3 py-1.5">Excel</button>}
        </div>
        {bom && bom.status !== 'DRAFT' && bom.change_note && (
          <p className="px-4 py-2 text-sm text-gray-700 bg-gray-50 border-b border-gray-200"><span className="text-gray-500">Change note:</span> {bom.change_note}</p>
        )}
        {isDraft && bom.problems.length > 0 && (
          <div className="px-4 py-2.5 border-b border-gray-200 bg-amber-50">
            <p className="text-xs font-medium text-amber-900">Before it can be locked (as last saved):</p>
            <ul className="list-disc pl-5 text-xs text-amber-900 mt-1 space-y-0.5">
              {bom.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}
              {bom.problems.length > 8 && <li>…and {bom.problems.length - 8} more</li>}
            </ul>
          </div>
        )}

        <div className="flex gap-1 px-4 border-b border-gray-200 overflow-x-auto" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2.5 text-sm -mb-px border-b-2 whitespace-nowrap cursor-pointer ${tab === t.key ? 'border-[var(--ams-primary)] text-gray-800 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {(tab === 'lines' || tab === 'tags') && (
          <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 mr-1">Machine</span>
            {overview.machines.map((m) => (
              <button key={m.id} type="button" onClick={() => setMachineId(m.id)}
                className={`px-2.5 py-1 rounded text-xs border cursor-pointer ${machineId === m.id ? 'border-[var(--ams-primary)] bg-[var(--ams-primary)] text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                <span className="font-mono font-semibold">{m.machine_no}</span>{m.name ? ` · ${m.name}` : ''} <span className="opacity-70">({countOf(m.id)})</span>
              </button>
            ))}
          </div>
        )}

        {!bom ? <TableSkeleton cols={5} rows={4} /> : (
          <>
            {tab === 'lines' && (
              <>
                {editable && (
                  <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[280px]"><LinePicker excludeIds={exclude} onPick={addLine} /></div>
                    {overview.machines.length > 1 && (
                      <select value="" onChange={(e) => { if (e.target.value) copyFrom(e.target.value); }} aria-label="Copy lines from another machine"
                        className="py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer">
                        <option value="">Copy lines from…</option>
                        {overview.machines.filter((m) => m.id !== machineId).map((m) => <option key={m.id} value={m.id}>{m.machine_no}{m.name ? ` · ${m.name}` : ''}</option>)}
                      </select>
                    )}
                  </div>
                )}
                {!isDraft && canEdit && !overview.draft && <p className="px-4 pt-3 text-xs text-gray-500">A locked BOM can&apos;t change. Use <b>New revision</b> to change it.</p>}
                {machineLines.length === 0 ? <Empty>No lines for this machine.{editable && ' Search above to add a subassembly or material.'}</Empty> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: 900 }}>
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-500">
                          <th className="px-4 py-2.5 font-normal">IMM code</th>
                          <th className="px-3 py-2.5 font-normal">Item name</th>
                          <th className="px-3 py-2.5 font-normal">Type</th>
                          <th className="px-3 py-2.5 font-normal w-40">Quantity</th>
                          <th className="px-3 py-2.5 font-normal w-56">Department</th>
                          {editable && <th className="px-3 py-2.5 w-10"><span className="sr-only">Remove</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {machineLines.map((l) => {
                          const m = l.material;
                          return (
                            <tr key={m.id} className="border-b border-gray-100">
                              <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-800 whitespace-nowrap">
                                {m.imm_code}
                                {l.child && (
                                  <span className="inline-flex items-center gap-1.5 ml-2 font-sans">
                                    <Link href={`${SUBS}/${l.child.subassembly_id}`} target="_blank" className="hover:opacity-80"><SubBadge /></Link>
                                    {l.child.held && <span className="text-[11px] text-gray-600">Rev {l.child.held.rev}</span>}
                                    {l.child.newer && (editable ? (
                                      <button type="button" onClick={() => setLine(m.id, { child: { ...l.child, held: l.child.current, newer: false } })}
                                        className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer">Use Rev {l.child.current.rev}</button>
                                    ) : <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">Rev {l.child.current.rev} available</span>)}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-800">{m.item_name}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{MATERIAL_TYPE_LABEL[m.material_type]}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {editable ? (
                                  <input type="number" min="0" step="any" inputMode="decimal" aria-label={`Quantity of ${m.imm_code}`} value={l.quantity}
                                    onChange={(e) => setLine(m.id, { quantity: e.target.value })}
                                    className={`w-28 text-sm text-right tabular-nums border rounded px-2 py-1 ${Number(l.quantity) > 0 ? 'border-gray-300' : 'border-red-400 bg-red-50'}`} />
                                ) : <span className="tabular-nums text-gray-800">{qtyFmt(l.quantity)}</span>}
                                {m.uom?.code && <span className="ml-1.5 text-xs text-gray-500">{m.uom.code}</span>}
                              </td>
                              <td className="px-3 py-2">
                                {editable ? (
                                  <select value={l.department_id} onChange={(e) => setLine(m.id, { department_id: e.target.value })} aria-label={`Department of ${m.imm_code}`}
                                    className={`w-full text-sm border rounded px-2 py-1 bg-white ${l.department_id || l.child ? 'border-gray-300' : 'border-amber-400'}`}>
                                    <option value="">{l.child ? 'Its subassembly’s department' : 'Choose…'}</option>
                                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}{d.dept_no != null ? ` (${d.dept_no})` : ' (no number)'}</option>)}
                                  </select>
                                ) : <span className="text-gray-700">{departments.find((d) => String(d.id) === l.department_id)?.name ?? '—'}</span>}
                              </td>
                              {editable && (
                                <td className="px-3 py-2 text-right">
                                  <button type="button" onClick={() => removeLine(m.id)} aria-label={`Remove ${m.imm_code}`}
                                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">✕</button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {tab === 'tags' && machineId && (
              <>
                {dirty && <p className="px-4 pt-3 text-xs text-amber-700">Save the draft to see your changes in the tags.</p>}
                <Tags projectId={projectId} bomId={bomId} machineId={machineId} version={version} />
              </>
            )}
            {tab === 'totals' && (
              <>
                {dirty && <p className="px-4 pt-3 text-xs text-amber-700">Save the draft to see your changes in the totals.</p>}
                <Totals projectId={projectId} bomId={bomId} version={version} />
              </>
            )}
            {tab === 'revisions' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 720 }}>
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-4 py-2.5 font-normal">Rev</th>
                      <th className="px-3 py-2.5 font-normal">Status</th>
                      <th className="px-3 py-2.5 font-normal">Change note</th>
                      <th className="px-3 py-2.5 font-normal">Locked</th>
                      <th className="px-3 py-2.5 font-normal text-right">Lines</th>
                      <th className="px-3 py-2.5 font-normal text-right">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.revisions.map((r) => (
                      <tr key={r.id} onClick={() => { pickRev(r.id); setTab('lines'); }}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${r.id === bomId ? 'bg-gray-50' : ''}`}>
                        <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{r.rev}</td>
                        <td className="px-3 py-2.5"><StatusChip status={r.status} /></td>
                        <td className="px-3 py-2.5 text-gray-700 max-w-md">{r.status === 'DRAFT' ? <span className="text-gray-400">being drafted{r.created_by_name ? ` by ${r.created_by_name}` : ''}</span> : r.change_note}</td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.locked_at ? `${when(r.locked_at)}${r.locked_by_name ? ` · ${r.locked_by_name}` : ''}` : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{r.line_count}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{r.status === 'DRAFT' ? '—' : r.tag_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {locking && bom && <LockModal draft={bom} current={overview.current} onClose={() => setLocking(false)} onLock={lock} />}
    </div>
  );
}
