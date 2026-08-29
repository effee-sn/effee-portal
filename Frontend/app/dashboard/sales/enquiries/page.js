'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { ENQUIRY_TYPES, ALL_STAGES, STAGE_STYLE, TYPE_LABEL, TEMPERATURE_STYLE, stagesForType, formatINR } from '@/lib/salesOptions';
import EnquiryCustomerContact from '@/components/EnquiryCustomerContact';

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

// ── Create modal ──────────────────────────────────────────────────────────────
function EnquiryModal({ users, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '', customer_id: '', contact_id: '', owner_id: '', enquiry_type: 'INCOMING',
    stage: 'NEW', expected_value: '', expected_close: '', description: '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const change = (e) => {
    const { name, value } = e.target;
    setForm((f) => {
      const next = { ...f, [name]: value };
      // A generated enquiry can't sit at Contacted — snap it back if needed.
      if (name === 'enquiry_type' && value === 'GENERATED' && f.stage === 'CONTACTED') next.stage = 'NEW';
      return next;
    });
    setError('');
  };

  const setCustomerContact = ({ customer_id, contact_id }) =>
    setForm((f) => ({ ...f, customer_id, contact_id }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await apiPost('/sales/enquiries', form);
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
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <div>
            <label className={label}>Title<span className="text-red-500"> *</span></label>
            <input name="title" value={form.title} onChange={change} required placeholder="CNC spindle replacement" className="ams-input" />
          </div>
          <EnquiryCustomerContact onChange={setCustomerContact} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Owner <span className="text-gray-400 font-normal normal-case">(defaults to you)</span></label>
              <select name="owner_id" value={form.owner_id} onChange={change} className="ams-input">
                <option value="">— Me —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Type</label>
              <select name="enquiry_type" value={form.enquiry_type} onChange={change} className="ams-input">
                {ENQUIRY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Stage</label>
              <select name="stage" value={form.stage} onChange={change} className="ams-input">
                {stagesForType(form.enquiry_type).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Expected Value (₹)</label>
              <input name="expected_value" type="number" min="0" step="0.01" value={form.expected_value} onChange={change} placeholder="250000" className="ams-input" />
            </div>
            <div>
              <label className={label}>Expected Close</label>
              <input name="expected_close" type="date" value={form.expected_close} onChange={change} className="ams-input" />
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
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EnquiriesPage() {
  useAuth();
  const router = useRouter();
  const { me, can, loading: permLoading } = usePermissions();

  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [stage, setStage]     = useState('');
  const [loading, setLoading] = useState(true);
  const [users, setUsers]     = useState([]);
  const [showCreate, setShowCreate] = useState(false);

  const limit = 10;

  const canView   = me?.is_system || can('SALES_VIEW');
  const canCreate = me?.is_system || can('SALES_CREATE');

  const fetchRows = async (p = page, s = search, st = stage) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(p), limit: String(limit), search: s });
      if (st) q.set('stage', st);
      const res = await apiGet(`/sales/enquiries?${q.toString()}`);
      setRows(res.data); setTotal(res.meta.pagination.total);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!permLoading && canView) {
      fetchRows();
      apiGet('/lookup/users').then(setUsers).catch(() => {});
    } else if (!permLoading) setLoading(false);
  }, [permLoading]);

  const onSearch = (e) => { e.preventDefault(); setPage(1); fetchRows(1, search, stage); };
  const onStage = (v) => { setStage(v); setPage(1); fetchRows(1, search, v); };
  const goPage = (delta) => { const p = page + delta; setPage(p); fetchRows(p, search, stage); };
  const onSaved = () => { setPage(1); setSearch(''); setStage(''); fetchRows(1, '', ''); };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  if (permLoading || loading) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={6} rows={6} />
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
            <div className="py-20 text-center text-sm text-gray-400">No enquiries {stage || search ? 'match your filters' : 'yet'}.</div>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: 820 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 sticky top-0 bg-white z-10">
                  <th className="px-3 py-3 font-normal">Ref</th>
                  <th className="px-3 py-3 font-normal">Title</th>
                  <th className="px-3 py-3 font-normal">Customer</th>
                  <th className="px-3 py-3 font-normal">Stage</th>
                  <th className="px-3 py-3 font-normal">Owner</th>
                  <th className="px-3 py-3 font-normal text-right">Value</th>
                  <th className="px-3 py-3 font-normal text-center">Acts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} onClick={() => router.push(`/dashboard/sales/enquiries/${e.id}`)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{e.ref_no}</td>
                    <td className="px-3 py-3 font-medium text-gray-800">
                      {e.title}
                      <span className="block text-xs text-gray-400 font-normal">{TYPE_LABEL[e.enquiry_type] || e.enquiry_type}</span>
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
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-600">{e.owner?.name || '—'}</td>
                    <td className="px-3 py-3 text-gray-700 tabular-nums text-right whitespace-nowrap">
                      {formatINR(e.stage === 'WON' ? e.order_value : e.expected_value)}
                    </td>
                    <td className="px-3 py-3 text-gray-500 tabular-nums text-center">{e._count?.activities ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && <EnquiryModal users={users} onClose={() => setShowCreate(false)} onSaved={onSaved} />}
    </div>
  );
}
