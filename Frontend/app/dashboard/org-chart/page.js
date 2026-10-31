'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

/**
 * Organisation chart: who reports to whom. Each person's manager is who they
 * report to (Administrator → Users → Reports to), else the head of their
 * department (Administrator → Departments). The person at the top reports to
 * nobody. A solid card means the manager was chosen (Reports to); a dashed one
 * that it comes from the department head.
 */

const initials = (name = '') => {
  const p = name.trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : p[0].slice(0, 2)).toUpperCase();
};

/** Opens every branch above the people whose ids are given. */
function pathsTo(ids, byId) {
  const open = new Set();
  for (const id of ids) {
    let at = byId.get(id)?.manager_id;
    while (at && !open.has(at)) { open.add(at); at = byId.get(at)?.manager_id; }
  }
  return open;
}

function Person({ p, byId, kids, open, toggle, matches }) {
  const match = matches.has(p.id);
  const children = kids.get(p.id) || [];
  const isOpen = open.has(p.id);
  const viaHead = p.manager_basis === 'DEPARTMENT_HEAD';
  return (
    <li>
      <div className={`org-card inline-block w-52 text-left rounded-lg bg-white px-3 py-2.5 shadow-sm ${viaHead ? 'border border-dashed' : 'border'} ${match ? 'ring-2 ring-[var(--ams-primary)]' : ''}`}
        style={{ borderColor: 'var(--ams-input-border)' }}
        title={p.manager_id ? `Reports to ${byId.get(p.manager_id)?.name}${viaHead ? ' (head of their department)' : ''}` : 'Reports to nobody'}>
        <div className="flex items-start gap-2">
          <span className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ backgroundColor: 'var(--ams-primary)' }}>
            {initials(p.name)}
          </span>
          <div className="min-w-0">
            <Link href={`/dashboard/users/${p.id}`} className="block text-sm font-semibold text-gray-900 hover:underline truncate">{p.name}</Link>
            <p className="text-xs text-gray-500 truncate">{p.designation || p.role?.name || '—'}</p>
            <p className="text-[11px] text-gray-400 truncate">{p.department?.name || 'No department'}</p>
          </div>
        </div>
        {(p.head_of.length > 0 || children.length > 0) && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {p.head_of.map((d) => (
              <span key={d} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--ams-primary-mid)] text-[var(--ams-primary)]">Head of {d}</span>
            ))}
            {children.length > 0 && (
              <button type="button" onClick={() => toggle(p.id)} aria-expanded={isOpen}
                className="ml-auto text-[11px] text-gray-600 hover:text-gray-900 cursor-pointer">
                {isOpen ? '▾' : '▸'} {children.length} {children.length === 1 ? 'report' : 'reports'}
              </button>
            )}
          </div>
        )}
      </div>
      {isOpen && children.length > 0 && (
        <ul>
          {children.map((c) => <Person key={c.id} p={c} byId={byId} kids={kids} open={open} toggle={toggle} matches={matches} />)}
        </ul>
      )}
    </li>
  );
}

