'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { ENQUIRY_SOURCES, ACTIVE_STAGES, STAGE_STYLE, SOURCE_LABEL, formatINR } from '@/lib/salesOptions';

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

function StageBadge({ stage }) {
  const s = STAGE_STYLE[stage] || { label: stage, color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold"
      style={{ color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </span>
  );
}

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

// ── Win modal ─────────────────────────────────────────────────────────────────
function WinModal({ enquiryId, onClose, onDone }) {
  const [form, setForm] = useState({ order_no: '', order_value: '', order_date: toDateInput(new Date().toISOString()) });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };
  const go = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try { const res = await apiPost(`/sales/enquiries/${enquiryId}/win`, form); onDone(res.data); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={go} className="w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Mark as Won</h2>
        <p className="text-sm text-gray-500 mb-4">Record the confirmed order.</p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className={label}>Order Value (₹)<span className="text-red-500"> *</span></label>
            <input name="order_value" type="number" min="0" step="0.01" value={form.order_value} onChange={change} required placeholder="240000" className="ams-input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>PO Number</label>
              <input name="order_no" value={form.order_no} onChange={change} placeholder="PO-9981" className="ams-input" />
            </div>
            <div>
              <label className={label}>Order Date</label>
              <input name="order_date" type="date" value={form.order_date} onChange={change} className="ams-input" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Confirm Won'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Lose modal ────────────────────────────────────────────────────────────────
function LoseModal({ enquiryId, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try { const res = await apiPost(`/sales/enquiries/${enquiryId}/lose`, { lost_reason: reason }); onDone(res.data); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={go} className="w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Mark as Lost</h2>
        <p className="text-sm text-gray-500 mb-4">Why was this enquiry lost?</p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} required rows={3}
          placeholder="Lost to competitor on price…" className="ams-input resize-none" />
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={saving} className="btn-danger flex-1 justify-center py-2">{saving ? 'Saving…' : 'Confirm Lost'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ enquiry, users, onClose, onDone }) {
  const [customers, setCustomers] = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [form, setForm] = useState({
    title: enquiry.title || '', customer_id: enquiry.customer_id || '', contact_id: enquiry.contact_id || '',
    owner_id: enquiry.owner_id || '', source: enquiry.source || 'CALL',
    stage: ['WON', 'LOST'].includes(enquiry.stage) ? 'NEGOTIATION' : enquiry.stage,
    expected_value: enquiry.expected_value ?? '', expected_close: toDateInput(enquiry.expected_close), description: enquiry.description || '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { apiGet('/sales/customers/options').then(setCustomers).catch(() => {}); }, []);
  useEffect(() => {
    if (!form.customer_id) { setContacts([]); return; }
    apiGet(`/sales/customers/${form.customer_id}`).then((res) => setContacts(res.data.contacts || [])).catch(() => setContacts([]));
  }, [form.customer_id]);

  const change = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value, ...(name === 'customer_id' ? { contact_id: '' } : {}) }));
    setError('');
  };
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try { const res = await apiPut(`/sales/enquiries/${enquiry.id}`, form); onDone(res.data); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Edit Enquiry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          {['WON', 'LOST'].includes(enquiry.stage) && (
            <div className="px-3 py-2 rounded bg-amber-50 border border-amber-200 text-amber-700 text-xs">
              This enquiry is {enquiry.stage.toLowerCase()}. Saving here moves it back into the active pipeline — use Reopen for that, or Cancel to keep it closed.
            </div>
          )}
          <div>
            <label className={label}>Title<span className="text-red-500"> *</span></label>
            <input name="title" value={form.title} onChange={change} required className="ams-input" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Customer<span className="text-red-500"> *</span></label>
              <select name="customer_id" value={form.customer_id} onChange={change} required className="ams-input">
                <option value="">— Select customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Contact</label>
              <select name="contact_id" value={form.contact_id} onChange={change} disabled={!form.customer_id} className="ams-input">
                <option value="">— None —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.designation ? ` (${c.designation})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Owner</label>
              <select name="owner_id" value={form.owner_id} onChange={change} className="ams-input">
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Source</label>
              <select name="source" value={form.source} onChange={change} className="ams-input">
                {ENQUIRY_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Stage</label>
              <select name="stage" value={form.stage} onChange={change} className="ams-input">
                {ACTIVE_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Expected Value (₹)</label>
              <input name="expected_value" type="number" min="0" step="0.01" value={form.expected_value} onChange={change} className="ams-input" />
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
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EnquiryDetailPage() {
  useAuth();
  const { id } = useParams();
  const router = useRouter();
  const { me, can, loading: permLoading } = usePermissions();

  const [enquiry, setEnquiry] = useState(null);
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [modal, setModal]     = useState(null);
  const [busy, setBusy]       = useState(false);

  const canEdit   = me?.is_system || can('SALES_EDIT');
  const canDelete = me?.is_system || can('SALES_DELETE');

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiGet(`/sales/enquiries/${id}`); setEnquiry(res.data); }
    catch { setNotFound(true); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    if (!permLoading) { load(); apiGet('/lookup/users').then(setUsers).catch(() => {}); }
  }, [permLoading, load]);

  const reopen = async () => {
    if (busy) return;
    setBusy(true);
    try { const res = await apiPost(`/sales/enquiries/${id}/reopen`, {}); setEnquiry(res.data); }
    catch (err) { alert(err.message); }
    finally { setBusy(false); }
  };

  const del = async () => {
    setBusy(true);
    try { await apiDelete(`/sales/enquiries/${id}`); router.push('/dashboard/sales/enquiries'); }
    catch (err) { alert(err.message); setBusy(false); }
  };

  if (loading || permLoading) return <div className="py-20 text-center text-sm text-gray-400">Loading…</div>;
  if (notFound || !enquiry) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Enquiry not found</p>
        <button onClick={() => router.push('/dashboard/sales/enquiries')} className="text-sm text-blue-600 hover:underline">Back to enquiries</button>
      </div>
    );
  }

  const isClosed = enquiry.stage === 'WON' || enquiry.stage === 'LOST';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/dashboard/sales/enquiries')}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 cursor-pointer" title="Back">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-400">{enquiry.ref_no}</span>
            <StageBadge stage={enquiry.stage} />
          </div>
          <h1 className="text-lg font-semibold text-gray-800 truncate">{enquiry.title}</h1>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={() => setModal('edit')} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Edit</button>
            {!isClosed && (
              <>
                <button onClick={() => setModal('win')} className="px-3 py-1.5 text-sm font-medium text-white rounded cursor-pointer"
                  style={{ backgroundColor: '#15803D' }}>Won</button>
                <button onClick={() => setModal('lose')} className="btn-danger px-3 py-1.5 text-sm cursor-pointer">Lost</button>
              </>
            )}
            {isClosed && (
              <button onClick={reopen} disabled={busy} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Reopen</button>
            )}
          </div>
        )}
      </div>

      {/* Won / Lost banner */}
      {enquiry.stage === 'WON' && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-3 flex flex-wrap gap-x-8 gap-y-2">
          <Field label="Order Value"><span className="font-semibold text-green-800">{formatINR(enquiry.order_value)}</span></Field>
          <Field label="PO Number">{enquiry.order_no}</Field>
          <Field label="Order Date">{fmtDate(enquiry.order_date)}</Field>
        </div>
      )}
      {enquiry.stage === 'LOST' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3">
          <Field label="Lost Reason"><span className="text-red-800">{enquiry.lost_reason}</span></Field>
        </div>
      )}

      {/* Enquiry details */}
      <Section title="Enquiry">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Source">{SOURCE_LABEL[enquiry.source] || enquiry.source}</Field>
          <Field label="Owner">{enquiry.owner?.name}</Field>
          <Field label="Expected Value">{formatINR(enquiry.expected_value)}</Field>
          <Field label="Expected Close">{fmtDate(enquiry.expected_close)}</Field>
          <Field label="Created">{fmtDate(enquiry.created_at)}</Field>
          <Field label="Activities / Quotes">{(enquiry._count?.activities ?? 0)} / {(enquiry._count?.quotations ?? 0)}</Field>
          {enquiry.description && <div className="col-span-2 sm:col-span-3"><Field label="Description">{enquiry.description}</Field></div>}
        </div>
      </Section>

      {/* Customer */}
      <Section title="Customer" right={
        <button onClick={() => router.push(`/dashboard/sales/customers/${enquiry.customer_id}`)}
          className="text-xs text-blue-600 hover:underline cursor-pointer">Open customer</button>
      }>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Name">{enquiry.customer?.name}</Field>
          <Field label="GSTIN">{enquiry.customer?.gstin}</Field>
          <Field label="State">{enquiry.customer?.state}{enquiry.customer?.state_code ? ` (${enquiry.customer.state_code})` : ''}</Field>
          <Field label="Contact">{enquiry.contact?.name}</Field>
          <Field label="Designation">{enquiry.contact?.designation}</Field>
          <Field label="Contact Info">{[enquiry.contact?.email, enquiry.contact?.phone].filter(Boolean).join(' · ') || null}</Field>
        </div>
      </Section>

      {/* Coming next: activities + quotations */}
      <Section title="Activity Timeline">
        <p className="text-sm text-gray-400 py-2">Activity / MOM tracking arrives in the next increment.</p>
      </Section>
      <Section title="Quotations">
        <p className="text-sm text-gray-400 py-2">Line-item quotations arrive in the next increment.</p>
      </Section>

      {canDelete && (
        <div className="pt-2">
          <button onClick={() => setModal('delete')} className="text-sm text-red-600 hover:underline cursor-pointer">Delete enquiry</button>
        </div>
      )}

      {modal === 'edit'  && <EditModal enquiry={enquiry} users={users} onClose={() => setModal(null)} onDone={setEnquiry} />}
      {modal === 'win'   && <WinModal enquiryId={enquiry.id} onClose={() => setModal(null)} onDone={setEnquiry} />}
      {modal === 'lose'  && <LoseModal enquiryId={enquiry.id} onClose={() => setModal(null)} onDone={setEnquiry} />}
      {modal === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-2">Delete Enquiry</h2>
            <p className="text-sm text-gray-500 mb-4">Delete <span className="font-medium text-gray-700">{enquiry.ref_no}</span>? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
              <button onClick={del} disabled={busy} className="btn-danger flex-1 justify-center py-2">{busy ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
