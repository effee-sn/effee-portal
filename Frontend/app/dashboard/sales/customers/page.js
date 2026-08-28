'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

// ── Create / Edit modal ───────────────────────────────────────────────────────
function CustomerModal({ customer, users, onClose, onSaved }) {
  const isEdit = Boolean(customer);
  const [form, setForm] = useState({
    name:             customer?.name || '',
    gstin:            customer?.gstin || '',
    owner_id:         customer?.owner_id || '',
    email:            customer?.email || '',
    phone:            customer?.phone || '',
    website:          customer?.website || '',
    industry:         customer?.industry || '',
    city:             customer?.city || '',
    state:            customer?.state || '',
    state_code:       customer?.state_code || '',
    pincode:          customer?.pincode || '',
    billing_address:  customer?.billing_address || '',
    shipping_address: customer?.shipping_address || '',
    notes:            customer?.notes || '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = isEdit
        ? await apiPut(`/sales/customers/${customer.id}`, form)
        : await apiPost('/sales/customers', form);
      onSaved(res.data, isEdit);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? 'Edit Customer' : 'New Customer'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={label}>Customer Name<span className="text-red-500"> *</span></label>
              <input name="name" value={form.name} onChange={change} required placeholder="Acme Industries Pvt Ltd" className="ams-input" />
            </div>
            <div>
              <label className={label}>GSTIN</label>
              <input name="gstin" value={form.gstin} onChange={change} placeholder="29ABCDE1234F1Z5" className="ams-input" />
            </div>
            <div>
              <label className={label}>Owner <span className="text-gray-400 font-normal normal-case">(salesperson)</span></label>
              <select name="owner_id" value={form.owner_id} onChange={change} className="ams-input">
                <option value="">— None —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Email</label>
              <input name="email" type="email" value={form.email} onChange={change} placeholder="sales@acme.com" className="ams-input" />
            </div>
            <div>
              <label className={label}>Phone</label>
              <input name="phone" value={form.phone} onChange={change} placeholder="9876543210" className="ams-input" />
            </div>
            <div>
              <label className={label}>Website</label>
              <input name="website" value={form.website} onChange={change} placeholder="acme.com" className="ams-input" />
            </div>
            <div>
              <label className={label}>Industry</label>
              <input name="industry" value={form.industry} onChange={change} placeholder="Manufacturing" className="ams-input" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="col-span-2 sm:col-span-2">
              <label className={label}>State <span className="text-gray-400 font-normal normal-case">(place of supply)</span></label>
              <input name="state" value={form.state} onChange={change} placeholder="Karnataka" className="ams-input" />
            </div>
            <div>
              <label className={label}>State Code</label>
              <input name="state_code" value={form.state_code} onChange={change} placeholder="29" className="ams-input" />
            </div>
            <div>
              <label className={label}>Pincode</label>
              <input name="pincode" value={form.pincode} onChange={change} placeholder="560001" className="ams-input" />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className={label}>City</label>
              <input name="city" value={form.city} onChange={change} placeholder="Bengaluru" className="ams-input" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Billing Address</label>
              <textarea name="billing_address" value={form.billing_address} onChange={change} rows={2} className="ams-input resize-none" />
            </div>
            <div>
              <label className={label}>Shipping Address</label>
              <textarea name="shipping_address" value={form.shipping_address} onChange={change} rows={2} className="ams-input resize-none" />
            </div>
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea name="notes" value={form.notes} onChange={change} rows={2} placeholder="Optional" className="ams-input resize-none" />
          </div>

          <div className="flex gap-3 pt-2 pb-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function DeleteModal({ customer, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const del = async () => {
    setSaving(true); setError('');
    try { await apiDelete(`/sales/customers/${customer.id}`); onDeleted(customer.id); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete Customer</h2>
        <p className="text-sm text-gray-500 mb-4">
          Delete <span className="font-medium text-gray-700">{customer.name}</span>? This cannot be undone.
        </p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button onClick={del} disabled={saving} className="btn-danger flex-1 justify-center py-2">
            {saving ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  useAuth();
  const router = useRouter();
  const { me, can, loading: permLoading } = usePermissions();

  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [users, setUsers]     = useState([]);
  const [modal, setModal]     = useState(null);

  const limit = 10;

  const canView   = me?.is_system || can('SALES_VIEW');
  const canCreate = me?.is_system || can('SALES_CREATE');
  const canEdit   = me?.is_system || can('SALES_EDIT');
  const canDelete = me?.is_system || can('SALES_DELETE');

  const fetchRows = async (p = page, s = search) => {
    setLoading(true);
    try {
      const res = await apiGet(`/sales/customers?page=${p}&limit=${limit}&search=${encodeURIComponent(s)}`);
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

  const onSearch = (e) => { e.preventDefault(); setPage(1); fetchRows(1, search); };
  const goPage = (delta) => { const p = page + delta; setPage(p); fetchRows(p, search); };

  const onSaved = (row, isEdit) => {
    if (isEdit) setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ...row } : r));
    else { fetchRows(1, ''); setPage(1); setSearch(''); }
  };
  const onDeleted = (id) => { setRows((prev) => prev.filter((r) => r.id !== id)); setTotal((n) => n - 1); };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  if (permLoading || loading) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={5} rows={6} />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view customers.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        {/* Control panel */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap bg-white">
          {canCreate && (
            <button onClick={() => setModal({ type: 'create' })}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              New
            </button>
          )}
          <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Customers</span>
          <div className="flex-1 min-w-0" />
          <form onSubmit={onSearch} className="shrink-0 flex items-center border border-gray-300 rounded bg-white overflow-hidden"
            style={{ minWidth: 220 }}>
            <span className="px-2.5 text-gray-400 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, GSTIN, city…"
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
            <div className="py-20 text-center text-sm text-gray-400">No customers yet. Click <span className="font-medium">New</span> to add one.</div>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 sticky top-0 bg-white z-10">
                  <th className="px-3 py-3 font-normal">Customer</th>
                  <th className="px-3 py-3 font-normal">GSTIN</th>
                  <th className="px-3 py-3 font-normal">Location</th>
                  <th className="px-3 py-3 font-normal">Owner</th>
                  <th className="px-3 py-3 font-normal text-center">Contacts</th>
                  <th className="px-3 py-3 font-normal text-center">Enquiries</th>
                  <th className="px-3 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/dashboard/sales/customers/${c.id}`)}
                    className="border-b border-gray-100 hover:bg-gray-50 group cursor-pointer">
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-800">{c.name}</div>
                      {(c.email || c.phone) && (
                        <div className="text-xs text-gray-400">{[c.email, c.phone].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-600 tabular-nums">{c.gstin || '—'}</td>
                    <td className="px-3 py-3 text-gray-600">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-3 py-3 text-gray-600">{c.owner?.name || '—'}</td>
                    <td className="px-3 py-3 text-gray-600 tabular-nums text-center">{c._count?.contacts ?? 0}</td>
                    <td className="px-3 py-3 text-gray-600 tabular-nums text-center">{c._count?.enquiries ?? 0}</td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && (
                          <button onClick={() => setModal({ type: 'edit', customer: c })}
                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 cursor-pointer" title="Edit">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setModal({ type: 'delete', customer: c })}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer" title="Delete">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal?.type === 'create' && <CustomerModal users={users} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'edit'   && <CustomerModal customer={modal.customer} users={users} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'delete' && <DeleteModal customer={modal.customer} onClose={() => setModal(null)} onDeleted={onDeleted} />}
    </div>
  );
}
