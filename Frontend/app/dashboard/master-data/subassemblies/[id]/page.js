'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import useNav from '@/lib/useNav';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { SideCard, SideRow, KeyFacts, TabBar } from '@/components/DetailSide';
import AsyncSearchSelect from '@/components/AsyncSearchSelect';
import { MATERIAL_TYPE_LABEL, formatImmCode, revName } from '@/lib/materialOptions';

/**
 * Master Data → Subassemblies → one subassembly (new, copied or existing).
 *
 * Its details — name, drawing no., its own IMM code — and its revisions. The
 * lines live on a revision: only a draft changes; releasing it (Subassemblies
 * → Approve, with a change note) makes it the current revision. A child
 * subassembly on a line is held at a revision until a new draft moves it on.
 * Tabs show the lines, the whole structure with rolled-up totals, a
 * comparison of any two revisions, the revision history and where it is used.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
const SUBS = '/dashboard/master-data/subassemblies';
const qtyFmt = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const STATUS = {
  DRAFT: { text: 'Draft', cls: 'bg-amber-50 text-amber-800' },
  RELEASED: { text: 'Released', cls: 'bg-green-50 text-green-700' },
  SUPERSEDED: { text: 'Superseded', cls: 'bg-gray-100 text-gray-500' },
};

function SubBadge() {
  return <span className="font-sans font-medium text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">Subassembly</span>;
}
function StatusChip({ status }) {
  const s = STATUS[status];
  return s ? <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${s.cls}`}>{s.text}</span> : null;
}
function Empty({ children }) {
  return <p className="py-10 text-center text-sm text-gray-400">{children}</p>;
}

/** Search-as-you-type picker over the material master (released subassemblies included). */
function LinePicker({ excludeIds, onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  // Lines already added (and the subassembly's own item) are left out by the server.
  const exclude = [...excludeIds].join(',');
  const url = (skip) => `/subassemblies/material-search?q=${encodeURIComponent(q)}&skip=${skip}&exclude=${exclude}`;

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await apiGet(`/subassemblies/material-search?q=${encodeURIComponent(q)}&exclude=${exclude}`, { silent: true });
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
      const r = await apiGet(url(results.length), { silent: true });
      setResults((prev) => [...prev, ...(r.data.items || [])]); setHasMore(Boolean(r.data.has_more));
    } catch { /* keep what we have */ }
    finally { setBusy(false); }
  };

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor="line-search" className="sr-only">Add a material or subassembly</label>
      <input id="line-search" value={q} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        placeholder="Add a material or subassembly — search by IMM code, drawing no. or name…" className="ams-input" />
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {busy && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">{q ? 'Nothing matches' : 'Nothing more to add'}</p>
          ) : (
            <ul>
              {results.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => { onPick(m); setQ(''); setOpen(false); }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-gray-800">{m.imm_code}</span>
                      <span className="text-sm text-gray-800">{m.item_name}</span>
                      {m.subassembly && <SubBadge />}
                      {m.subassembly?.revisions?.[0] && <span className="text-[11px] text-gray-500">{revName(m.subassembly.revisions[0].rev)}</span>}
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

/** How a subassembly without an item gets its IMM code: a new one, or an existing Finished material. */
function ItemChooser({ item, setItem, setup }) {
  const prefix = setup?.prefixes.find((p) => String(p.id) === item.prefix_id);
  const fetchOptions = (q, skip) => apiGet(`/subassemblies/item-options?q=${encodeURIComponent(q)}&skip=${skip}`, { silent: true }).then((r) => r.data);
  return (
    <div className="sm:col-span-2 rounded-md border border-gray-200 px-3 py-3 space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <span className={`${label} mb-0`}>IMM code<span className="text-red-500"> *</span></span>
        <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
          <input type="radio" name="item-mode" checked={item.mode === 'new'} onChange={() => setItem({ ...item, mode: 'new' })} /> Give it a new code
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
          <input type="radio" name="item-mode" checked={item.mode === 'existing'} onChange={() => setItem({ ...item, mode: 'existing' })} /> Use an existing Finished material
        </label>
      </div>
      {item.mode === 'new' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={label} htmlFor="it-prefix">Prefix</label>
            <select id="it-prefix" value={item.prefix_id} onChange={(e) => setItem({ ...item, prefix_id: e.target.value })} required className="ams-input">
              <option value="">Choose…</option>
              {(setup?.prefixes || []).map((p) => <option key={p.id} value={p.id}>{p.prefix}{p.description ? ` — ${p.description}` : ''}</option>)}
            </select>
            {prefix && <p className="text-[11px] text-gray-500 mt-1 font-mono">→ {formatImmCode(prefix, prefix.next_number)} (given on save)</p>}
          </div>
          <div>
            <label className={label} htmlFor="it-uom">Unit</label>
            <select id="it-uom" value={item.uom_id} onChange={(e) => setItem({ ...item, uom_id: e.target.value })} required className="ams-input">
              <option value="">Choose…</option>
              {(setup?.units || []).map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="it-desc">Description <span className="normal-case font-normal text-gray-400">(optional)</span></label>
            <input id="it-desc" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} maxLength={500}
              placeholder="Defaults to the name" className="ams-input" />
          </div>
        </div>
      ) : (
        <div className="max-w-md">
          <AsyncSearchSelect value={item.material_id} display={item.material_label} fetchPage={fetchOptions}
            onChange={(v, m) => setItem({ ...item, material_id: v, material_label: m ? `${m.imm_code} — ${m.item_name}` : '' })}
            getValue={(m) => String(m.id)} describe={(m) => ({ label: m.imm_code, sub: m.item_name })}
            placeholder="Choose a Finished material…" searchPlaceholder="Search IMM code or name…" />
          <p className="text-[11px] text-gray-500 mt-1">Its name and drawing no. will follow this subassembly.</p>
        </div>
      )}
    </div>
  );
}

/** A line's child subassembly: the revision held, and a newer one (with "use it" while drafting). */
function ChildRev({ child, editable, onUseCurrent }) {
  if (!child) return null;
  return (
    <span className="inline-flex items-center gap-1.5 ml-2 font-sans">
      <Link href={`${SUBS}/${child.subassembly_id}`} target="_blank" className="hover:opacity-80" title="Open this subassembly"><SubBadge /></Link>
      {child.held && <span className="text-[11px] text-gray-600">{revName(child.held.rev)}</span>}
      {child.newer && (
        editable ? (
          <button type="button" onClick={onUseCurrent} className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer"
            title="Hold this line at the child's current revision">Use {revName(child.current.rev)}</button>
        ) : (
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800" title="A newer revision of this subassembly is released">{revName(child.current.rev)} available</span>
        )
      )}
    </span>
  );
}

/** A line's Finished part: the drawing revision held, and a newer one (with "use it" while drafting). */
function PartRev({ part, editable, onUseCurrent }) {
  if (!part?.held) return null;
  return (
    <span className="inline-flex items-center gap-1.5 ml-2 font-sans">
      <span className="text-[11px] text-gray-600" title="The drawing revision of this part used here">{revName(part.held.rev)}</span>
      {part.newer && (
        editable ? (
          <button type="button" onClick={onUseCurrent} className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer"
            title="Hold this line at the part's current drawing revision">Use {revName(part.current.rev)}</button>
        ) : (
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800" title="A newer drawing revision of this part is released">{revName(part.current.rev)} available</span>
        )
      )}
    </span>
  );
}

/** The lines of a revision: editable while it is a draft. */
function LinesTable({ lines, editable, exclude, onAdd, onQty, onRemove, onUseCurrent }) {
  const qtyBad = (v) => !(Number(v) > 0);
  return (
    <>
      {editable && (
        <div className="px-4 py-3 border-b border-gray-200">
          <LinePicker excludeIds={exclude} onPick={onAdd} />
        </div>
      )}
      {lines.length === 0 ? (
        <Empty>No lines yet.{editable && ' Search above and pick a material or a released subassembly to add it.'}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 820 }}>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2.5 font-normal w-8">#</th>
                <th className="px-3 py-2.5 font-normal">IMM code</th>
                <th className="px-3 py-2.5 font-normal">Item name</th>
                <th className="px-3 py-2.5 font-normal">Drawing no.</th>
                <th className="px-3 py-2.5 font-normal">Type · Material</th>
                <th className="px-3 py-2.5 font-normal w-40">Quantity</th>
                {editable && <th className="px-3 py-2.5 w-10"><span className="sr-only">Remove</span></th>}
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
                      <ChildRev child={l.child} editable={editable} onUseCurrent={() => onUseCurrent(m.id)} />
                      <PartRev part={l.part} editable={editable} onUseCurrent={() => onUseCurrent(m.id)} />
                      {flag && <span className="ml-2 font-sans font-medium text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{flag}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-800">{m.item_name}</td>
                    <td className="px-3 py-2 text-gray-600">{m.drawing_no || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{MATERIAL_TYPE_LABEL[m.material_type]} · {m.material}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {editable ? (
                        <input type="number" min="0" step="any" inputMode="decimal" aria-label={`Quantity of ${m.imm_code}`}
                          value={l.quantity} onChange={(e) => onQty(m.id, e.target.value)}
                          className={`w-28 text-sm text-right tabular-nums border rounded px-2 py-1 ${qtyBad(l.quantity) ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                      ) : <span className="tabular-nums text-gray-800">{qtyFmt(l.quantity)}</span>}
                      {m.uom?.code && <span className="ml-1.5 text-xs text-gray-500">{m.uom.code}</span>}
                    </td>
                    {editable && (
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => onRemove(m.id)} aria-label={`Remove ${m.imm_code}`}
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
  );
}

/** One row of the structure, and its children when expanded. */
function TreeRow({ node, depth, open, toggle, path }) {
  const key = `${path}/${node.material.id}`;
  const hasKids = node.children.length > 0;
  const isOpen = open.has(key);
  return (
    <>
      <tr className="border-b border-gray-100">
        <td className="py-1.5 pr-3">
          <span className="flex items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
            {hasKids ? (
              <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} aria-label={isOpen ? 'Collapse' : 'Expand'}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 cursor-pointer">{isOpen ? '▾' : '▸'}</button>
            ) : <span className="w-5" />}
            <span className="font-mono text-xs font-semibold text-gray-800">{node.material.imm_code}</span>
            {node.subassembly_id && (
              <Link href={`${SUBS}/${node.subassembly_id}`} className="hover:opacity-80"><SubBadge /></Link>
            )}
            {node.revision && <span className="text-[11px] text-gray-500">{revName(node.revision.rev)}</span>}
            {node.part_revision && <span className="text-[11px] text-gray-500">{revName(node.part_revision.rev)}</span>}
          </span>
        </td>
        <td className="py-1.5 pr-3 text-gray-700">{node.material.item_name}</td>
        <td className="py-1.5 pr-3 text-gray-500 text-xs">{node.material.drawing_no || '—'}</td>
        <td className="py-1.5 text-right tabular-nums text-gray-700 whitespace-nowrap">{qtyFmt(node.quantity)} <span className="text-xs text-gray-500">{node.material.uom?.code}</span></td>
      </tr>
      {isOpen && node.children.map((c) => <TreeRow key={c.material.id} node={c} depth={depth + 1} open={open} toggle={toggle} path={key} />)}
    </>
  );
}

function Structure({ id, revId }) {
  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    apiGet(`/subassemblies/${id}/tree?rev=${revId}`, { silent: true })
      .then((r) => { if (!cancelled) setTree(r.data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [id, revId]);

  if (error) return <p className="px-4 py-6 text-sm text-red-600">{error}</p>;
  if (!tree) return <TableSkeleton cols={4} rows={4} />;
  if (!tree.children.length) return <Empty>No lines in this revision.</Empty>;

  const all = new Set();
  const collect = (nodes, path) => nodes.forEach((n) => { const k = `${path}/${n.material.id}`; if (n.children.length) { all.add(k); collect(n.children, k); } });
  collect(tree.children, '');
  const toggle = (k) => setOpen((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="space-y-6 px-4 py-4">
      <div>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-800">Structure of {revName(tree.revision.rev)} <span className="font-normal text-gray-400">· {tree.levels} level{tree.levels === 1 ? '' : 's'}</span></h3>
          <button type="button" onClick={() => setOpen(new Set(all))} className="text-xs text-[var(--ams-primary)] hover:underline cursor-pointer">Expand all</button>
          <button type="button" onClick={() => setOpen(new Set())} className="text-xs text-[var(--ams-primary)] hover:underline cursor-pointer">Collapse all</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-normal">IMM code</th>
                <th className="py-2 pr-3 font-normal">Item name</th>
                <th className="py-2 pr-3 font-normal">Drawing no.</th>
                <th className="py-2 font-normal text-right">Qty per parent</th>
              </tr>
            </thead>
            <tbody>
              {tree.children.map((n) => <TreeRow key={n.material.id} node={n} depth={0} open={open} toggle={toggle} path="" />)}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Materials needed for 1 × {tree.drawing_no} ({revName(tree.revision.rev)})</h3>
        <p className="text-xs text-gray-500 mb-2">Every plain material at the bottom of the structure, with quantities multiplied through the levels above it.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 560 }}>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-normal">IMM code</th>
                <th className="py-2 pr-3 font-normal">Item name</th>
                <th className="py-2 pr-3 font-normal">Type</th>
                <th className="py-2 font-normal text-right">Total qty</th>
              </tr>
            </thead>
            <tbody>
              {tree.totals.map((t) => (
                <tr key={t.material.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 font-mono text-xs font-semibold text-gray-800">
                    {t.material.imm_code}
                    {t.unbuilt && <span className="ml-2 font-sans font-medium text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700" title="A subassembly with no lines in the revision held">No lines</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-700">{t.material.item_name}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{MATERIAL_TYPE_LABEL[t.material.material_type]}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-800 font-medium whitespace-nowrap">{qtyFmt(t.quantity)} <span className="text-xs text-gray-500 font-normal">{t.material.uom?.code}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** What changed between two revisions. */
function Compare({ id, revisions, initialFrom, initialTo }) {
  const [from, setFrom] = useState(initialFrom ? String(initialFrom) : '');
  const [to, setTo] = useState(initialTo ? String(initialTo) : '');
  const [diff, setDiff] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!from || !to || from === to) return undefined;
    let cancelled = false;
    apiGet(`/subassemblies/${id}/compare?from=${from}&to=${to}`, { silent: true })
      .then((r) => { if (!cancelled) { setDiff(r.data); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [id, from, to]);

  if (revisions.length < 2) return <Empty>Only one revision so far — nothing to compare yet.</Empty>;
  const sel = 'py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer';
  const opts = revisions.map((r) => <option key={r.id} value={r.id}>{revName(r.rev)} · {STATUS[r.status].text}</option>);
  const name = (x) => <><span className="font-mono text-xs font-semibold text-gray-800">{x.material.imm_code}</span> <span className="text-gray-700">{x.material.item_name}</span></>;
  const unit = (x) => <span className="text-xs text-gray-500">{x.material.uom?.code}</span>;

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600">
        Compare <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From revision" className={sel}>{opts}</select>
        with <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="To revision" className={sel}>{opts}</select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {from === to ? <p className="text-sm text-gray-400">Pick two different revisions.</p> : !diff ? <TableSkeleton cols={3} rows={3} /> : (
        <>
          {diff.to.change_note && diff.to.status !== 'DRAFT' && (
            <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2"><span className="text-gray-500">{revName(diff.to.rev)} change note:</span> {diff.to.change_note}</p>
          )}
          {!diff.added.length && !diff.removed.length && !diff.changed.length ? (
            <p className="text-sm text-gray-500">No differences in the lines.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {diff.added.map((x) => (
                <li key={`a${x.material.id}`} className="flex items-center gap-2 flex-wrap">
                  <span className="w-20 shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-center">Added</span>
                  {name(x)} <span className="tabular-nums">× {qtyFmt(x.quantity)}</span> {unit(x)}{x.held && <span className="text-[11px] text-gray-500">({revName(x.held.rev)})</span>}
                </li>
              ))}
              {diff.removed.map((x) => (
                <li key={`r${x.material.id}`} className="flex items-center gap-2 flex-wrap">
                  <span className="w-20 shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-center">Removed</span>
                  {name(x)} <span className="tabular-nums line-through text-gray-400">× {qtyFmt(x.quantity)}</span> {unit(x)}
                </li>
              ))}
              {diff.changed.map((x) => (
                <li key={`c${x.material.id}`} className="flex items-center gap-2 flex-wrap">
                  <span className="w-20 shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-center">Changed</span>
                  {name(x)}
                  {x.quantity && <span className="tabular-nums">qty <span className="line-through text-gray-400">{qtyFmt(x.quantity.from)}</span> → {qtyFmt(x.quantity.to)} {unit(x)}</span>}
                  {x.held && <span className="text-gray-600">held at <span className="line-through text-gray-400">{x.held.from ? revName(x.held.from.rev) : '—'}</span> → {x.held.to ? revName(x.held.to.rev) : '—'}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Release a draft: a change note (needed after the first revision). */
function ReleaseModal({ sub, draft, onClose, onRelease }) {
  const first = !sub.current;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!first && !note.trim()) { setError('Say what changed and why.'); return; }
    setBusy(true); setError('');
    try { await onRelease(note.trim()); onClose(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={submit} className="w-full max-w-lg bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Release {revName(draft.rev)}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <p className="text-sm text-gray-600">
            {revName(draft.rev)} becomes the current revision of {sub.drawing_no} and is locked{sub.current ? `; ${revName(sub.current.rev)} is superseded` : ''}.
            Subassemblies that use {sub.drawing_no} keep their revision until they are updated.
          </p>
          <div>
            <label className={label} htmlFor="rel-note">Change note{!first && <span className="text-red-500"> *</span>}</label>
            <textarea id="rel-note" value={note} onChange={(e) => { setNote(e.target.value); setError(''); }} rows={4} maxLength={5000} autoFocus
              placeholder={first ? 'Optional for the first release' : 'What changed and why — e.g. bracket thickness 8 → 10 mm after site feedback'} className="ams-input resize-y" />
          </div>
          <p className="text-xs text-gray-500">If the part is no longer interchangeable with the earlier one, it should be a new subassembly (a new drawing and IMM code) instead.</p>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary flex-1 justify-center py-2">{busy ? 'Releasing…' : `Release ${revName(draft.rev)}`}</button>
        </div>
      </form>
    </div>
  );
}

const toLines = (items) => items.map((i) => ({ material: i.material, quantity: String(Number(i.quantity)), child: i.child, part: i.part }));
/** A picked material as a line: a child subassembly (or a Finished part) is held at its current revision. */
const pickedLine = (m) => {
  const current = m.subassembly?.revisions?.[0] ?? null;
  const partCurrent = !m.subassembly && m.material_type === 'FINISHED' ? m.revisions?.find((r) => r.status === 'RELEASED') ?? null : null;
  return {
    material: m, quantity: '1',
    child: m.subassembly ? { subassembly_id: m.subassembly.id, held: current, current, newer: false } : null,
    part: partCurrent ? { held: partCurrent, current: partCurrent, newer: false } : null,
  };
};
const lineBody = (lines) => lines.map((l) => ({
  material_id: l.material.id, quantity: Number(l.quantity),
  ...(l.child?.held ? { child_revision_id: l.child.held.id } : {}),
  ...(l.part?.held ? { part_revision_id: l.part.held.id } : {}),
}));

function SubassemblyEditor() {
  useAuth();
  const nav = useNav();
  const { id } = useParams();
  const params = useSearchParams();
  const isNew = id === 'new';
  const copyFrom = isNew ? params.get('copy') : null;
  const { me, can, loading: permLoading } = usePermissions();
  const has = (code) => me?.is_system || can(code);
  const canCreate = has('SUBASSEMBLY_CREATE');
  const canEdit = has('SUBASSEMBLY_EDIT');
  const canApprove = has('SUBASSEMBLY_APPROVE');

  const [sub, setSub] = useState(null);
  const [form, setForm] = useState({ name: '', drawing_no: '', department_id: '' });
  const [departments, setDepartments] = useState([]);
  const [item, setItem] = useState({ mode: 'new', prefix_id: '', uom_id: '', description: '', material_id: '', material_label: '' });
  const [setup, setSetup] = useState(null);
  const [revId, setRevId] = useState(null); // the revision on screen
  const [revision, setRevision] = useState(null);
  const [lines, setLines] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(isNew && !copyFrom);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('lines');
  const [releasing, setReleasing] = useState(false);

  const showSub = useCallback((s, preferRev) => {
    setSub(s);
    setForm({ name: s.name, drawing_no: s.drawing_no, department_id: s.department ? String(s.department.id) : '' });
    setRevId(preferRev ?? s.draft?.id ?? s.current?.id ?? s.revisions[0]?.id ?? null);
  }, []);

  // A saved one, or the one being copied.
  useEffect(() => {
    if (permLoading || (isNew && !copyFrom)) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const s = (await apiGet(`/subassemblies/${isNew ? copyFrom : id}`)).data;
        if (cancelled) return;
        if (isNew) {
          const from = s.current ?? s.draft;
          const r = from ? (await apiGet(`/subassemblies/${s.id}/revisions/${from.id}`)).data : null;
          if (cancelled) return;
          setForm({ name: `${s.name} (copy)`, drawing_no: '', department_id: s.department ? String(s.department.id) : '' });
          setLines(r ? toLines(r.items) : []);
        } else showSub(s);
        setLoaded(true);
      } catch { if (!cancelled) { setNotFound(true); setLoaded(true); } }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, copyFrom, permLoading, showSub]);

  // Departments, for "the department it comes from".
  useEffect(() => {
    let cancelled = false;
    apiGet('/lookup/departments', { silent: true }).then((r) => { if (!cancelled) setDepartments(Array.isArray(r) ? r : r?.data || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // The revision on screen.
  useEffect(() => {
    if (isNew || !revId) return undefined;
    let cancelled = false;
    apiGet(`/subassemblies/${id}/revisions/${revId}`, { silent: true })
      .then((r) => { if (!cancelled) { setRevision(r.data); setLines(toLines(r.data.items)); setDirty(false); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [id, isNew, revId]);

  // Prefixes and units, while it needs an item (new, or one made before items existed).
  const needsItem = loaded && !notFound && (isNew ? canCreate : canEdit && sub && !sub.material);
  useEffect(() => {
    if (!needsItem || setup) return undefined;
    let cancelled = false;
    apiGet('/subassemblies/item-setup', { silent: true }).then((r) => {
      if (cancelled) return;
      setSetup(r.data);
      const nos = r.data.units.find((u) => u.code === 'Nos');
      setItem((it) => ({ ...it, uom_id: it.uom_id || (nos ? String(nos.id) : '') }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [needsItem, setup]);

  const isDraft = revision?.status === 'DRAFT';
  const editable = isNew ? canCreate : isDraft && canEdit;
  const touch = () => { setDirty(true); setError(''); setNotice(''); };
  const addLine = (m) => { setLines((prev) => [...prev, pickedLine(m)]); touch(); };
  const setQty = (mid, v) => { setLines((prev) => prev.map((l) => (l.material.id === mid ? { ...l, quantity: v } : l))); touch(); };
  const removeLine = (mid) => { setLines((prev) => prev.filter((l) => l.material.id !== mid)); touch(); };
  const useCurrent = (mid) => {
    setLines((prev) => prev.map((l) => {
      if (l.material.id !== mid) return l;
      if (l.child) return { ...l, child: { ...l.child, held: l.child.current, newer: false } };
      if (l.part) return { ...l, part: { ...l.part, held: l.part.current, newer: false } };
      return l;
    }));
    touch();
  };
  const linesOk = () => {
    if (lines.some((l) => !(Number(l.quantity) > 0))) { setError('Every quantity must be more than 0.'); return false; }
    return true;
  };
  const itemBody = () => (item.mode === 'existing'
    ? { mode: 'existing', material_id: Number(item.material_id) }
    : { mode: 'new', prefix_id: Number(item.prefix_id), uom_id: Number(item.uom_id), description: item.description || null });
  const run = async (fn, okMsg) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); if (okMsg) setNotice(okMsg); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const reload = async (preferRev) => showSub((await apiGet(`/subassemblies/${id}`)).data, preferRev);

  const create = (e) => {
    e.preventDefault();
    if (!linesOk()) return;
    if (item.mode === 'existing' && !item.material_id) { setError('Choose the Finished material to use as its IMM code.'); return; }
    run(async () => {
      const r = await apiPost('/subassemblies', { ...form, department_id: form.department_id ? Number(form.department_id) : null, items: lineBody(lines), item: itemBody() });
      nav(`${SUBS}/${r.data.id}`);
    });
  };
  const saveDetails = (e) => {
    e.preventDefault();
    if (!sub.material && item.mode === 'existing' && !item.material_id) { setError('Choose the Finished material to use as its IMM code.'); return; }
    run(async () => {
      const r = await apiPut(`/subassemblies/${id}`, { ...form, department_id: form.department_id ? Number(form.department_id) : null, ...(!sub.material ? { item: itemBody() } : {}) });
      showSub(r.data, revId);
    }, 'Details saved.');
  };
  const saveDraft = async () => {
    const r = await apiPut(`/subassemblies/${id}/revisions/${revId}`, { items: lineBody(lines) });
    setRevision(r.data); setLines(toLines(r.data.items)); setDirty(false);
  };
  const onSaveDraft = () => { if (linesOk()) run(saveDraft, `${revName(revision.rev)} saved.`); };
  const startRevision = () => run(async () => {
    const r = await apiPost(`/subassemblies/${id}/revisions`, {});
    await reload(r.data.id);
    setTab('lines');
  }, 'New revision started — change its lines, then release it.');
  const discard = () => {
    if (!window.confirm(`Discard draft ${revName(revision.rev)}? Its changes are lost.`)) return;
    run(async () => { await apiDelete(`/subassemblies/${id}/revisions/${revId}`); await reload(sub.current?.id); }, 'Draft discarded.');
  };
  const openRelease = () => {
    if (!linesOk()) return;
    run(async () => { if (dirty) await saveDraft(); setReleasing(true); });
  };
  const release = async (note) => {
    const r = await apiPost(`/subassemblies/${id}/revisions/${revId}/release`, { change_note: note || null });
    showSub(r.data, revId);
    // Same revision on screen, now released: load it again.
    const rv = (await apiGet(`/subassemblies/${id}/revisions/${revId}`)).data;
    setRevision(rv); setLines(toLines(rv.items)); setDirty(false);
    setNotice(`${revName(rv.rev)} released.`);
  };
  const remove = () => {
    if (!window.confirm(`Delete subassembly ${form.name} (${form.drawing_no})${sub.material ? ` and its item ${sub.material.imm_code}` : ''}?`)) return;
    run(async () => { await apiDelete(`/subassemblies/${id}`); nav(SUBS); });
  };

  if (permLoading || !loaded) return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={5} rows={5} /></div>;
  if (!has('SUBASSEMBLY_VIEW') || notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">{notFound ? 'Subassembly not found' : 'Access Denied'}</p>
        <Link href={SUBS} className="text-sm text-[var(--ams-primary)] hover:underline mt-1">Back to subassemblies</Link>
      </div>
    );
  }

  const exclude = new Set(lines.map((l) => l.material.id));
  if (sub?.material) exclude.add(sub.material.id);
  const banner = (
    <>
      {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
      {notice && <p className="px-3 py-2 rounded text-sm border bg-green-50 border-green-200 text-green-800">{notice}</p>}
    </>
  );
  const detailFields = (disabled) => (
    <>
      <div>
        <label className={label} htmlFor="sa-name">Subassembly name<span className="text-red-500"> *</span></label>
        <input id="sa-name" value={form.name} disabled={disabled} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNotice(''); }}
          required maxLength={191} placeholder="e.g. Coil assembly" className="ams-input disabled:bg-gray-50" />
      </div>
      <div>
        <label className={label} htmlFor="sa-dwg">Drawing no.<span className="text-red-500"> *</span></label>
        <input id="sa-dwg" value={form.drawing_no} disabled={disabled} onChange={(e) => { setForm((f) => ({ ...f, drawing_no: e.target.value })); setNotice(''); }}
          required maxLength={100} placeholder="e.g. DWG-1203" className="ams-input font-mono disabled:bg-gray-50" />
      </div>
      <div>
        <label className={label} htmlFor="sa-dept">Department <span className="normal-case font-normal text-gray-400">(the one it comes from)</span></label>
        <select id="sa-dept" value={form.department_id} disabled={disabled} onChange={(e) => { setForm((f) => ({ ...f, department_id: e.target.value })); setNotice(''); }}
          className="ams-input disabled:bg-gray-50">
          <option value="">— None —</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}{d.dept_no != null ? ` (no. ${d.dept_no})` : ' (no number yet)'}</option>)}
        </select>
        <p className="text-[11px] text-gray-500 mt-1">Its department no. goes into project tag numbers. Set numbers in Administrator → Departments.</p>
      </div>
    </>
  );

  // ── New (or copy) ──────────────────────────────────────────────────────────
  if (isNew) {
    return (
      <form onSubmit={create} className="space-y-4 p-4 pb-10">
        <div className="bg-white rounded border border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link href={SUBS} className="text-sm text-gray-500 hover:text-gray-800">← Subassemblies</Link>
          <h1 className="text-base font-semibold text-gray-900">{copyFrom ? 'New subassembly (copy)' : 'New subassembly'}</h1>
          <span className="text-xs text-gray-500">Saved as draft {revName(setup?.first_rev ?? 'Original')} — release it to use it on other subassemblies</span>
          <div className="flex-1" />
          {canCreate && <button type="submit" disabled={busy} className="btn-primary px-4 py-1.5">{busy ? 'Saving…' : 'Create draft'}</button>}
        </div>
        {banner}
        <fieldset disabled={!canCreate} className="bg-white rounded border border-gray-200 px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {detailFields(false)}
          {canCreate && <ItemChooser item={item} setItem={(v) => { setItem(v); setError(''); }} setup={setup} />}
        </fieldset>
        <div className="bg-white rounded border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200"><h2 className="text-sm font-semibold text-gray-800">Lines <span className="text-gray-400 font-normal tabular-nums">{lines.length}</span></h2></div>
          <LinesTable lines={lines} editable={canCreate} exclude={exclude} onAdd={addLine} onQty={setQty} onRemove={removeLine} onUseCurrent={useCurrent} />
        </div>
      </form>
    );
  }

  // ── Existing ───────────────────────────────────────────────────────────────
  const others = sub.revisions.filter((r) => r.id !== revId);
  const prevOf = (r) => sub.revisions.find((x) => x.seq < r.seq);
  const tabs = [
    { key: 'lines', label: `Lines (${lines.length})` },
    { key: 'structure', label: 'Structure & totals' },
    { key: 'compare', label: 'Compare' },
    { key: 'history', label: `Revisions (${sub.revisions.length})` },
    { key: 'used', label: `Used in (${sub.used_in.length})` },
  ];

  const chip = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium';
  const currentLines = sub.revisions.find((r) => r.status === 'RELEASED')?.line_count ?? sub.revisions[0]?.line_count ?? 0;

  return (
    <div className="space-y-4 p-4 pb-10">
      {/* Header: the drawing, its revision state, and what can be done with it */}
      <header className="bg-white rounded border border-gray-200 px-5 py-4">
        <Link href={SUBS} className="text-sm text-gray-500 hover:text-gray-800">← Subassemblies</Link>
        <div className="flex items-start gap-4 mt-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-500">{sub.drawing_no}</span>
              {sub.current
                ? <span className={`${chip} bg-[var(--ams-primary-mid)] text-[var(--ams-primary)]`} title="Current revision">{revName(sub.current.rev)}</span>
                : <span className={`${chip} bg-amber-50 text-amber-800`}>Not released yet</span>}
              {sub.draft && <span className={`${chip} bg-amber-50 text-amber-800`}>Draft {revName(sub.draft.rev)} open</span>}
              <span className={`${chip} bg-indigo-50 text-indigo-700`}>Subassembly</span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mt-1 break-words">{sub.name}</h1>
            <KeyFacts items={[
              ['IMM code', sub.material ? <Link key="imm" href={`/dashboard/master-data/materials/${sub.material.id}`} className="hover:underline">{sub.material.imm_code}</Link> : null, true],
              ['Department', sub.department ? `${sub.department.name}${sub.department.dept_no != null ? ` · no. ${sub.department.dept_no}` : ''}` : null],
              ['Lines', `${currentLines} in ${sub.current ? revName(sub.current.rev) : 'the draft'}`],
              ['Used in', `${sub.used_in.length} subassembl${sub.used_in.length === 1 ? 'y' : 'ies'}`],
            ]} />
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            {canCreate && <Link href={`${SUBS}/new?copy=${id}`} className="btn-secondary px-3 py-1.5" title="Start a new subassembly with these lines">Copy</Link>}
            {canEdit && !sub.draft && sub.current && (
              <button type="button" onClick={startRevision} disabled={busy} className="btn-primary px-3 py-1.5">New revision</button>
            )}
            {has('SUBASSEMBLY_DELETE') && (
              <button type="button" onClick={remove} disabled={busy || sub.used_in.length > 0} className="btn-danger px-3 py-1.5 disabled:opacity-40"
                title={sub.used_in.length ? 'Used on other subassemblies' : undefined}>Delete</button>
            )}
          </div>
        </div>
      </header>

      {banner}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      <div className="lg:col-span-2 bg-white rounded border border-gray-200 min-w-0">
        {/* The revision on screen, and what can be done with it. */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 flex-wrap">
          <label htmlFor="rev-pick" className="text-sm text-gray-600">Revision</label>
          <select id="rev-pick" value={revId ?? ''} onChange={(e) => {
            if (dirty && !window.confirm('Leave this draft without saving its changes?')) return;
            setRevId(Number(e.target.value));
          }} className="py-1.5 px-2 text-sm text-gray-800 border border-gray-300 rounded bg-white outline-none cursor-pointer">
            {sub.revisions.map((r) => <option key={r.id} value={r.id}>{revName(r.rev)} · {STATUS[r.status].text}{r.status === 'RELEASED' ? ' (current)' : ''}</option>)}
          </select>
          {revision && <StatusChip status={revision.status} />}
          {revision && revision.status !== 'DRAFT' && (
            <span className="text-xs text-gray-500">released {when(revision.released_at)}{revision.released_by_name ? ` by ${revision.released_by_name}` : ''}</span>
          )}
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <div className="flex-1" />
          {isDraft && canEdit && (
            <>
              {sub.current && <button type="button" onClick={discard} disabled={busy} className="btn-secondary px-3 py-1.5">Discard draft</button>}
              <button type="button" onClick={onSaveDraft} disabled={busy || !dirty} className="btn-secondary px-3 py-1.5 disabled:opacity-40">Save draft</button>
            </>
          )}
          {isDraft && canApprove && (
            <button type="button" onClick={openRelease} disabled={busy || !sub.material} className="btn-primary px-4 py-1.5 disabled:opacity-40"
              title={!sub.material ? 'Give it its IMM code first' : undefined}>Release {revName(revision.rev)}…</button>
          )}
          {isDraft && !canApprove && <span className="text-xs text-gray-500">Releasing needs Subassemblies → Approve</span>}
        </div>
        {revision && revision.status !== 'DRAFT' && revision.change_note && (
          <p className="px-4 py-2 text-sm text-gray-700 bg-gray-50 border-b border-gray-200"><span className="text-gray-500">Change note:</span> {revision.change_note}</p>
        )}

        <TabBar tabs={tabs} active={tab} onPick={setTab} />

        {!revision ? <TableSkeleton cols={5} rows={4} /> : (
          <>
            {tab === 'lines' && (
              <>
                {!editable && revision.status !== 'DRAFT' && canEdit && !sub.draft && (
                  <p className="px-4 pt-3 text-xs text-gray-500">A released revision is locked. Use <b>New revision</b> to change the lines.</p>
                )}
                <LinesTable lines={lines} editable={editable} exclude={exclude} onAdd={addLine} onQty={setQty} onRemove={removeLine} onUseCurrent={useCurrent} />
              </>
            )}
            {tab === 'structure' && (
              <>
                {dirty && <p className="px-4 pt-3 text-xs text-amber-700">Showing {revName(revision.rev)} as last saved — save the draft to see your changes here.</p>}
                <Structure key={`${revId}-${revision.updated_at}`} id={id} revId={revId} />
              </>
            )}
            {tab === 'compare' && (
              <Compare key={revId} id={id} revisions={sub.revisions}
                initialFrom={prevOf(revision)?.id ?? others[0]?.id} initialTo={revId} />
            )}
            {tab === 'history' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 720 }}>
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-4 py-2.5 font-normal">Rev</th>
                      <th className="px-3 py-2.5 font-normal">Status</th>
                      <th className="px-3 py-2.5 font-normal">Change note</th>
                      <th className="px-3 py-2.5 font-normal">Released</th>
                      <th className="px-3 py-2.5 font-normal text-right">Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sub.revisions.map((r) => (
                      <tr key={r.id} onClick={() => { if (!dirty || window.confirm('Leave this draft without saving its changes?')) { setRevId(r.id); setTab('lines'); } }}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${r.id === revId ? 'bg-gray-50' : ''}`}>
                        <td className="px-4 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{revName(r.rev)}</td>
                        <td className="px-3 py-2.5"><StatusChip status={r.status} /></td>
                        <td className="px-3 py-2.5 text-gray-700 max-w-md">{r.status === 'DRAFT' ? <span className="text-gray-400">being drafted{r.created_by_name ? ` by ${r.created_by_name}` : ''}</span> : r.change_note}</td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.released_at ? `${when(r.released_at)}${r.released_by_name ? ` · ${r.released_by_name}` : ''}` : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{r.line_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === 'used' && (
              sub.used_in.length === 0 ? <Empty>Not used on any other subassembly yet.</Empty> : (
                <div className="overflow-x-auto px-4 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-2 pr-3 font-normal">Drawing no.</th>
                        <th className="py-2 pr-3 font-normal">Subassembly</th>
                        <th className="py-2 pr-3 font-normal">In its revision</th>
                        <th className="py-2 pr-3 font-normal">Holds {sub.drawing_no} at</th>
                        <th className="py-2 font-normal text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sub.used_in.map((u) => (
                        <tr key={`${u.id}-${u.revision.id}`} className="border-b border-gray-100">
                          <td className="py-2 pr-3 font-mono text-xs font-semibold"><Link href={`${SUBS}/${u.id}`} className="text-gray-800 hover:underline">{u.drawing_no}</Link></td>
                          <td className="py-2 pr-3 text-gray-700">{u.name}</td>
                          <td className="py-2 pr-3 text-gray-600">{revName(u.revision.rev)} <StatusChip status={u.revision.status} /></td>
                          <td className="py-2 pr-3 text-gray-700">
                            {u.held ? `${revName(u.held.rev)}` : '—'}
                            {u.newer && <span className="ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">{revName(sub.current.rev)} available</span>}
                          </td>
                          <td className="py-2 text-right tabular-nums text-gray-700">{qtyFmt(u.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Right: details (edited here), revision and record — on every tab */}
      <aside className="space-y-4">
        <form onSubmit={saveDetails} className="bg-white rounded border border-gray-200">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</h2>
          </div>
          <div className="px-4 py-3 space-y-3">
            {detailFields(!canEdit)}
            {sub.material ? (
              <div className="text-sm">
                <span className={label}>IMM code</span>
                <Link href={`/dashboard/master-data/materials/${sub.material.id}`} className="font-mono font-semibold text-gray-800 hover:underline">{sub.material.imm_code}</Link>
                <p className="text-xs text-gray-500 mt-0.5">Finished · counted in {sub.material.uom?.code} · the same across revisions</p>
              </div>
            ) : canEdit ? (
              <>
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
                  This subassembly was made before subassemblies had their own IMM code — give it one, then save the details.
                </p>
                <ItemChooser item={item} setItem={(v) => { setItem(v); setError(''); }} setup={setup} />
              </>
            ) : null}
            {canEdit && (
              <div className="flex justify-end">
                <button type="submit" disabled={busy || Boolean(form.name === sub.name && form.drawing_no === sub.drawing_no && form.department_id === (sub.department ? String(sub.department.id) : '') && sub.material)}
                  className="btn-secondary px-4 py-1.5 disabled:opacity-40">Save details</button>
              </div>
            )}
          </div>
        </form>

        <SideCard title="Revision"
          action={<button type="button" onClick={() => setTab('history')} className="text-xs text-[var(--ams-primary)] hover:underline cursor-pointer">All revisions</button>}>
          <SideRow name="Current">{sub.current ? revName(sub.current.rev) : 'Not released yet'}</SideRow>
          {sub.current?.released_at && <SideRow name="Released">{`${when(sub.current.released_at)}${sub.current.released_by_name ? ` · ${sub.current.released_by_name}` : ''}`}</SideRow>}
          <SideRow name="Draft">{sub.draft ? `${revName(sub.draft.rev)} open` : 'None'}</SideRow>
          <SideRow name="Revisions">{String(sub.revisions.length)}</SideRow>
        </SideCard>

        <SideCard title="Record">
          <SideRow name="Created">{when(sub.created_at)}</SideRow>
          <SideRow name="Last changed">{when(sub.updated_at)}</SideRow>
        </SideCard>
      </aside>
      </div>

      {releasing && revision && <ReleaseModal sub={sub} draft={revision} onClose={() => setReleasing(false)} onRelease={release} />}
    </div>
  );
}

export default function SubassemblyPage() {
  return (
    <Suspense fallback={<div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={5} rows={5} /></div>}>
      <SubassemblyEditor />
    </Suspense>
  );
}
