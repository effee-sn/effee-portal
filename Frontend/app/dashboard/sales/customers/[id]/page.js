'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

function Field({ label: l, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{l}</p>
      <div className="text-sm text-gray-700 break-words">{children ?? <span className="text-gray-300">—</span>}</div>
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {right}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ── Contact add / edit modal ──────────────────────────────────────────────────
function ContactModal({ customerId, contact, onClose, onSaved }) {
  const isEdit = Boolean(contact);
  const [form, setForm] = useState({
    name:        contact?.name || '',
    designation: contact?.designation || '',
    email:       contact?.email || '',
    phone:       contact?.phone || '',
    is_primary:  contact?.is_primary || false,
    notes:       contact?.notes || '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const change = (e) => {
    const { name, type, checked, value } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = isEdit
        ? await apiPut(`/sales/contacts/${contact.id}`, form)
        : await apiPost(`/sales/customers/${customerId}/contacts`, form);
      onSaved();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? 'Edit Contact' : 'New Contact'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <div>
            <label className={label}>Name<span className="text-red-500"> *</span></label>
            <input name="name" value={form.name} onChange={change} required placeholder="Ravi Kumar" className="ams-input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Designation</label>
              <input name="designation" value={form.designation} onChange={change} placeholder="Purchase Head" className="ams-input" />
            </div>
            <div>
              <label className={label}>Phone</label>
              <input name="phone" value={form.phone} onChange={change} placeholder="9876543210" className="ams-input" />
            </div>
          </div>
          <div>
            <label className={label}>Email</label>
            <input name="email" type="email" value={form.email} onChange={change} placeholder="ravi@acme.com" className="ams-input" />
          </div>
          <div>
            <label className={label}>Notes</label>
            <textarea name="notes" value={form.notes} onChange={change} rows={2} className="ams-input resize-none" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" name="is_primary" checked={form.is_primary} onChange={change} className="rounded" />
            Primary contact
          </label>
          <div className="flex gap-3 pt-2 pb-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteContactModal({ contact, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const del = async () => {
    setSaving(true); setError('');
    try { await apiDelete(`/sales/contacts/${contact.id}`); onDeleted(); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete Contact</h2>
        <p className="text-sm text-gray-500 mb-4">Remove <span className="font-medium text-gray-700">{contact.name}</span>?</p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button onClick={del} disabled={saving} className="btn-danger flex-1 justify-center py-2">{saving ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CustomerDetailPage() {
  useAuth();
  const { id } = useParams();
  const router = useRouter();
  const { me, can, loading: permLoading } = usePermissions();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [modal, setModal]       = useState(null);

  const canEdit   = me?.is_system || can('SALES_EDIT');
  const canCreate = me?.is_system || can('SALES_CREATE');
  const canDelete = me?.is_system || can('SALES_DELETE');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet(`/sales/customers/${id}`);
      setCustomer(res.data);
    } catch { setNotFound(true); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { if (!permLoading) load(); }, [permLoading, load]);

  if (loading || permLoading) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading…</div>;
  }
  if (notFound || !customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Customer not found</p>
        <button onClick={() => router.push('/dashboard/sales/customers')} className="text-sm text-blue-600 hover:underline">Back to customers</button>
      </div>
    );
  }

  const contacts = customer.contacts || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/sales/customers')}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 cursor-pointer" title="Back">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-gray-800 truncate">{customer.name}</h1>
          <p className="text-xs text-gray-400">{[customer.city, customer.state].filter(Boolean).join(', ') || 'Customer'}</p>
        </div>
        {canEdit && (
          <button onClick={() => setModal({ type: 'edit-customer' })} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Edit</button>
        )}
      </div>

      {/* Company details */}
      <Section title="Company Details">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="GSTIN">{customer.gstin}</Field>
          <Field label="Owner">{customer.owner?.name}</Field>
          <Field label="Industry">{customer.industry}</Field>
          <Field label="Email">{customer.email}</Field>
          <Field label="Phone">{customer.phone}</Field>
          <Field label="Website">{customer.website}</Field>
          <Field label="State">{customer.state}{customer.state_code ? ` (${customer.state_code})` : ''}</Field>
          <Field label="City">{customer.city}</Field>
          <Field label="Pincode">{customer.pincode}</Field>
          <div className="col-span-2 sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Billing Address">{customer.billing_address}</Field>
            <Field label="Shipping Address">{customer.shipping_address}</Field>
          </div>
          {customer.notes && <div className="col-span-2 sm:col-span-3"><Field label="Notes">{customer.notes}</Field></div>}
        </div>
      </Section>

      {/* Contacts */}
      <Section
        title={`Contacts (${contacts.length})`}
        right={canCreate && (
          <button onClick={() => setModal({ type: 'contact' })}
            className="px-2.5 py-1 text-xs font-medium text-white rounded-sm cursor-pointer"
            style={{ backgroundColor: 'var(--ams-primary)' }}>
            Add Contact
          </button>
        )}
      >
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No contacts yet.</p>
        ) : (
          <div className="divide-y divide-gray-100 -my-1">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-start gap-3 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{c.name}</span>
                    {c.is_primary && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">Primary</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {[c.designation, c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {c.notes && <div className="text-xs text-gray-400 mt-0.5">{c.notes}</div>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canEdit && (
                    <button onClick={() => setModal({ type: 'contact', contact: c })}
                      className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 cursor-pointer" title="Edit">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => setModal({ type: 'delete-contact', contact: c })}
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer" title="Delete">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {modal?.type === 'edit-customer' && (
        <EditCustomerInline customer={customer} onClose={() => setModal(null)} onSaved={load} />
      )}
      {modal?.type === 'contact' && (
        <ContactModal customerId={customer.id} contact={modal.contact} onClose={() => setModal(null)} onSaved={load} />
      )}
      {modal?.type === 'delete-contact' && (
        <DeleteContactModal contact={modal.contact} onClose={() => setModal(null)} onDeleted={load} />
      )}
    </div>
  );
}

// Reuse the full customer modal from the list page by importing lazily would
// couple the routes; instead a compact edit form lives here.
function EditCustomerInline({ customer, onClose, onSaved }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    name: customer.name || '', gstin: customer.gstin || '', owner_id: customer.owner_id || '',
    email: customer.email || '', phone: customer.phone || '', website: customer.website || '',
    industry: customer.industry || '', city: customer.city || '', state: customer.state || '',
    state_code: customer.state_code || '', pincode: customer.pincode || '',
    billing_address: customer.billing_address || '', shipping_address: customer.shipping_address || '',
    notes: customer.notes || '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { apiGet('/lookup/users').then(setUsers).catch(() => {}); }, []);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try { await apiPut(`/sales/customers/${customer.id}`, form); onSaved(); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Edit Customer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={label}>Customer Name<span className="text-red-500"> *</span></label>
              <input name="name" value={form.name} onChange={change} required className="ams-input" />
            </div>
            <div><label className={label}>GSTIN</label><input name="gstin" value={form.gstin} onChange={change} className="ams-input" /></div>
            <div>
              <label className={label}>Owner</label>
              <select name="owner_id" value={form.owner_id} onChange={change} className="ams-input">
                <option value="">— None —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label className={label}>Email</label><input name="email" type="email" value={form.email} onChange={change} className="ams-input" /></div>
            <div><label className={label}>Phone</label><input name="phone" value={form.phone} onChange={change} className="ams-input" /></div>
            <div><label className={label}>Website</label><input name="website" value={form.website} onChange={change} className="ams-input" /></div>
            <div><label className={label}>Industry</label><input name="industry" value={form.industry} onChange={change} className="ams-input" /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="col-span-2"><label className={label}>State</label><input name="state" value={form.state} onChange={change} className="ams-input" /></div>
            <div><label className={label}>State Code</label><input name="state_code" value={form.state_code} onChange={change} className="ams-input" /></div>
            <div><label className={label}>Pincode</label><input name="pincode" value={form.pincode} onChange={change} className="ams-input" /></div>
            <div className="col-span-2 sm:col-span-4"><label className={label}>City</label><input name="city" value={form.city} onChange={change} className="ams-input" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={label}>Billing Address</label><textarea name="billing_address" value={form.billing_address} onChange={change} rows={2} className="ams-input resize-none" /></div>
            <div><label className={label}>Shipping Address</label><textarea name="shipping_address" value={form.shipping_address} onChange={change} rows={2} className="ams-input resize-none" /></div>
          </div>
          <div><label className={label}>Notes</label><textarea name="notes" value={form.notes} onChange={change} rows={2} className="ams-input resize-none" /></div>
          <div className="flex gap-3 pt-2 pb-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
