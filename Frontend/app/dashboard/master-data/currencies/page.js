'use client';

import { useEffect, useMemo, useState } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { ListSkeleton, TableSkeleton } from '@/components/Skeleton';
import { invalidateCurrencies } from '@/lib/money';
import { isoCurrencies } from '@/lib/currencyCatalog';
import SearchableSelect from '@/components/SearchableSelect';

/**
 * Master Data → Currencies. Currencies with manually entered exchange rates
 * ("₹ for 1 unit"). Every rate change is a new history entry — nothing is
 * overwritten — and the entry with the latest effective date is current.
 * INR is the base currency (always 1) and can't be deleted. One currency is
 * the *default* new records start in (INR at first); totals are always in INR.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// DATE columns arrive as UTC midnight — format in UTC so the day never shifts.
const fmtDay = (iso) => (iso
  ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const fmtRate = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;

function Modal({ title, onClose, children, width = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className={`w-full ${width} bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ErrorBox = ({ error }) => (error
  ? <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div> : null);

/** Rate + effective date + note — shared by "new currency" and "update rate". */
function RateFields({ form, change, code }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Rate<span className="text-red-500"> *</span></label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500 whitespace-nowrap">1 {code || '…'} = ₹</span>
            <input name="rate" type="number" min="0" step="any" inputMode="decimal" value={form.rate} onChange={change}
              required placeholder="84.00" className="ams-input" />
          </div>
        </div>
        <div>
          <label className={label}>Effective from</label>
          <input name="effective_from" type="date" max={todayISO()} value={form.effective_from} onChange={change} className="ams-input" />
        </div>
      </div>
      <div>
        <label className={label}>Note</label>
        <input name="note" value={form.note} onChange={change} maxLength={191} placeholder="e.g. Q3 average" className="ams-input" />
      </div>
    </>
  );
}

