'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import useNav from '@/lib/useNav';

/**
 * Flow Builder → (module) → Flows: the module's flows — what each starts on,
 * live or not, its version — and "New flow". Super Admin only for now.
 */

const STATUS = {
  DRAFT: { label: 'Draft', cls: 'bg-gray-100 text-gray-700' },
  ACTIVE: { label: 'Live', cls: 'bg-green-50 text-green-700' },
  PAUSED: { label: 'Paused', cls: 'bg-amber-50 text-amber-800' },
};

export default function FlowsList({ module, isAdmin }) {
  const nav = useNav();
  const [rows, setRows] = useState(null);
  const [events, setEvents] = useState([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    Promise.all([apiGet(`/flow-engine/flows?module=${module}&limit=100`, { silent: true }), apiGet(`/flow-engine/catalog/${module}`, { silent: true })])
      .then(([f, c]) => { if (!cancelled) { setRows(f.data); setEvents(c.data.events); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [module, isAdmin]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { const r = await apiPost('/flow-engine/flows', { module, name: name.trim() }); nav(`/dashboard/flows/${r.data.id}`); }
    catch (err) { setError(err.message); }
  };

  if (!isAdmin) {
    return <p className="text-sm text-gray-500 bg-white rounded border border-gray-200 px-4 py-6">Flows are built by a Super Admin for now.</p>;
  }
  const eventLabel = (k) => events.find((e) => e.key === k)?.label || '—';

  return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700 px-1">Flows</span>
        <span className="text-xs text-gray-500">Who gets each stage, approvals before actions, and who is told — drawn on a canvas.</span>
        <div className="flex-1" />
        {creating ? (
          <form onSubmit={create} className="flex items-center gap-2">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Big offers need approval" className="ams-input text-sm w-72" aria-label="New flow name" />
            <button type="submit" className="btn-primary px-3 py-1 text-sm">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-500 cursor-pointer">Cancel</button>
          </form>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm" style={{ backgroundColor: 'var(--ams-primary)' }}>New flow</button>
        )}
      </div>
      {error && <p className="px-4 py-2 text-sm text-red-700">{error}</p>}
      {!rows ? <p className="px-4 py-8 text-sm text-gray-400">Loading…</p> : !rows.length ? (
        <p className="py-16 text-center text-sm text-gray-400">No flows yet. Without one, Sales works exactly as before.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="px-4 py-2.5 font-normal">Flow</th><th className="px-3 py-2.5 font-normal">Starts</th>
            <th className="px-3 py-2.5 font-normal">Status</th><th className="px-3 py-2.5 font-normal">Updated</th>
          </tr></thead>
          <tbody>
            {rows.map((f) => {
              const s = STATUS[f.status] || STATUS.DRAFT;
              return (
                <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard/flows/${f.id}`} className="font-medium text-gray-800 hover:underline">{f.name}</Link>
                    {f.attention?.length > 0 && <p className="text-xs text-amber-700">⚠ {f.attention[0]}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{f.trigger ? eventLabel(f.trigger) : 'not published yet'}</td>
                  <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>{s.label}{f.live_version ? ` · v${f.live_version}` : ''}</span></td>
                  <td className="px-3 py-2.5 text-gray-500">{new Date(f.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