export default function OrgChartPage() {
  useAuth();
  const { can, loading: permLoading } = usePermissions();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // ids whose reports are shown
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (permLoading) return undefined;
    let cancelled = false;
    apiGet('/users/org-chart')
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [permLoading]);

  const { byId, kids } = useMemo(() => {
    const m = new Map(); const k = new Map();
    for (const p of data?.people || []) m.set(p.id, p);
    for (const p of data?.people || []) {
      if (p.manager_id) k.set(p.manager_id, [...(k.get(p.manager_id) || []), p]);
    }
    // Heads and managers first, then by name.
    for (const list of k.values()) list.sort((a, b) => (b.head_of.length - a.head_of.length) || ((k.get(b.id)?.length || 0) > 0) - ((k.get(a.id)?.length || 0) > 0) || a.name.localeCompare(b.name));
    return { byId: m, kids: k };
  }, [data]);

  // Open the top two levels by default.
  const shown = useMemo(() => {
    if (open) return open;
    const s = new Set(data?.roots || []);
    for (const r of data?.roots || []) for (const c of kids.get(r) || []) s.add(c.id);
    return s;
  }, [open, data, kids]);

  const q = search.trim().toLowerCase();
  const matches = useMemo(() => (q ? (data?.people || [])
    .filter((p) => [p.name, p.designation, p.department?.name].filter(Boolean).some((v) => v.toLowerCase().includes(q)))
    .map((p) => p.id) : []), [q, data]);
  const openForSearch = useMemo(() => (matches.length ? new Set([...shown, ...pathsTo(matches, byId)]) : shown), [matches, shown, byId]);
  const matchSet = new Set(matches);

  const toggle = (id) => setOpen(() => { const s = new Set(shown); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const expandAll = () => setOpen(new Set([...kids.keys()]));
  const collapseAll = () => setOpen(new Set());

  if (permLoading || (!data && !error)) return <div className="p-4"><TableSkeleton cols={4} rows={4} /></div>;
  if (!can('USER_VIEW')) return <p className="p-4 text-sm text-gray-500">You do not have access to the organisation chart.</p>;

  const notPlaced = (data?.not_placed || []).map((id) => byId.get(id)).filter(Boolean);
  const renderPerson = (p) => (
    <Person key={p.id} p={p} byId={byId} kids={kids} open={openForSearch} toggle={toggle} matches={matchSet} />
  );

  return (
    <div className="p-4 pb-10 space-y-4">
      <style>{`
        .org ul { position: relative; display: flex; justify-content: center; padding-top: 20px; margin: 0; }
        .org > ul { padding-top: 0; }
        .org li { list-style: none; position: relative; padding: 20px 8px 0; text-align: center; }
        .org li::before, .org li::after { content: ''; position: absolute; top: 0; right: 50%; width: 50%; height: 20px; border-top: 1px solid var(--ams-input-border); }
        .org li::after { right: auto; left: 50%; border-left: 1px solid var(--ams-input-border); }
        .org li:only-child::before, .org li:only-child::after { display: none; }
        .org li:only-child { padding-top: 0; }
        .org li:first-child::before, .org li:last-child::after { border: 0 none; }
        .org li:last-child::before { border-right: 1px solid var(--ams-input-border); border-radius: 0 6px 0 0; }
        .org li:first-child::after { border-radius: 6px 0 0 0; }
        .org ul ul::before { content: ''; position: absolute; top: 0; left: 50%; height: 20px; border-left: 1px solid var(--ams-input-border); }
        .org > ul > li { padding-top: 0; }
        .org > ul > li::before, .org > ul > li::after { display: none; }
      `}</style>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Organisation chart</h1>
          <p className="text-sm text-gray-500">
            Who reports to whom: each person’s <b>Reports to</b> (Users), else the <b>head of their department</b> (Departments).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a person, role or department…"
            aria-label="Find a person" className="ams-input w-64 max-w-full text-sm" />
          <button type="button" onClick={expandAll} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Expand all</button>
          <button type="button" onClick={collapseAll} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Collapse all</button>
        </div>
      </header>

      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 h-3 rounded border" style={{ borderColor: 'var(--ams-input-border)' }} /> Reports to (chosen)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 h-3 rounded border border-dashed" style={{ borderColor: 'var(--ams-input-border)' }} /> Through the department head</span>
        {q && <span>{matches.length} found</span>}
      </div>

      {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
      {data?.loops?.length > 0 && (
        <p className="px-3 py-2 rounded text-sm border bg-amber-50 border-amber-200 text-amber-800">
          ⚠ Some people report to each other in a circle ({data.loops.map((l) => l.map((id) => byId.get(id)?.name).join(' → ')).join('; ')}). It is shown broken; fix their Reports to or the department head.
        </p>
      )}

      {data && (data.roots.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400 bg-white rounded border border-gray-200">
          No chart yet. Set the head of each department (Departments) and who people report to (Users).
        </p>
      ) : (
        <div className="org overflow-auto rounded-lg border border-gray-200 bg-[var(--ams-bg)] p-6">
          <ul className="min-w-max">
            {data.roots.map((id) => byId.get(id)).filter(Boolean).map(renderPerson)}
          </ul>
        </div>
      ))}

      {notPlaced.length > 0 && (
        <section className="bg-white rounded border border-gray-200">
          <h2 className="px-4 py-2.5 border-b border-gray-200 text-sm font-semibold text-gray-800">
            Not placed <span className="font-normal text-gray-500">· {notPlaced.length} with no manager and nobody reporting to them</span>
          </h2>
          <ul className="p-3 flex flex-wrap gap-2">
            {notPlaced.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/users/${p.id}`}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs text-gray-700 hover:bg-gray-50 ${matchSet.has(p.id) ? 'ring-2 ring-[var(--ams-primary)]' : ''}`}
                  style={{ borderColor: 'var(--ams-input-border)' }}>
                  {p.name}<span className="text-gray-400">· {p.department?.name || 'no department'}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-3 text-xs text-gray-500">Set their department (with a head) or who they report to in Users.</p>
        </section>
      )}
    </div>
  );
}
