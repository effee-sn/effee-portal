'use client';

import { useEffect, useState } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { ALL_STAGES, STAGE_STYLE, TYPE_LABEL, TEMPERATURE_STYLE, formatINR, isAging, stageAgeDays } from '@/lib/salesOptions';
import EnquiryCustomerContact from '@/components/EnquiryCustomerContact';
import useNav from '@/lib/useNav';
import useSalesConfig from '@/lib/useSalesConfig';
import useCurrencies, { formatMoney } from '@/lib/money';

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function StageBadge({ stage }) {
  const s = STAGE_STYLE[stage] || { label: stage, color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </span>
  );
}

// ── Create: origin cards → slim form ──────────────────────────────────────────
const ORIGIN_CARDS = [
  { value: 'GENERATED', icon: '🧭', title: 'Generated', desc: 'Site visit by field sales — you generated this opportunity.' },
  { value: 'INCOMING',  icon: '📥', title: 'Incoming',  desc: 'Inbound enquiry — came in without field-sales contact.' },
];

function EnquiryModal({ onClose, onSaved }) {
  const config = useSalesConfig();
  const activeApps = (config?.applications || []).filter((a) => a.is_active);
  const [type, setType] = useState(null); // null = pick origin; else show the form
  const currencies = useCurrencies();
  const [form, setForm] = useState({
    title: '', customer_id: '', contact_id: '', application_id: '', currency_code: '', expected_value: '', description: '',
  });
  // Until the user picks one, the form follows the default currency (Master Data → Currencies).
  const currencyCode = form.currency_code || currencies?.defaultCode || 'INR';
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const change = (e) => { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); setError(''); };
  const setCustomerContact = ({ customer_id, contact_id }) => setForm((f) => ({ ...f, customer_id, contact_id }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      // Stage is automated to New; owner defaults to the creator server-side.
      const res = await apiPost('/sales/enquiries', { ...form, currency_code: currencyCode, enquiry_type: type, stage: 'NEW' });
      onSaved(res.data);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">New Enquiry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {!type ? (
          <div className="px-6 py-6">
            <p className="text-sm text-gray-500 mb-4">How did this enquiry originate?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ORIGIN_CARDS.map((c) => (
                <button key={c.value} type="button" onClick={() => setType(c.value)}
                  className="text-left border border-gray-200 rounded-lg p-5 hover:border-blue-400 hover:bg-blue-50/40 transition cursor-pointer">
                  <div className="text-3xl mb-2">{c.icon}</div>
                  <div className="text-sm font-semibold text-gray-800">{c.title}</div>
                  <div className="text-xs text-gray-500 mt-1">{c.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
            {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Type</span>
              <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-blue-50 text-blue-700">
                {TYPE_LABEL[type] || type}
              </span>
              <button type="button" onClick={() => setType(null)} className="text-xs text-gray-400 hover:text-blue-600 cursor-pointer">change</button>
            </div>

            <div>
              <label className={label}>Title<span className="text-red-500"> *</span></label>
              <input name="title" value={form.title} onChange={change} required placeholder="CNC spindle replacement" className="ams-input" />
            </div>

            <EnquiryCustomerContact onChange={setCustomerContact} />

            <div>
              <label className={label}>Application{activeApps.length > 0 && <span className="text-red-500"> *</span>}</label>
              <select name="application_id" value={form.application_id} onChange={change} required={activeApps.length > 0}
                disabled={!config} className="ams-input">
                <option value="">{config ? (activeApps.length ? '— Select application —' : 'No applications configured') : 'Loading…'}</option>
                {activeApps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={label}>Currency</label>
                <select name="currency_code" value={currencyCode} onChange={change} disabled={!currencies} className="ams-input">
                  {(currencies?.list || [{ code: 'INR', name: 'Indian Rupee' }]).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Expected Value ({currencyCode})</label>
                <input name="expected_value" type="number" min="0" step="0.01" value={form.expected_value} onChange={change}
                  placeholder="Optional" className="ams-input" />
              </div>
            </div>

            <div>
              <label className={label}>Description</label>
              <textarea name="description" value={form.description} onChange={change} rows={3} className="ams-input resize-none" />
            </div>

            <div className="flex gap-3 pt-2 pb-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Create'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EnquiriesPage() {
  useAuth();
  const nav = useNav();
  const { me, can, loading: permLoading } = usePermissions();

  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [stage, setStage]     = useState('');
  const [appId, setAppId]     = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const limit = 10;

  const canView   = me?.is_system || can('SALES_VIEW');
  const canCreate = me?.is_system || can('SALES_CREATE');
  const config    = useSalesConfig();

  const fetchRows = async (p = page, s = search, st = stage, app = appId) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(p), limit: String(limit), search: s });
      if (st) q.set('stage', st);
      if (app) q.set('application_id', app);
      const res = await apiGet(`/sales/enquiries?${q.toString()}`);
      setRows(res.data); setTotal(res.meta.pagination.total);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) {
      // A stage can arrive in the URL (e.g. from the dashboard pipeline).
      const fromUrl = new URLSearchParams(window.location.search).get('stage') || '';
      if (fromUrl) setStage(fromUrl);
      fetchRows(1, search, fromUrl);
    } else if (!permLoading) setLoading(false);
  }, [permLoading]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); fetchRows(1, search, stage); };
  const onStage = (v) => { setStage(v); setPage(1); fetchRows(1, search, v); };
  const onApp = (v) => { setAppId(v); setPage(1); fetchRows(1, search, stage, v); };
  const goPage = (delta) => { const p = page + delta; setPage(p); fetchRows(p, search, stage); };
  const onSaved = () => { setPage(1); setSearch(''); setStage(''); setAppId(''); fetchRows(1, '', '', ''); };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  if (permLoading || loading) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={7} rows={6} />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view enquiries.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        {/* Control panel */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap bg-white">
          {canCreate && (
            <button onClick={() => setShowCreate(true)}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              New
            </button>
          )}
          <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Enquiries</span>
          <select value={stage} onChange={(e) => onStage(e.target.value)}
            className="shrink-0 text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white cursor-pointer">
            <option value="">All stages</option>
            {ALL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {config?.applications?.length > 0 && (
            <select value={appId} onChange={(e) => onApp(e.target.value)} aria-label="Application"
              className="shrink-0 text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white cursor-pointer">
              <option value="">All applications</option>
              {config.applications.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_active ? '' : ' (inactive)'}</option>)}
            </select>
          )}
          <div className="flex-1 min-w-0" />
          <form onSubmit={onSearch} className="shrink-0 flex items-center border border-gray-300 rounded bg-white overflow-hidden"
            style={{ minWidth: 220 }}>
            <span className="px-2.5 text-gray-400 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ref or title…"
              className="flex-1 min-w-0 py-1.5 pr-2.5 text-sm text-gray-700 outline-none bg-transparent" />
          </form>
          <div className="flex items-center gap-0.5 shrink-0 text-sm text-gray-500">
            <span className="px-1 tabular-nums">{total === 0 ? '0' : `${from}-${to}`} / {total}</span>
            <button onClick={() => goPage(-1)} disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={() => goPage(1)} disabled={page * limit >= total}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">No enquiries {stage || appId || search ? 'match your filters' : 'yet'}.</div>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: 880 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 sticky top-0 bg-white z-10">
                  <th className="px-3 py-3 font-normal">Ref</th>
                  <th className="px-3 py-3 font-normal">Title</th>
                  <th className="px-3 py-3 font-normal">Customer</th>
                  <th className="px-3 py-3 font-normal">Stage</th>
                  <th className="px-3 py-3 font-normal text-right" title="Win probability at this stage">Prob.</th>
                  <th className="px-3 py-3 font-normal">Owner</th>
                  <th className="px-3 py-3 font-normal text-right">Value</th>
                  <th className="px-3 py-3 font-normal text-center">Acts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} onClick={() => nav(`/dashboard/sales/enquiries/${e.id}`)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{e.ref_no}</td>
                    <td className="px-3 py-3 font-medium text-gray-800">
                      {e.title}
                      <span className="block text-xs text-gray-400 font-normal">
                        {TYPE_LABEL[e.enquiry_type] || e.enquiry_type}{e.application && ` · ${e.application.name}`}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-600">{e.customer?.name || '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <StageBadge stage={e.stage} />
                        {e.current_temperature && TEMPERATURE_STYLE[e.current_temperature] && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                            style={{ color: TEMPERATURE_STYLE[e.current_temperature].color, backgroundColor: TEMPERATURE_STYLE[e.current_temperature].bg }}>
                            {TEMPERATURE_STYLE[e.current_temperature].label}
                          </span>
                        )}
                        {isAging(e.stage, e.stage_since) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700"
                            title={`${stageAgeDays(e.stage_since)} days in stage`}>⚠ {stageAgeDays(e.stage_since)}d</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-600 tabular-nums text-right">
                      {config?.probability?.[e.stage] !== undefined ? `${config.probability[e.stage]}%` : '—'}
                    </td>
                    <td className="px-3 py-3 text-gray-600">{e.owner?.name || '—'}</td>
                    <td className="px-3 py-3 text-gray-700 tabular-nums text-right whitespace-nowrap"
                      title={e.currency_code !== 'INR' ? `≈ ${formatINR(e.stage === 'WON' ? e.order_value_inr : e.expected_value_inr)}` : undefined}>
                      {formatMoney(e.stage === 'WON' ? e.order_value : e.expected_value, e.currency_code, e.currency?.symbol)}
                    </td>
                    <td className="px-3 py-3 text-gray-500 tabular-nums text-center">{e._count?.activities ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && <EnquiryModal onClose={() => setShowCreate(false)} onSaved={onSaved} />}
    </div>
  );
}
