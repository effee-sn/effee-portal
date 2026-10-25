'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import useNav from '@/lib/useNav';
import { apiGet } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import usePageSize from '@/lib/usePageSize';
import PageSizeSelect from '@/components/PageSizeSelect';

/**
 * Master Data → BOM (Bill of Materials — subassemblies).
 *
 * The reusable library of drawing-wise subassemblies: each has a name, a
 * drawing no. and the materials (from the material master) it is built from.
 * Projects will pick these with their quantities. Opening a row edits it.
 */

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

export default function BomPage() {
  useAuth();
  const nav = useNav();
  const { me, can, loading: permLoading } = usePermissions();
  const has = (code) => me?.is_system || can(code);
  const canView = has('BOM_VIEW');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [limit, setLimit, limitRef] = usePageSize('bom', 20);

  const fetchRows = async (p = page, s = search) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(p), limit: String(limitRef.current), search: s });
      const res = await apiGet(`/bom/subassemblies?${q.toString()}`);
      setRows(res.data); setTotal(res.meta.pagination.total);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) fetchRows(1);
    else if (!permLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); fetchRows(1, search); };
  const goPage = (d) => { const p = page + d; setPage(p); fetchRows(p); };
  const onPageSize = (n) => { setLimit(n); setPage(1); fetchRows(1); };
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  if (permLoading) return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={4} rows={6} /></div>;
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view bills of materials.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded border border-gray-200 px-4 py-3">
        <h1 className="text-base font-semibold text-gray-900">BOM — Bill of Materials (Subassemblies)</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          A subassembly is a part with its own drawing, built from materials of the material master. Build each one here
          once — projects will use them with the quantities they need.
        </p>
      </div>

      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap">
          {has('BOM_CREATE') && (
            <Link href="/dashboard/master-data/bom/new"
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm" style={{ backgroundColor: 'var(--ams-primary)' }}>New subassembly</Link>
          )}
          <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Subassemblies</span>
          <div className="flex-1" />
          <form onSubmit={onSearch} className="flex items-center border border-gray-300 rounded overflow-hidden min-w-[220px]">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or drawing no.…"
              className="flex-1 min-w-0 py-1.5 px-2.5 text-sm text-gray-700 outline-none bg-transparent" />
          </form>
          <div className="flex items-center gap-0.5 shrink-0 text-sm text-gray-500">
            <PageSizeSelect value={limit} onChange={onPageSize} />
            <span className="px-1 tabular-nums">{total === 0 ? '0' : `${from}-${to}`} / {total}</span>
            <button onClick={() => goPage(-1)} disabled={page === 1} aria-label="Previous page"
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">‹</button>
            <button onClick={() => goPage(1)} disabled={page * limit >= total} aria-label="Next page"
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">›</button>
          </div>
        </div>

        {loading ? <TableSkeleton cols={4} rows={6} /> : rows.length === 0 ? (
          <p className="py-14 text-center text-sm text-gray-400">No subassemblies {search ? 'match your search' : 'yet'}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 640 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-3 font-normal">Subassembly</th>
                  <th className="px-3 py-3 font-normal">Drawing no.</th>
                  <th className="px-3 py-3 font-normal text-right">Materials</th>
                  <th className="px-3 py-3 font-normal">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} onClick={() => nav(`/dashboard/master-data/bom/${s.id}`)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-2.5 font-medium text-gray-800">{s.name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{s.drawing_no}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{s.item_count}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(s.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
