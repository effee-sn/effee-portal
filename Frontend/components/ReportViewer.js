'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiGet, downloadFile } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { REPORT_PRESETS, presetRange } from '@/lib/periods';
import { ALL_STAGES, ENQUIRY_TYPES } from '@/lib/salesOptions';
import useSalesConfig from '@/lib/useSalesConfig';
import PeriodPicker from '@/components/PeriodPicker';
import { TableSkeleton } from '@/components/Skeleton';

/**
 * Renders any MIS report from `GET /reports/:module/:key`: filters, a sortable
 * table with a totals row, Excel / CSV export and a print view. The report's
 * column metadata (type, link, hint) drives all formatting, so a new report
 * needs no new UI.
 */

const fmtDate = (v) => {
  if (!v) return '';
  const [y, m, d] = String(v).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtNum = (v, digits = 0) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function formatCell(col, value, row) {
  if (value === null || value === undefined || value === '') return '';
  switch (col.type) {
    case 'date':   return fmtDate(value);
    case 'int':    return typeof value === 'number' ? fmtNum(value) : value;
    case 'inr':    return `₹${fmtNum(value, 2)}`;
    case 'amount': return formatMoney(value, row?.currency || 'INR');
    case 'pct':    return `${fmtNum(value, 1)}%`;
    case 'rate':   return fmtNum(value, 4);
    default:       return String(value);
  }
}

const NUMERIC = new Set(['int', 'inr', 'amount', 'pct', 'rate']);

const select = 'text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white cursor-pointer';

export default function ReportViewer({ module, reportKey, canExport }) {
  const [preset, setPreset] = useState('fy');
  const [range, setRange] = useState(() => presetRange('fy'));
  const [filters, setFilters] = useState({ owner_id: '', enquiry_type: '', application_id: '', customer_id: '', stage: '' });
  const [sort, setSort] = useState(null); // { key, dir }

  const [data, setData] = useState(null);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');

  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState(null); // null = not permitted / not loaded
  const [company, setCompany] = useState('');
  const salesConfig = useSalesConfig();

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    return p.toString();
  }, [range, filters]);
  const url = `/reports/${module}/${reportKey}?${query}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet(url);
        if (cancelled) return;
        setData(res.data);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load the report.');
      } finally {
        if (!cancelled) setLoadedUrl(url);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  // Filter options + company name for the print header (best effort).
  useEffect(() => {
    let cancelled = false;
    apiGet('/lookup/users').then((u) => { if (!cancelled) setUsers(Array.isArray(u) ? u : u?.data || []); }).catch(() => {});
    apiGet('/customers/options').then((r) => { if (!cancelled) setCustomers(r.data || []); }).catch(() => {});
    apiGet('/settings').then((s) => { if (!cancelled) setCompany((s?.data ?? s)?.company_name || ''); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const supports = (name) => data?.filters_supported?.includes(name);
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const anyFilter = Object.values(filters).some(Boolean);
  const refreshing = loadedUrl !== url;

  const rows = useMemo(() => {
    if (!data) return [];
    if (!sort) return data.rows;
    const col = data.columns.find((c) => c.key === sort.key);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...data.rows].sort((a, b) => {
      const x = a[sort.key]; const y = b[sort.key];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (NUMERIC.has(col?.type)) return (Number(x) - Number(y)) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [data, sort]);

  const toggleSort = (key) => setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

  const exportAs = async (format) => {
    setExporting(format); setError('');
    try {
      const day = (v) => (v || '').replace(/-/g, '');
      await downloadFile(`/reports/${module}/${reportKey}/export?${query}&format=${format}`,
        `${module}-${reportKey}-${day(range.from)}-${day(range.to)}.${format}`);
    } catch (err) { setError(err.message); }
    finally { setExporting(''); }
  };

  return (
    <div className="space-y-4 p-4 pb-10 print:p-0">
      {/* Print header */}
      <div className="hidden print:block mb-2">
        {company && <p className="text-sm font-semibold">{company}</p>}
        <p className="text-lg font-semibold">{data?.title}</p>
        <p className="text-xs">{data?.filters}</p>
        <p className="text-xs">Generated {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      </div>

      <header className="space-y-3 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div className="min-w-0">
            <Link href="/dashboard/reports" className="text-xs text-gray-500 hover:text-gray-800 hover:underline">← All reports</Link>
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mt-0.5">{data?.title || 'Report'}</h1>
            {data?.description && <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">{data.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canExport && (
              <>
                <button type="button" onClick={() => exportAs('xlsx')} disabled={!data || Boolean(exporting)}
                  className="px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: 'var(--ams-primary)' }}>
                  {exporting === 'xlsx' ? 'Exporting…' : 'Excel'}
                </button>
                <button type="button" onClick={() => exportAs('csv')} disabled={!data || Boolean(exporting)}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-50">
                  {exporting === 'csv' ? 'Exporting…' : 'CSV'}
                </button>
              </>
            )}
            <button type="button" onClick={() => window.print()} disabled={!data}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-50">
              Print / PDF
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker presets={REPORT_PRESETS} preset={preset} range={range}
            onChange={(next) => { setPreset(next.preset); setRange(next.range); }} />

          {supports('owner') && (
            <select value={filters.owner_id} onChange={(e) => setFilter('owner_id', e.target.value)} aria-label="Owner" className={select}>
              <option value="">All owners</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {supports('type') && (
            <select value={filters.enquiry_type} onChange={(e) => setFilter('enquiry_type', e.target.value)} aria-label="Type" className={select}>
              <option value="">All types</option>
              {ENQUIRY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          )}
          {supports('application') && salesConfig?.applications?.length > 0 && (
            <select value={filters.application_id} onChange={(e) => setFilter('application_id', e.target.value)} aria-label="Application" className={select}>
              <option value="">All applications</option>
              {salesConfig.applications.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {supports('customer') && customers?.length > 0 && (
            <select value={filters.customer_id} onChange={(e) => setFilter('customer_id', e.target.value)} aria-label="Customer" className={`${select} max-w-[14rem]`}>
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {supports('stage') && (
            <select value={filters.stage} onChange={(e) => setFilter('stage', e.target.value)} aria-label="Stage" className={select}>
              <option value="">All stages</option>
              {ALL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
          {anyFilter && (
            <button type="button" onClick={() => setFilters({ owner_id: '', enquiry_type: '', application_id: '', customer_id: '', stage: '' })}
              className="text-xs font-medium text-[var(--ams-primary)] hover:underline cursor-pointer">Clear filters</button>
          )}
        </div>
        {data && (
          <p className="text-xs text-gray-500">
            {data.filters} · {data.rows.length} {data.rows.length === 1 ? 'row' : 'rows'}
            {refreshing && <span className="ml-2 text-gray-400">Updating…</span>}
          </p>
        )}
      </header>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 print:hidden">{error}</p>}

      {!data ? (error ? null : <TableSkeleton cols={6} rows={8} />) : (
        <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden transition-opacity print:border-0 ${refreshing ? 'opacity-60' : ''}`}>
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-sm print:text-[10px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
                  {data.columns.map((c) => (
                    <th key={c.key} scope="col" title={c.hint}
                      className={`px-3 py-2.5 font-medium whitespace-nowrap ${NUMERIC.has(c.type) ? 'text-right' : 'text-left'}`}>
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 cursor-pointer hover:text-gray-900 print:pointer-events-none">
                        {c.label}
                        {sort?.key === c.key && <span aria-hidden="true">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                        {c.hint && <span className="text-gray-400 print:hidden" aria-hidden="true">ⓘ</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr><td colSpan={data.columns.length} className="px-3 py-10 text-center text-gray-400">No data for these filters.</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={`${r.id ?? ''}-${i}`} className="hover:bg-gray-50">
                    {data.columns.map((c) => (
                      <td key={c.key} className={`px-3 py-2 ${NUMERIC.has(c.type) ? 'text-right tabular-nums whitespace-nowrap' : ''} ${c.type === 'date' ? 'whitespace-nowrap' : ''}`}>
                        {c.link === 'enquiry' && r.id
                          ? <Link href={`/dashboard/sales/enquiries/${r.id}`} className="font-mono text-xs text-blue-600 hover:underline">{formatCell(c, r[c.key], r)}</Link>
                          : formatCell(c, r[c.key], r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {data.totals && rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-900">
                    {data.columns.map((c) => (
                      <td key={c.key} className={`px-3 py-2.5 ${NUMERIC.has(c.type) ? 'text-right tabular-nums whitespace-nowrap' : 'whitespace-nowrap'}`}>
                        {formatCell(c, data.totals[c.key], null)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {data.notes?.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500">{data.notes.join(' ')}</div>
          )}
        </div>
      )}
    </div>
  );
}