function NewCurrencyModal({ existingCodes, onClose, onSaved }) {
  const [form, setForm] = useState({ code: '', name: '', symbol: '', rate: '', effective_from: todayISO(), note: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Every ISO currency not added yet; search matches code or name.
  const options = useMemo(() => isoCurrencies()
    .filter((c) => !existingCodes.includes(c.code))
    .map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, sub: c.symbol !== c.code ? c.symbol : '' })), [existingCodes]);

  const pickCurrency = (code) => {
    const c = isoCurrencies().find((x) => x.code === code);
    setForm((f) => ({ ...f, code, name: c?.name || '', symbol: c?.symbol || code }));
    setError('');
  };
  const change = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setError('');
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.code) { setError('Choose a currency'); return; }
    setSaving(true); setError('');
    try { onSaved((await apiPost('/currencies', form)).data); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return (
    <Modal title="New currency" onClose={onClose}>
      {/* No scroll container here: the short form lets the currency search list overflow instead of being clipped. */}
      <form onSubmit={submit} className="px-6 py-4 space-y-4">
        <ErrorBox error={error} />
        <div>
          <label className={label}>Currency<span className="text-red-500"> *</span></label>
          <SearchableSelect options={options} value={form.code} onChange={pickCurrency}
            placeholder="Search by code or name — e.g. USD, Dirham" />
        </div>
        {form.code && (
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <div>
              <label className={label}>Name</label>
              <input name="name" value={form.name} onChange={change} required maxLength={80} className="ams-input" />
            </div>
            <div>
              <label className={label}>Symbol</label>
              <input name="symbol" value={form.symbol} onChange={change} required maxLength={8} className="ams-input" />
            </div>
          </div>
        )}
        <RateFields form={form} change={change} code={form.code} />
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditCurrencyModal({ currency, onClose, onSaved }) {
  const [form, setForm] = useState({ name: currency.name, symbol: currency.symbol, is_active: currency.is_active });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try { onSaved((await apiPut(`/currencies/${currency.code}`, form)).data); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return (
    <Modal title={`Edit ${currency.code}`} onClose={onClose}>
      <form onSubmit={submit} className="px-6 py-4 space-y-4">
        <ErrorBox error={error} />
        <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
          <div>
            <label className={label}>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} className="ams-input" />
          </div>
          <div>
            <label className={label}>Symbol</label>
            <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} required maxLength={8} className="ams-input" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Active <span className="text-xs text-gray-400">(inactive currencies can&apos;t be picked on new records)</span>
        </label>
        <p className="text-xs text-gray-500">To change the rate, use <span className="font-medium">Update rate</span> — every rate is kept in the history.</p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Rate history + "update rate" form for one currency. */
function RatesModal({ code, canEdit, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ rate: '', effective_from: todayISO(), note: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const res = await apiGet(`/currencies/${code}`); if (!cancelled) setDetail(res.data); }
      catch (err) { if (!cancelled) setError(err.message); }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const refresh = async () => {
    const res = await apiGet(`/currencies/${code}`);
    setDetail(res.data);
    onChanged(res.data);
  };

  const change = (e) => { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); setError(''); };

  const addRate = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiPost(`/currencies/${code}/rates`, form);
      setForm({ rate: '', effective_from: todayISO(), note: '' });
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const removeRate = async (h) => {
    if (!window.confirm(`Remove the rate ${fmtRate(h.rate)} effective ${fmtDay(h.effective_from)}? Use this only for a wrongly entered rate.`)) return;
    setSaving(true); setError('');
    try { await apiDelete(`/currencies/${code}/rates/${h.id}`); await refresh(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const currentId = detail?.history?.[0]?.id;

  return (
    <Modal title={detail ? `${detail.code} · ${detail.name}` : code} onClose={onClose} width="max-w-2xl">
      <div className="overflow-y-auto px-6 py-4 space-y-5">
        <ErrorBox error={error} />
        {!detail ? <ListSkeleton rows={3} /> : (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <p className="text-2xl font-semibold text-gray-900 tabular-nums">1 {detail.code} = {fmtRate(detail.rate)}</p>
              <p className="text-sm text-gray-500">current · effective {fmtDay(detail.rate_effective_from)}</p>
            </div>

            {canEdit && !detail.is_base && (
              <form onSubmit={addRate} className="rounded-lg border border-gray-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800">Update rate</p>
                <RateFields form={form} change={change} code={detail.code} />
                <div className="flex justify-end">
                  <button type="submit" disabled={saving} className="btn-primary py-1.5 px-4">{saving ? 'Saving…' : 'Add rate'}</button>
                </div>
              </form>
            )}

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Rate history</h3>
              {detail.is_base ? (
                <p className="text-sm text-gray-500">INR is the base currency — always ₹1.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-3 font-normal">Effective from</th>
                      <th className="py-2 pr-3 font-normal text-right">Rate</th>
                      <th className="py-2 pr-3 font-normal">Note</th>
                      <th className="py-2 pr-3 font-normal">Entered</th>
                      {canEdit && <th className="py-2 w-14"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.history.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2 pr-3 whitespace-nowrap text-gray-700">
                          {fmtDay(h.effective_from)}
                          {h.id === currentId && (
                            <span className="ml-2 text-[10px] font-semibold text-[var(--ams-primary)] bg-[var(--ams-primary-mid)] rounded px-1.5 py-0.5">Current</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums font-medium text-gray-900">{fmtRate(h.rate)}</td>
                        <td className="py-2 pr-3 text-gray-600">{h.note || '—'}</td>
                        <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                          {h.entered_by || '—'} · {new Date(h.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        {canEdit && (
                          <td className="py-2 text-right">
                            {detail.history.length > 1 && (
                              <button onClick={() => removeRate(h)} disabled={saving}
                                className="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CurrenciesPage() {
  useAuth();
  const { me, can, loading: permLoading } = usePermissions();
  const has = (code) => me?.is_system || can(code);
  const canView = has('CURRENCY_VIEW');
  const canCreate = has('CURRENCY_CREATE');
  const canEdit = has('CURRENCY_EDIT');
  const canDelete = has('CURRENCY_DELETE');

  const [rows, setRows]   = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (permLoading || !canView) return undefined;
    let cancelled = false;
    (async () => {
      try { const res = await apiGet('/currencies'); if (!cancelled) setRows(res.data); }
      catch (err) { if (!cancelled) { setRows([]); setError(err.message); } }
    })();
    return () => { cancelled = true; };
  }, [permLoading, canView]);

  const upsert = (c) => { invalidateCurrencies(); setRows((prev) => {
    const next = prev.some((r) => r.code === c.code) ? prev.map((r) => (r.code === c.code ? { ...r, ...c } : r)) : [...prev, c];
    return next.sort((a, b) => Number(b.is_base) - Number(a.is_base) || a.code.localeCompare(b.code));
  }); };

  const makeDefault = async (c) => {
    setError('');
    try {
      const res = await apiPost(`/currencies/${c.code}/default`, {});
      invalidateCurrencies();
      // Exactly one default: clear the flag everywhere else.
      setRows((prev) => prev.map((r) => (r.code === c.code ? { ...r, ...res.data } : { ...r, is_default: false })));
    } catch (err) { setError(err.message); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.code} (${c.name}) and its rate history? This cannot be undone.`)) return;
    setError('');
    try { await apiDelete(`/currencies/${c.code}`); invalidateCurrencies(); setRows((prev) => prev.filter((r) => r.code !== c.code)); }
    catch (err) { setError(err.message); }
  };

  if (permLoading || (canView && !rows)) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={6} rows={4} />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view currencies.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap">
          {canCreate && (
            <button onClick={() => setModal({ type: 'new' })}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer"
              style={{ backgroundColor: 'var(--ams-primary)' }}>New</button>
          )}
          <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Currencies</span>
          <span className="text-xs text-gray-400">Rates are ₹ for 1 unit · totals are always in ₹ · new records start in the Default currency</span>
        </div>

        {error && <div className="mx-3 mt-3"><ErrorBox error={error} /></div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 760 }}>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-3 font-normal">Currency</th>
                <th className="px-3 py-3 font-normal text-right">Current rate</th>
                <th className="px-3 py-3 font-normal">Effective from</th>
                <th className="px-3 py-3 font-normal text-center">History</th>
                <th className="px-3 py-3 font-normal text-center" title="Enquiries using this currency">Used by</th>
                <th className="px-3 py-3 font-normal">Status</th>
                <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.code} onClick={() => setModal({ type: 'rates', code: c.code })}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-3">
                    <span className="font-mono font-semibold text-gray-900">{c.code}</span>
                    <span className="text-gray-700"> · {c.name}</span>
                    <span className="text-gray-400"> ({c.symbol})</span>
                    {c.is_base && <span className="ml-2 text-[10px] font-semibold text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">Base</span>}
                    {c.is_default && <span className="ml-2 text-[10px] font-semibold text-[var(--ams-primary)] bg-[var(--ams-primary-mid)] rounded px-1.5 py-0.5">Default</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-gray-900">{fmtRate(c.rate)}</td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{c.is_base ? '—' : fmtDay(c.rate_effective_from)}</td>
                  <td className="px-3 py-3 text-center text-gray-500 tabular-nums">{c.is_base ? '—' : c.rate_entries}</td>
                  <td className="px-3 py-3 text-center text-gray-500 tabular-nums">{c.usage ?? 0}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${c.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {!c.is_default && c.is_active && canEdit && (
                      <button onClick={() => makeDefault(c)} title="New records will start in this currency"
                        className="mr-3 text-xs font-medium text-gray-600 hover:underline cursor-pointer">Make default</button>
                    )}
                    {!c.is_base && canEdit && (
                      <>
                        <button onClick={() => setModal({ type: 'rates', code: c.code })}
                          className="text-xs font-medium text-[var(--ams-primary)] hover:underline cursor-pointer">Update rate</button>
                        <button onClick={() => setModal({ type: 'edit', currency: c })}
                          className="ml-3 text-xs font-medium text-gray-600 hover:underline cursor-pointer">Edit</button>
                      </>
                    )}
                    {!c.is_base && !c.is_default && canDelete && (c.usage ?? 0) === 0 && (
                      <button onClick={() => remove(c)} className="ml-3 text-xs font-medium text-red-600 hover:underline cursor-pointer">Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 1 && (
          <p className="px-3 py-4 text-sm text-gray-500 border-t border-gray-100">
            Only the base currency so far.{canCreate && <> Click <span className="font-medium">New</span> to add USD, EUR or any other currency with its rate.</>}
          </p>
        )}
      </div>

      {modal?.type === 'new' && (
        <NewCurrencyModal existingCodes={rows.map((r) => r.code)} onClose={() => setModal(null)} onSaved={upsert} />
      )}
      {modal?.type === 'edit' && <EditCurrencyModal currency={modal.currency} onClose={() => setModal(null)} onSaved={upsert} />}
      {modal?.type === 'rates' && (
        <RatesModal code={modal.code} canEdit={canEdit} onClose={() => setModal(null)}
          onChanged={(d) => upsert({ ...d, rate_entries: d.history.length })} />
      )}
    </div>
  );
}
