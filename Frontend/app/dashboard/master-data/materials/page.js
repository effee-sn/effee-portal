'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, downloadFile } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import usePageSize from '@/lib/usePageSize';
import PageSizeSelect from '@/components/PageSizeSelect';
import { MATERIAL_TYPES, MATERIAL_TYPE_LABEL } from '@/lib/materialOptions';

/**
 * Master Data → Materials. The list, with search and filters, and an Excel
 * export of what's filtered; new materials are added in bulk on /new; a row
 * opens the material's page (details, where it's used, history). The IMM code
 * is generated from the chosen prefix and never changes.
 */

export default function MaterialsPage() {
  useAuth();
  const router = useRouter();
  const { me, can, loading: permLoading } = usePermissions();
  const has = (code) => me?.is_system || can(code);
  const canView = has('MATERIAL_VIEW');
  const canCreate = has('MATERIAL_CREATE');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [prefixId, setPrefixId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [kind, setKind] = useState(''); // '' | 'part' | 'subassembly'
  const [prefixes, setPrefixes] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [limit, setLimit, limitRef] = usePageSize('materials', 20);

  /** The current search and filters as a query string. */
  const filterQuery = (s = search, t = type, px = prefixId, u = unitId, k = kind) => {
    const q = new URLSearchParams({ search: s });
    if (k) q.set('kind', k);
    if (t) q.set('material_type', t);
    if (px) q.set('prefix_id', px);
    if (u) q.set('uom_id', u);
    return q;
  };

  const fetchRows = async (p = page, s = search, t = type, px = prefixId, u = unitId, k = kind) => {
    setLoading(true);
    try {
      const q = filterQuery(s, t, px, u, k);
      q.set('page', String(p)); q.set('limit', String(limitRef.current));
      const res = await apiGet(`/materials?${q.toString()}`);
      setRows(res.data); setTotal(res.meta.pagination.total);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) {
      fetchRows(1);
      apiGet('/materials/prefixes', { silent: true }).then((r) => setPrefixes(r.data || [])).catch(() => {});
      apiGet('/materials/units', { silent: true }).then((r) => setUnits(r.data || [])).catch(() => {});
    } else if (!permLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); fetchRows(1, search); };
  const onType = (v) => { setType(v); setPage(1); fetchRows(1, search, v); };
  const onPrefix = (v) => { setPrefixId(v); setPage(1); fetchRows(1, search, type, v); };
  const onUnit = (v) => { setUnitId(v); setPage(1); fetchRows(1, search, type, prefixId, v); };
  const onKind = (v) => { setKind(v); setPage(1); fetchRows(1, search, type, prefixId, unitId, v); };
  const goPage = (d) => { const p = page + d; setPage(p); fetchRows(p); };
  const onPageSize = (n) => { setLimit(n); setPage(1); fetchRows(1); };
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const exportXlsx = async () => {
    setExporting(true);
    setExportError('');
    try { await downloadFile(`/materials/export?${filterQuery().toString()}`, `materials-${new Date().toISOString().slice(0, 10)}.xlsx`); }
    catch (e) { setExportError(e.message); }
    finally { setExporting(false); }
  };

  if (permLoading) return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={6} rows={6} /></div>;
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view materials.</p>
      </div>
    );
  }

  const selectCls = 'py-1.5 px-2 text-sm text-gray-700 border border-gray-300 rounded bg-white outline-none cursor-pointer';

  return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap">
        {canCreate && (
          <Link href="/dashboard/master-data/materials/new"
            className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm" style={{ backgroundColor: 'var(--ams-primary)' }}>New</Link>
        )}
        <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Materials</span>
        <div className="flex-1" />
        <select value={kind} onChange={(e) => onKind(e.target.value)} aria-label="Parts or subassemblies" className={selectCls}>
          <option value="">Parts &amp; subassemblies</option>
          <option value="part">Parts only</option>
          <option value="subassembly">Subassemblies only</option>
        </select>
        <select value={type} onChange={(e) => onType(e.target.value)} aria-label="Material type" className={selectCls}>
          <option value="">All types</option>
          {MATERIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={prefixId} onChange={(e) => onPrefix(e.target.value)} aria-label="Prefix" className={selectCls}>
          <option value="">All prefixes</option>
          {prefixes.map((p) => <option key={p.id} value={p.id}>{p.prefix}</option>)}
        </select>
        <select value={unitId} onChange={(e) => onUnit(e.target.value)} aria-label="Unit" className={selectCls}>
          <option value="">All units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
        </select>
        <form onSubmit={onSearch} className="flex items-center border border-gray-300 rounded overflow-hidden min-w-[220px]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, name, drawing, material…"
            className="flex-1 min-w-0 py-1.5 px-2.5 text-sm text-gray-700 outline-none bg-transparent" />
        </form>
        <button type="button" onClick={exportXlsx} disabled={exporting || total === 0} className="btn-secondary px-3 py-1.5"
          title="Download the filtered list as an Excel file">
          {exporting ? 'Exporting…' : 'Excel'}
        </button>
        <div className="flex items-center gap-0.5 shrink-0 text-sm text-gray-500">
          <PageSizeSelect value={limit} onChange={onPageSize} />
          <span className="px-1 tabular-nums">{total === 0 ? '0' : `${from}-${to}`} / {total}</span>
          <button onClick={() => goPage(-1)} disabled={page === 1} aria-label="Previous page"
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">‹</button>
          <button onClick={() => goPage(1)} disabled={page * limit >= total} aria-label="Next page"
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">›</button>
        </div>
      </div>

      {exportError && <p className="mx-3 mt-3 px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{exportError}</p>}

      {loading ? <TableSkeleton cols={6} rows={6} /> : rows.length === 0 ? (
        <p className="py-14 text-center text-sm text-gray-400">
          No materials {search || type || prefixId || unitId || kind ? 'match your filters' : 'yet'}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 960 }}>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-3 font-normal">IMM code</th>
                <th className="px-3 py-3 font-normal">Item name</th>
                <th className="px-3 py-3 font-normal">Drawing no.</th>
                <th className="px-3 py-3 font-normal">Type</th>
                <th className="px-3 py-3 font-normal">Material</th>
                <th className="px-3 py-3 font-normal">Unit</th>
                <th className="px-3 py-3 font-normal">Description</th>
                <th className="px-3 py-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} onClick={() => router.push(`/dashboard/master-data/materials/${m.id}`)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold whitespace-nowrap">
                    <Link href={`/dashboard/master-data/materials/${m.id}`} onClick={(e) => e.stopPropagation()} className="text-gray-800 hover:underline">{m.imm_code}</Link>
                  </td>
                  <td className="px-3 py-2.5 text-gray-800">
                    {m.item_name}
                    {m.subassembly && <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">Subassembly</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{m.drawing_no || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{MATERIAL_TYPE_LABEL[m.material_type]}</td>
                  <td className="px-3 py-2.5 text-gray-600">{m.material}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{m.uom?.code}</td>
                  <td className="px-3 py-2.5 text-gray-500 max-w-xs truncate" title={m.description}>{m.description}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${m.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
