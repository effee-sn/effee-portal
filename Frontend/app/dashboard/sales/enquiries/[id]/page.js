'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { ENQUIRY_TYPES, STAGE_STYLE, STAGE_RANK, TYPE_LABEL, TEMPERATURE_STYLE, visibleDocKinds, formatINR } from '@/lib/salesOptions';
import EnquiryCustomerContact from '@/components/EnquiryCustomerContact';
import EnquiryActivities from '@/components/EnquiryActivities';
import EnquiryReviews from '@/components/EnquiryReviews';
import EnquiryProcess from '@/components/EnquiryProcess';
import EnquiryAttachments from '@/components/EnquiryAttachments';

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
  const [form, setForm] = useState({
    order_no: '', order_value: '', order_date: toDateInput(new Date().toISOString()),
    won_declaration: '', won_terms: '',
  });
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
      <form onSubmit={go} className="w-full max-w-md bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="px-6 pt-6 pb-3">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Mark as Won</h2>
          <p className="text-sm text-gray-500">Record the confirmed order.</p>
        </div>
        <div className="overflow-y-auto flex-1 px-6 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
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
          <div>
            <label className={label}>Declaration</label>
            <textarea name="won_declaration" value={form.won_declaration} onChange={change} rows={3}
              placeholder="Scope / declaration agreed with the customer…" className="ams-input resize-none" />
          </div>
          <div>
            <label className={label}>Terms &amp; Conditions</label>
            <textarea name="won_terms" value={form.won_terms} onChange={change} rows={3}
              placeholder="Payment terms, delivery, warranty…" className="ams-input resize-none" />
          </div>
        </div>
        <div className="flex gap-3 p-6 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Confirm Won'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Lose modal ────────────────────────────────────────────────────────────────
