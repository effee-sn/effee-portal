'use client';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, applyNodeChanges, applyEdgeChanges, useReactFlow, MarkerType,
} from '@xyflow/react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import BlockNode from '@/components/flowbuilder/BlockNode';
import Inspector from '@/components/flowbuilder/Inspector';
import { BLOCKS, defaultData, fromGraph, newId, summary, toGraph, waysOut, STAGE_EVENTS } from '@/components/flowbuilder/flowMeta';

/**
 * Flow Builder — the canvas for one flow. Blocks from the left, joined by
 * arrows; the selected block's settings on the right. Save keeps a draft;
 * Check asks the server what is wrong; Test run shows what it would do for a
 * real enquiry (nothing sent or changed); Publish makes the draft the live
 * version (older versions stay, and can be put back into the draft).
 */

const nodeTypes = { block: BlockNode };
const STATUS = {
  DRAFT: { label: 'Draft — not live', cls: 'bg-gray-100 text-gray-700' },
  ACTIVE: { label: 'Live', cls: 'bg-green-50 text-green-700' },
  PAUSED: { label: 'Paused', cls: 'bg-amber-50 text-amber-800' },
};
const list = (r) => (Array.isArray(r) ? r : r?.data || r?.items || r?.customers || []);

/** Try the draft on one enquiry: what each block would do. */
function TestPanel({ flowId, event, catalog, onResult, onClose }) {
  const [search, setSearch] = useState('');
  // The results and the search they are for (so "searching…" shows until they match the box).
  const [found, setFound] = useState({ query: null, items: [] });
  const [pick, setPick] = useState(null);
  const [payload, setPayload] = useState({});
  const [assume, setAssume] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const guard = catalog.events.find((e) => e.key === event)?.guard;

  // Empty box: the most recent enquiries; otherwise those matching the ref or title.
  const q = search.trim();
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      apiGet(`/sales/enquiries?limit=8${q ? `&search=${encodeURIComponent(q)}` : ''}`, { silent: true })
        .then((r) => { if (!cancelled) setFound({ query: q, items: list(r) }); })
        .catch(() => { if (!cancelled) setFound({ query: q, items: [] }); });
    }, q ? 250 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);
  const searching = found.query !== q;

  const run = async () => {
    setError('');
    try {
      const r = await apiPost(`/flow-engine/flows/${flowId}/test`, { entity_id: pick.id, payload, ...(assume ? { assume } : {}) });
      setResult(r.data); onResult(r.data);
    } catch (e) { setError(e.message); }
  };
  const set = (k, v) => setPayload((p) => ({ ...p, [k]: v === '' ? undefined : v }));
  const stageSelect = (k, labelText) => (
    <label className="block text-xs text-gray-600">{labelText}
      <select value={payload[k] || ''} onChange={(e) => set(k, e.target.value)} className="ams-input w-full text-sm mt-1">
        <option value="">Choose…</option>
        {catalog.stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </label>
  );
  const amount = (k, labelText) => (
    <label className="block text-xs text-gray-600">{labelText}
      <input type="number" value={payload[k] ?? ''} onChange={(e) => set(k, e.target.value === '' ? '' : Number(e.target.value))} className="ams-input w-full text-sm mt-1" />
    </label>
  );

  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="flex items-center"><p className="font-semibold text-gray-800">Test run</p>
        <button type="button" onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700 cursor-pointer" aria-label="Close test run">×</button></div>
      <p className="text-xs text-gray-500">Tries the draft on a real enquiry. Nothing is sent, assigned or asked.</p>
      {pick ? (
        <div className="flex items-center gap-2 rounded bg-gray-50 border border-gray-200 px-2 py-1.5">
          <span className="font-mono text-xs">{pick.ref_no}</span><span className="truncate text-gray-700">{pick.title}</span>
          <button type="button" onClick={() => { setPick(null); setResult(null); }} className="ml-auto text-xs text-[var(--ams-primary)] cursor-pointer">change</button>
        </div>
      ) : (
        <div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Enquiry ref or title…" className="ams-input w-full text-sm" aria-label="Find an enquiry" />
          <p className="text-[11px] text-gray-500 mt-1.5 mb-1">
            {searching ? 'Searching…' : !q ? 'Recent enquiries — or type a ref (e.g. ENQ-2026-0016) or part of the title:' : found.items.length ? 'Pick one:' : ''}
          </p>
          {!searching && q && !found.items.length && (
            <p className="text-xs text-amber-700 px-1">No enquiry matches “{q}”. Try its ref, or a word from its title.</p>
          )}
          <div className="max-h-56 overflow-y-auto">
            {found.items.map((m) => (
              <button key={m.id} type="button" onClick={() => setPick(m)} className="block w-full text-left px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                <span className="font-mono text-xs">{m.ref_no}</span> <span className="text-gray-700">{m.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {(event === 'STAGE_ENTERED' || event === 'BEFORE_STAGE_MOVE') && stageSelect('to', 'Entering stage')}
      {event === 'STAGE_STALLED' && stageSelect('stage', 'Stalled at stage')}
      {['ENQUIRY_LOST', 'BEFORE_LOST', 'ENQUIRY_WON', 'BEFORE_WON', 'ENQUIRY_REOPENED', 'BEFORE_REOPEN', 'BEFORE_STAGE_MOVE', 'STAGE_ENTERED'].includes(event) && stageSelect('from', 'Coming from stage')}
      {['OFFER_SENT', 'BEFORE_OFFER_SENT'].includes(event) && amount('offer_value_inr', 'Offer value (₹)')}
      {['ENQUIRY_WON', 'BEFORE_WON'].includes(event) && amount('order_value_inr', 'Order value (₹)')}
      {['ENQUIRY_LOST', 'BEFORE_LOST'].includes(event) && (
        <label className="block text-xs text-gray-600">Lost reason<input value={payload.lost_reason || ''} onChange={(e) => set('lost_reason', e.target.value)} className="ams-input w-full text-sm mt-1" /></label>
      )}
      {guard && (
        <label className="block text-xs text-gray-600">At the Approval
          <select value={assume} onChange={(e) => setAssume(e.target.value)} className="ams-input w-full text-sm mt-1">
            <option value="">Stop there</option><option value="approved">Assume approved</option><option value="rejected">Assume rejected</option><option value="withdrawn">Assume withdrawn</option>
          </select>
        </label>
      )}
      <button type="button" onClick={run} disabled={!pick} className="btn-primary w-full justify-center py-1.5 disabled:opacity-50">Run the test</button>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {result && (
        <div className="space-y-1.5">
          {result.problems?.length > 0 && (
            <p className="text-xs text-amber-700 rounded bg-amber-50 border border-amber-200 px-2 py-1">
              This draft still has {result.problems.length} thing{result.problems.length === 1 ? '' : 's'} to fix (press Check to see them) — the test shows what it would do as it stands.
            </p>
          )}
          {!result.starts && <p className="text-xs text-amber-700">{result.reason}</p>}
          {result.steps.map((s, i) => (
            <div key={i} className="rounded border border-gray-200 px-2 py-1.5">
              <p className="text-xs font-medium text-gray-800">{i + 1}. {s.label}</p>
              <p className="text-xs text-gray-600">{s.text}</p>
              {s.result?.title && <p className="text-xs text-gray-500 mt-0.5">“{s.result.title}”{s.result.message ? ` — ${s.result.message}` : ''}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** After publishing an assigning flow: move the current enquiries the new rule would give to someone else? */
function MoveCurrentModal({ flowId, items, onClose }) {
  const [picked, setPicked] = useState(() => new Set(items.map((x) => x.id)));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const move = async () => {
    setBusy(true); setError('');
    try { const r = await apiPost(`/flow-engine/flows/${flowId}/move-current`, { entity_ids: [...picked] }); setDone(r.data); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-5 space-y-3 max-h-[85vh] flex flex-col">
        <h2 className="text-base font-semibold text-gray-800">Move the current enquiries too?</h2>
        {done ? (
          <p className="text-sm text-gray-700">{done.moved} moved{done.skipped ? `, ${done.skipped} left as they were` : ''}. Each new holder was notified.</p>
        ) : (
          <>
            <p className="text-sm text-gray-600">The new version is live for enquiries entering these stages from now on. These {items.length} open enquiries are at its stages with someone the new rule would not choose. Tick the ones to move — the rest stay as they are.</p>
            <div className="overflow-auto border border-gray-200 rounded">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="All" checked={picked.size === items.length} onChange={(e) => setPicked(e.target.checked ? new Set(items.map((x) => x.id)) : new Set())} /></th>
                  <th className="px-2 py-2 font-normal">Enquiry</th><th className="px-2 py-2 font-normal">Now with</th><th className="px-2 py-2 font-normal">Would go to</th>
                </tr></thead>
                <tbody>{items.map((x) => (
                  <tr key={x.id} className="border-b border-gray-100">
                    <td className="px-3 py-1.5"><input type="checkbox" aria-label={x.ref_no} checked={picked.has(x.id)} onChange={() => setPicked((p) => { const s = new Set(p); if (s.has(x.id)) s.delete(x.id); else s.add(x.id); return s; })} /></td>
                    <td className="px-2 py-1.5"><span className="font-mono text-xs">{x.ref_no}</span> {x.title}</td>
                    <td className="px-2 py-1.5 text-gray-600">{x.current || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-800">{x.next}{x.queued ? ' (to assign)' : ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-1.5">{done ? 'Close' : 'Leave them'}</button>
          {!done && <button type="button" onClick={move} disabled={busy || !picked.size} className="btn-primary px-4 py-1.5 disabled:opacity-50">{busy ? 'Moving…' : `Move ${picked.size}`}</button>}
        </div>
      </div>
    </div>
  );
}

/** The run log: every run of this flow (newest first), and one run's steps. */
function RunLog({ flowId, nodes, onClose }) {
  const [runs, setRuns] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let cancelled = false;
    apiGet(`/flow-engine/runs?flow_id=${flowId}&limit=50`, { silent: true })
      .then((r) => { if (!cancelled) setRuns(r.data); }).catch(() => { if (!cancelled) setRuns([]); });
    return () => { cancelled = true; };
  }, [flowId]);
  const show = async (id) => {
    if (open?.id === id) { setOpen(null); return; }
    try { const r = await apiGet(`/flow-engine/runs/${id}`, { silent: true }); setOpen(r.data); } catch { setOpen(null); }
  };
  const label = (s) => {
    const kind = BLOCKS.find((b) => b.type === s.node_type)?.label || s.node_type;
    const there = nodes.some((n) => n.id === s.node_id) ? '' : ' (no longer in the draft)';
    const way = s.output?.handle && s.output.handle !== 'next' ? ` → ${s.output.handle}` : '';
    return `${kind}${way}${there}`;
  };
  const tone = { DONE: 'text-gray-500', WAITING: 'text-amber-700', FAILED: 'text-red-600', RUNNING: 'text-gray-500' };
  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="flex items-center"><p className="font-semibold text-gray-800">Run log</p>
        <button type="button" onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700 cursor-pointer" aria-label="Close run log">×</button></div>
      <p className="text-xs text-gray-500">Each time this flow ran — newest first. Click one to see its steps.</p>
      {!runs ? <p className="text-xs text-gray-400">Loading…</p> : !runs.length ? <p className="text-xs text-gray-400">It has not run yet.</p> : runs.map((r) => (
        <div key={r.id} className="rounded border border-gray-200">
          <button type="button" onClick={() => show(r.id)} className="w-full text-left px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
            <p className="text-xs text-gray-800 truncate">{r.entity_label || `${r.entity_type} ${r.entity_id}`}</p>
            <p className="text-[11px] text-gray-500">
              v{r.version?.version} · {new Date(r.started_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              <span className={`ml-1 font-medium ${tone[r.status]}`}>· {r.status.toLowerCase()}</span>
            </p>
          </button>
          {open?.id === r.id && (
            <ol className="px-3 pb-2 space-y-0.5 list-decimal list-inside text-[11px] text-gray-700">
              {open.steps.map((s) => (
                <li key={s.id} className={s.status === 'FAILED' ? 'text-red-600' : ''}>{label(s)}{s.error ? ` — ${s.error}` : ''}</li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}

function Editor({ flowId, perms }) {
  const readOnly = !perms.canEdit;
  const { screenToFlowPosition } = useReactFlow();
  const [flow, setFlow] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [problems, setProblems] = useState(null);
  const [lookups, setLookups] = useState(null);
  const [panel, setPanel] = useState('settings');
  const [tested, setTested] = useState({});
  const [move, setMove] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  const loadFlow = useCallback(async () => {
    const r = await apiGet(`/flow-engine/flows/${flowId}`);
    setFlow(r.data); setName(r.data.name);
    return r.data;
  }, [flowId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = await loadFlow();
        if (cancelled) return;
        const g = fromGraph(f.draft_graph);
        setNodes(g.nodes); setEdges(g.edges);
        const [catalog, users, departments, roles, applications, customers] = await Promise.all([
          apiGet(`/flow-engine/catalog/${f.module}`, { silent: true }),
          apiGet('/lookup/users', { silent: true }).catch(() => []),
          apiGet('/lookup/departments', { silent: true }).catch(() => []),
          apiGet('/lookup/roles', { silent: true }).catch(() => []),
          apiGet('/sales/applications', { silent: true }).catch(() => []),
          apiGet('/customers?limit=100', { silent: true }).catch(() => []),
        ]);
        if (!cancelled) {
          setLookups({ catalog: catalog.data, users: list(users), departments: list(departments), roles: list(roles), applications: list(applications), customers: list(customers) });
        }
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [loadFlow]);

  const names = useMemo(() => {
    const m = (rows) => new Map((rows || []).map((r) => [Number(r.id), r.name]));
    return { users: m(lookups?.users), departments: m(lookups?.departments), roles: m(lookups?.roles), applications: m(lookups?.applications), customers: m(lookups?.customers) };
  }, [lookups]);

  const event = nodes.find((n) => n.data.kind === 'trigger')?.data.settings.event;
  const byNode = useMemo(() => {
    const out = {};
    for (const p of problems || []) if (p.nodeId) (out[p.nodeId] ||= []).push(p.message);
    return out;
  }, [problems]);
  const flowProblems = (problems || []).filter((p) => !p.nodeId);

  const shown = useMemo(() => nodes.map((n) => ({
    ...n,
    data: { ...n.data, view: { summary: lookups ? summary(n.data.kind, n.data.settings, lookups.catalog, names) : '', errors: byNode[n.id], tested: tested[n.id] } },
  })), [nodes, lookups, names, byNode, tested]);

  const touch = () => { setDirty(true); setNotice(''); };
  const onNodesChange = useCallback((changes) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (changes.some((c) => c.type === 'position' || c.type === 'remove')) touch();
    for (const c of changes) if (c.type === 'select' && c.selected) setSelectedId(c.id);
  }, []);
  const onEdgesChange = useCallback((changes) => {
    setEdges((es) => applyEdgeChanges(changes, es));
    if (changes.some((c) => c.type === 'remove')) touch();
  }, []);
  const onConnect = useCallback((c) => {
    const way = c.sourceHandle || 'next';
    // One arrow per way out: a new one replaces the old.
    setEdges((es) => addEdge({ ...c, sourceHandle: way, id: `e-${c.source}-${way}-${c.target}` }, es.filter((e) => !(e.source === c.source && (e.sourceHandle || 'next') === way))));
    touch();
  }, []);

  const addBlock = (type, position) => {
    const id = newId(type);
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: 'block', position, selected: true, deletable: type !== 'trigger', data: { kind: type, settings: defaultData(type) } }]);
    setSelectedId(id); setPanel('settings'); touch();
  };
  const onDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/flow-block');
    if (type) addBlock(type, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const updateSettings = (id, settings) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, settings } } : n)));
    // A removed group / way out takes its arrow with it.
    const node = nodes.find((n) => n.id === id);
    if (node) {
      const ways = new Set(waysOut(node.data.kind, settings).map((w) => w.id));
      setEdges((es) => es.filter((e) => e.source !== id || ways.has(e.sourceHandle || 'next')));
    }
    touch();
  };
  const removeSelected = () => {
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null); touch();
  };

  const save = async () => {
    await apiPut(`/flow-engine/flows/${flowId}`, { graph: toGraph(nodes, edges), ...(name.trim() && name.trim() !== flow.name ? { name: name.trim() } : {}) });
    setDirty(false);
  };
  const act = async (fn) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const check = () => act(async () => {
    if (dirty) await save();
    const r = await apiPost(`/flow-engine/flows/${flowId}/check`, {});
    setProblems(r.data.errors);
    setNotice(r.data.ok ? 'No problems — ready to publish.' : '');
  });
  const publish = () => act(async () => {
    if (dirty) await save();
    const c = await apiPost(`/flow-engine/flows/${flowId}/check`, {});
    setProblems(c.data.errors);
    if (!c.data.ok) { setError('Fix the problems shown in red first.'); return; }
    try { await apiPost(`/flow-engine/flows/${flowId}/publish`, {}); }
    catch (e) {
      if (e.details) setProblems(e.details.map((d) => ({ nodeId: d.field === 'flow' ? null : d.field, message: d.message })));
      throw e;
    }
    const f = await loadFlow();
    setNotice(`Published — version ${f.versions[0]?.version} is live. Enquiries already with someone stay with them.`);
    const a = await apiGet(`/flow-engine/flows/${flowId}/affected`);
    if (a.data.items.length) setMove(a.data.items);
  });
  const setStatus = (to) => act(async () => { await apiPost(`/flow-engine/flows/${flowId}/${to}`, {}); await loadFlow(); });
  const removeFlow = () => act(async () => {
    if (!window.confirm(`Delete the flow “${flow.name}”? Its versions and run log go with it. This cannot be undone.`)) return;
    await apiDelete(`/flow-engine/flows/${flowId}`);
    window.location.assign('/dashboard/flows?tab=sales');
  });
  const restore = (versionId) => act(async () => {
    const r = await apiGet(`/flow-engine/flows/${flowId}/versions/${versionId}`);
    const g = fromGraph(r.data.graph);
    setNodes(g.nodes); setEdges(g.edges); setProblems(null); setTested({}); touch();
    setNotice(`Version ${r.data.version} is in the draft — Publish to make it live again.`);
  });
  const onTestResult = (res) => {
    const t = {};
    for (const s of res.steps || []) if (s.node_id) t[s.node_id] = s.text;
    setTested(t);
  };

  if (error && !flow) return <p className="m-4 px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>;
  if (!flow || !lookups) return <p className="p-6 text-sm text-gray-500">Loading the flow…</p>;
  const selected = shown.find((n) => n.id === selectedId) || null;
  const st = STATUS[flow.status] || STATUS.DRAFT;
  const guard = lookups.catalog.events.find((e) => e.key === event)?.guard;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 bg-white border-b border-gray-200">
        <Link href="/dashboard/flows?tab=sales" className="text-sm text-gray-500 hover:text-gray-800">← Flow Builder</Link>
        <input value={name} onChange={(e) => { setName(e.target.value); touch(); }} className="text-base font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[var(--ams-primary)] outline-none px-1 w-96 max-w-full" aria-label="Flow name" />
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.cls}`}>{st.label}{flow.versions?.length ? ` · v${flow.versions[0].version}` : ''}</span>
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
        <div className="flex-1" />
        {!readOnly && flow.versions?.length > 0 && (
          <select value="" onChange={(e) => e.target.value && restore(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1 bg-white cursor-pointer" aria-label="Versions">
            <option value="">Versions…</option>
            {flow.versions.map((v) => <option key={v.id} value={v.id}>v{v.version} · {new Date(v.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — put back in the draft</option>)}
          </select>
        )}
        {readOnly && <span className="text-xs text-gray-500">View only</span>}
        {!readOnly && <button type="button" onClick={() => act(save)} disabled={busy || !dirty} className="btn-secondary px-3 py-1 text-sm disabled:opacity-50">Save draft</button>}
        {!readOnly && <button type="button" onClick={check} disabled={busy} className="btn-secondary px-3 py-1 text-sm">Check</button>}
        {!readOnly && <button type="button" onClick={() => setPanel(panel === 'test' ? 'settings' : 'test')} className="btn-secondary px-3 py-1 text-sm">Test run</button>}
        <button type="button" onClick={() => setPanel(panel === 'runs' ? 'settings' : 'runs')} className="btn-secondary px-3 py-1 text-sm">Run log</button>
        {perms.canPublish && flow.status === 'ACTIVE' && <button type="button" onClick={() => setStatus('pause')} disabled={busy} className="btn-secondary px-3 py-1 text-sm">Pause</button>}
        {perms.canPublish && flow.status === 'PAUSED' && <button type="button" onClick={() => setStatus('resume')} disabled={busy} className="btn-secondary px-3 py-1 text-sm">Resume</button>}
        {perms.canDelete && (
          <button type="button" onClick={removeFlow} disabled={busy || flow.status === 'ACTIVE'}
            title={flow.status === 'ACTIVE' ? 'Pause the flow before deleting it' : 'Delete this flow'}
            className="px-3 py-1 text-sm rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">Delete</button>
        )}
        {perms.canPublish && !readOnly && <button type="button" onClick={publish} disabled={busy} className="btn-primary px-3 py-1 text-sm">Publish</button>}
      </div>
      {(error || notice || flowProblems.length > 0 || flow.attention?.length > 0) && (
        <div className="px-4 py-2 space-y-1 bg-white border-b border-gray-200 text-sm">
          {error && <p className="text-red-700">{error}</p>}
          {notice && <p className="text-green-700">{notice}</p>}
          {flowProblems.map((p, i) => <p key={i} className="text-red-700">• {p.message}</p>)}
          {flow.attention?.map((m, i) => <p key={`a${i}`} className="text-amber-700">⚠ Live version: {m}</p>)}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Blocks */}
        {!readOnly && <aside className="w-48 shrink-0 bg-white border-r border-gray-200 p-3 space-y-2 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Blocks</p>
          {(() => {
            // Every flow has exactly one When block, put on the canvas when the flow is made — this selects it.
            const b = BLOCKS.find((x) => x.type === 'trigger');
            const start = nodes.find((n) => n.data.kind === 'trigger');
            return (
              <button type="button" title="Every flow has one When block — it is already on the canvas. Click to set what starts the flow."
                onClick={() => {
                  if (!start) return;
                  setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === start.id })));
                  setSelectedId(start.id); setPanel('settings');
                }}
                className="w-full text-left rounded border border-dashed px-2 py-1.5 cursor-pointer hover:bg-gray-50" style={{ borderColor: b.color }}>
                <p className="text-sm font-medium" style={{ color: b.color }}>{b.icon} {b.label}</p>
                <p className="text-[11px] text-gray-500">Already on the canvas — click to set what starts the flow</p>
              </button>
            );
          })()}
          {BLOCKS.filter((b) => b.type !== 'trigger').map((b) => {
            const off = (b.type === 'assign' && event !== 'STAGE_ENTERED') || (b.type === 'approval' && !guard);
            return (
              <div key={b.type} draggable={!off} onDragStart={(e) => { e.dataTransfer.setData('application/flow-block', b.type); e.dataTransfer.effectAllowed = 'move'; }}
                onDoubleClick={() => {
                  if (off) return;
                  // Below the lowest block, so nothing lands on top of another.
                  const low = nodes.reduce((m, n) => (n.position.y > m.position.y ? n : m), nodes[0]);
                  addBlock(b.type, low ? { x: low.position.x, y: low.position.y + 160 } : { x: 260, y: 40 });
                }}
                title={off ? (b.type === 'assign' ? 'Assign works in a flow started by “Enquiry enters a stage”' : 'Approval works in a “Before …” flow') : 'Drag onto the canvas (or double-click)'}
                className={`rounded border px-2 py-1.5 select-none ${off ? 'opacity-40 cursor-not-allowed' : 'cursor-grab hover:shadow-sm'}`} style={{ borderColor: b.color }}>
                <p className="text-sm font-medium" style={{ color: b.color }}>{b.icon} {b.label}</p>
                <p className="text-[11px] text-gray-500">{b.hint}</p>
              </div>
            );
          })}
          {STAGE_EVENTS.includes(event) && <p className="text-[11px] text-gray-500 pt-2">Tip: “Which stage?” gives each group of stages its own way.</p>}
        </aside>}

        {/* Canvas */}
        <div className="flex-1 min-w-0" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}>
          <ReactFlow
            nodes={shown} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onPaneClick={() => setSelectedId(null)}
            defaultEdgeOptions={{ type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.5 } }}
            fitView fitViewOptions={{ maxZoom: 1 }} deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']} proOptions={{ hideAttribution: true }}
            nodesDraggable={!readOnly} nodesConnectable={!readOnly}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bg-gray-50" />
          </ReactFlow>
        </div>

        {/* Settings / test run */}
        <aside className="w-[340px] shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
          {panel === 'runs' ? <RunLog flowId={flowId} nodes={nodes} onClose={() => setPanel('settings')} />
            : panel === 'test'
            ? <TestPanel flowId={flowId} event={event} catalog={lookups.catalog} onResult={onTestResult} onClose={() => { setPanel('settings'); setTested({}); }} />
            : <fieldset disabled={readOnly} className="min-w-0"><Inspector node={selected} event={event} lookups={lookups} errors={selected ? byNode[selected.id] : null}
              onChange={(s) => updateSettings(selected.id, s)} onDelete={removeSelected} /></fieldset>}
        </aside>
      </div>
      {move && <MoveCurrentModal flowId={flowId} items={move} onClose={() => setMove(null)} />}
    </div>
  );
}

export default function FlowEditorPage() {
  useAuth();
  const { id } = useParams();
  const { me, can, loading } = usePermissions();
  const has = (code) => Boolean(me?.is_system || can(code));
  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  if (!has('FLOW_VIEW')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You need Flow Builder → View.</p>
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <Editor flowId={id} perms={{ canEdit: has('FLOW_EDIT'), canPublish: has('FLOW_PUBLISH'), canDelete: has('FLOW_DELETE') }} />
    </ReactFlowProvider>
  );
}