function LoseModal({ enquiryId, onClose, onDone }) {
  const [form, setForm] = useState({ lost_reason: '', lost_to: '' });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };
  const go = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try { const res = await apiPost(`/sales/enquiries/${enquiryId}/lose`, form); onDone(res.data); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={go} className="w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Mark as Lost</h2>
        <p className="text-sm text-gray-500 mb-4">Capture why the deal was lost, and to whom.</p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className={label}>Reason<span className="text-red-500"> *</span></label>
            <textarea name="lost_reason" value={form.lost_reason} onChange={change} required rows={3}
              placeholder="Higher price, longer delivery, spec mismatch…" className="ams-input resize-none" />
          </div>
          <div>
            <label className={label}>Lost to (whom)</label>
            <input name="lost_to" value={form.lost_to} onChange={change}
              placeholder="Competitor / supplier who won it" className="ams-input" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={saving} className="btn-danger flex-1 justify-center py-2">{saving ? 'Saving…' : 'Confirm Lost'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Reassign modal ────────────────────────────────────────────────────────────
function ReassignModal({ enquiry, users, onClose, onDone }) {
  const [form, setForm] = useState({
    owner_id:   enquiry.owner_id ? String(enquiry.owner_id) : '',
    handler_id: (enquiry.handler_id ?? enquiry.owner_id) ? String(enquiry.handler_id ?? enquiry.owner_id) : '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };
  const go = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await apiPost(`/sales/enquiries/${enquiry.id}/reassign`, {
        owner_id: form.owner_id ? Number(form.owner_id) : undefined,
        handler_id: form.handler_id ? Number(form.handler_id) : undefined,
      });
      onDone(res.data); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={go} className="w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Reassign Enquiry</h2>
        <p className="text-sm text-gray-500 mb-4">Cover for someone who’s out. The owner is the field initiator; the handler is who holds it right now.</p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className={label}>Field owner (initiator)</label>
            <select name="owner_id" value={form.owner_id} onChange={change} className="ams-input">
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Current handler</label>
            <select name="handler_id" value={form.handler_id} onChange={change} className="ams-input">
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Reverts to the phase’s role at the next handoff.</p>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Reassign'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
// Edits the enquiry's details only. The stage is never changed here — it moves
// through the process bar and the offer/follow-up actions, which enforce gates.
function EditModal({ enquiry, users, onClose, onDone }) {
  const [form, setForm] = useState({
    title: enquiry.title || '', customer_id: enquiry.customer_id || '', contact_id: enquiry.contact_id || '',
    owner_id: enquiry.owner_id || '', enquiry_type: enquiry.enquiry_type || 'INCOMING',
    expected_value: enquiry.expected_value ?? '', expected_close: toDateInput(enquiry.expected_close), description: enquiry.description || '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  // The type picks the flow (Generated skips Contacted), so it's fixed after New.
  const typeLocked = enquiry.stage !== 'NEW';

  const change = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setError('');
  };

  const setCustomerContact = ({ customer_id, contact_id }) =>
    setForm((f) => ({ ...f, customer_id, contact_id }));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    const payload = { ...form };
    if (typeLocked) delete payload.enquiry_type;
    try { const res = await apiPut(`/sales/enquiries/${enquiry.id}`, payload); onDone(res.data); onClose(); }
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
          <div>
            <label className={label}>Title<span className="text-red-500"> *</span></label>
            <input name="title" value={form.title} onChange={change} required className="ams-input" />
          </div>
          <EnquiryCustomerContact
            initialCustomer={enquiry.customer_id ? { id: enquiry.customer_id, name: enquiry.customer?.name } : null}
            initialContactId={enquiry.contact_id}
            onChange={setCustomerContact}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Owner</label>
              <select name="owner_id" value={form.owner_id} onChange={change} className="ams-input">
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Type</label>
              <select name="enquiry_type" value={form.enquiry_type} onChange={change} disabled={typeLocked}
                className="ams-input disabled:bg-gray-50 disabled:text-gray-500">
                {ENQUIRY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {typeLocked && <p className="text-xs text-gray-400 mt-1">Fixed once the enquiry leaves New.</p>}
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

function TempChip({ value }) {
  const s = TEMPERATURE_STYLE[value];
  if (!s) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>
  );
}

const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Stage-transition history, in a right off-canvas drawer. */
function StageHistoryDrawer({ events, users, onClose }) {
  const list = events || [];
  // Captured once at open, so "days in current stage" stays a pure render.
  const [now] = useState(() => Date.now());
  const nameFor = (uid) => (uid ? (users.find((u) => String(u.id) === String(uid))?.name || `#${uid}`) : 'system');
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Stage History</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {list.length === 0 ? (
            <p className="text-sm text-gray-400">No history yet.</p>
          ) : (
            <ol className="space-y-3">
              {list.map((e, i) => {
                const start = new Date(e.created_at).getTime();
                const end = i < list.length - 1 ? new Date(list[i + 1].created_at).getTime() : now;
                const days = Math.max(0, Math.round((end - start) / 86400000));
                const s = STAGE_STYLE[e.to_stage];
                return (
                  <li key={e.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded font-medium"
                        style={s ? { color: s.color, backgroundColor: s.bg } : undefined}>{s?.label || e.to_stage}</span>
                      <span className="text-gray-400">{fmtDateTime(e.created_at)}</span>
                      {i === list.length - 1 && <span className="text-gray-400">· now</span>}
                    </div>
                    <div className="text-gray-400 mt-0.5">{nameFor(e.changed_by)} · {days}d in stage</div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
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
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [modal, setModal]     = useState(null);
  const [busy, setBusy]       = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const canDelete = me?.is_system || can('SALES_DELETE');
  // Reassignment is a supervisory action — any SALES_EDIT user, not only the
  // current handler.
  const canReassign = me?.is_system || can('SALES_EDIT');

  const loadReadiness = useCallback(() => {
    apiGet(`/sales/enquiries/${id}/readiness`, { silent: true }).then((r) => setReadiness(r.data)).catch(() => {});
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiGet(`/sales/enquiries/${id}`); setEnquiry(res.data); loadReadiness(); }
    catch { setNotFound(true); }
    finally { setLoading(false); }
  }, [id, loadReadiness]);

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

  const changeStage = async (stage) => {
    if (busy) return;
    setBusy(true);
    try { const res = await apiPut(`/sales/enquiries/${id}`, { stage }); setEnquiry(res.data); }
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
  // Stage work belongs to the current handler (the workflow baton), falling
  // back to the field initiator — matches the API gate.
  const handlerId = enquiry.handler_id ?? enquiry.owner_id;
  const canManage = me?.is_system || (me?.id != null && me.id === handlerId);
  const wonBlocked = readiness?.blocked?.WON || [];

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/dashboard/sales/enquiries')}
            className="p-1.5 -ml-1.5 rounded hover:bg-gray-100 text-gray-500 cursor-pointer shrink-0" title="Back">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400">{enquiry.ref_no}</span>
              <StageBadge stage={enquiry.stage} />
              <span className="text-xs text-gray-500">{TYPE_LABEL[enquiry.enquiry_type] || enquiry.enquiry_type}</span>
              <button onClick={() => setShowHistory(true)}
                className="text-xs text-blue-600 hover:underline cursor-pointer">Stage history</button>
              {enquiry.current_temperature && <TempChip value={enquiry.current_temperature} />}
            </div>
            <h1 className="text-xl font-semibold text-gray-800 mt-0.5 break-words">{enquiry.title}</h1>
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-x-4 gap-y-1 flex-wrap">
              <button onClick={() => router.push(`/dashboard/master-data/customers/${enquiry.customer_id}`)}
                className="hover:underline text-blue-600 cursor-pointer">{enquiry.customer?.name}</button>
              <span>Owner: {enquiry.owner?.name || '—'}</span>
              {!isClosed && (
                <span className="inline-flex items-center gap-1">
                  With:
                  <span className="font-medium text-gray-700">{enquiry.handler?.name || enquiry.owner?.name || '—'}</span>
                  {canManage && <span className="text-[10px] font-semibold text-green-700 bg-green-50 rounded px-1 py-0.5">you</span>}
                </span>
              )}
              {enquiry.expected_value != null && <span>Value: {formatINR(enquiry.expected_value)}</span>}
            </div>
          </div>
          {(canManage || canDelete || canReassign) && (
            <div className="flex items-center gap-2 shrink-0">
              {canManage && (
                <>
                  <button onClick={() => setModal('edit')} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Edit</button>
                  {!isClosed ? (
                    <>
                      <button onClick={() => setModal('win')} disabled={wonBlocked.length > 0}
                        title={wonBlocked.length ? `Needs ${wonBlocked.join(' & ')} first` : 'Mark won'}
                        className="px-3 py-1.5 text-sm font-medium text-white rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: '#15803D' }}>Won</button>
                      <button onClick={() => setModal('lose')} className="btn-danger px-3 py-1.5 text-sm cursor-pointer">Lost</button>
                    </>
                  ) : (
                    <button onClick={reopen} disabled={busy} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Reopen</button>
                  )}
                </>
              )}
              {canReassign && !isClosed && (
                <button onClick={() => setModal('reassign')} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Reassign</button>
              )}
              {canDelete && (
                <button onClick={() => setModal('delete')} title="Delete enquiry"
                  className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Won / Lost banner */}
      {enquiry.stage === 'WON' && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-3 space-y-3">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Field label="Order Value"><span className="font-semibold text-green-800">{formatINR(enquiry.order_value)}</span></Field>
            <Field label="PO Number">{enquiry.order_no}</Field>
            <Field label="Order Date">{fmtDate(enquiry.order_date)}</Field>
          </div>
          {(enquiry.won_declaration || enquiry.won_terms) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 pt-1 border-t border-green-200">
              {enquiry.won_declaration && <Field label="Declaration"><span className="whitespace-pre-wrap text-gray-700">{enquiry.won_declaration}</span></Field>}
              {enquiry.won_terms && <Field label="Terms & Conditions"><span className="whitespace-pre-wrap text-gray-700">{enquiry.won_terms}</span></Field>}
            </div>
          )}
        </div>
      )}
      {enquiry.stage === 'LOST' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 flex flex-wrap gap-x-8 gap-y-2">
          <Field label="Lost Reason"><span className="text-red-800">{enquiry.lost_reason}</span></Field>
          {enquiry.lost_to && <Field label="Lost To"><span className="text-red-800">{enquiry.lost_to}</span></Field>}
        </div>
      )}

      {/* Process — where it is now and what's next */}
      <EnquiryProcess enquiry={enquiry} canManage={canManage} busy={busy} onPick={changeStage} blocked={readiness?.blocked} />

      {/* Customer + details — a single full-width card */}
      <Section title="Customer & Details" right={
        <button onClick={() => router.push(`/dashboard/master-data/customers/${enquiry.customer_id}`)}
          className="text-xs text-blue-600 hover:underline cursor-pointer">Open customer</button>
      }>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
          <Field label="Customer">{enquiry.customer?.name}</Field>
          <Field label="GSTIN">{enquiry.customer?.gstin}</Field>
          <Field label="State">{enquiry.customer?.state}{enquiry.customer?.state_code ? ` (${enquiry.customer.state_code})` : ''}</Field>
          <Field label="Contact">{enquiry.contact?.name}</Field>
          <Field label="Designation">{enquiry.contact?.designation}</Field>
          <Field label="Contact Info">{[enquiry.contact?.email, enquiry.contact?.phone].filter(Boolean).join(' · ') || null}</Field>
          <Field label="Type">{TYPE_LABEL[enquiry.enquiry_type] || enquiry.enquiry_type}</Field>
          <Field label="Owner">{enquiry.owner?.name}</Field>
          <Field label="Temperature">{enquiry.current_temperature ? <TempChip value={enquiry.current_temperature} /> : null}</Field>
          <Field label="Expected Value">{formatINR(enquiry.expected_value)}</Field>
          <Field label="Expected Close">{fmtDate(enquiry.expected_close)}</Field>
          <Field label="Created">{fmtDate(enquiry.created_at)}</Field>
          <Field label="Created by">{enquiry.created_by ? (users.find((u) => String(u.id) === String(enquiry.created_by))?.name || `#${enquiry.created_by}`) : '—'}</Field>
          {enquiry.description && (
            <div className="col-span-2 sm:col-span-3 lg:col-span-4"><Field label="Description">{enquiry.description}</Field></div>
          )}
        </div>
      </Section>

      {STAGE_RANK[enquiry.stage] >= STAGE_RANK.REVIEW && (
        <EnquiryReviews enquiryId={enquiry.id} canEdit={canManage} users={users} onChanged={load} />
      )}

      {/* At New: Generated uploads the format only; Incoming also logs its
          gathering activities. Past New: full documents + the timeline. */}
      {enquiry.stage === 'NEW' ? (
        enquiry.enquiry_type === 'INCOMING' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <EnquiryAttachments enquiryId={enquiry.id} canEdit={canManage} kinds={visibleDocKinds(enquiry.stage)} onChanged={load} />
            <div id="activity"><EnquiryActivities enquiryId={enquiry.id} canEdit={canManage} users={users} stage={enquiry.stage} onChanged={load} /></div>
          </div>
        ) : (
          <EnquiryAttachments enquiryId={enquiry.id} canEdit={canManage} kinds={visibleDocKinds(enquiry.stage)} onChanged={load} />
        )
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <EnquiryAttachments enquiryId={enquiry.id} canEdit={canManage} kinds={visibleDocKinds(enquiry.stage)} onChanged={load} />
          <div id="activity"><EnquiryActivities enquiryId={enquiry.id} canEdit={canManage} users={users} stage={enquiry.stage} onChanged={load} /></div>
        </div>
      )}


      {showHistory && <StageHistoryDrawer events={enquiry.stageEvents} users={users} onClose={() => setShowHistory(false)} />}

      {modal === 'edit'  && <EditModal enquiry={enquiry} users={users} onClose={() => setModal(null)} onDone={setEnquiry} />}
      {modal === 'reassign' && <ReassignModal enquiry={enquiry} users={users} onClose={() => setModal(null)} onDone={setEnquiry} />}
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
