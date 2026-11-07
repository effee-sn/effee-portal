'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { ENQUIRY_TYPES, STAGE_STYLE, STAGE_RANK, TYPE_LABEL, TEMPERATURE_STYLE, visibleDocKinds } from '@/lib/salesOptions';
import EnquiryCustomerContact from '@/components/EnquiryCustomerContact';
import EnquiryActivities from '@/components/EnquiryActivities';
import EnquiryReviews from '@/components/EnquiryReviews';
import EnquiryProcess from '@/components/EnquiryProcess';
import EnquiryAttachments from '@/components/EnquiryAttachments';
import EnquiryQueueBanner from '@/components/EnquiryQueueBanner';
import EnquiryFlows from '@/components/EnquiryFlows';
import useNav from '@/lib/useNav';
import useSalesConfig from '@/lib/useSalesConfig';
import useCurrencies, { MoneyText, formatMoney } from '@/lib/money';
import { useDisplayCurrency } from '@/lib/displayCurrency';
import { DetailPageSkeleton } from '@/components/Skeleton';
import ValueBasis from '@/components/sales/ValueBasis';
import IssueRecordButton from '@/components/issues/IssueRecordButton';

// Stages where the final costing value can be entered (matches the API).
const COSTED_STAGES = ['COSTING_REVIEW', 'OFFER_RELEASED', 'NEGOTIATION'];

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
function WinModal({ enquiryId, currencyCode = 'INR', onClose, onDone }) {
  const currencies = useCurrencies();
  const cur = currencies?.byCode[currencyCode];
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
            <label className={label}>PO Value ({currencyCode})<span className="text-red-500"> *</span></label>
            <input name="order_value" type="number" min="0" step="0.01" value={form.order_value} onChange={change} required placeholder="240000" className="ams-input" />
            {currencyCode !== 'INR' && cur && (
              <p className="text-xs text-gray-500 mt-1">
                Locked at today&apos;s rate: 1 {currencyCode} = {formatMoney(cur.rate, 'INR')}
                {Number(form.order_value) > 0 && <> · ≈ {formatMoney(Number(form.order_value) * cur.rate, 'INR')}</>}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>PO Number</label>
              <input name="order_no" value={form.order_no} onChange={change} placeholder="PO-9981" className="ams-input" />
            </div>
            <div>
              <label className={label}>PO Date</label>
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

// ── Archive / restore (Sales → Archive) ───────────────────────────────────────
// Matches the API: the reason is mandatory; Other needs a note; a duplicate
// may name the enquiry being kept.
const ARCHIVE_REASONS = [
  { value: 'DUPLICATE', label: 'Duplicate' },
  { value: 'MISTAKE',   label: 'Created by mistake' },
  { value: 'WITHDRAWN', label: 'Withdrawn by customer' },
  { value: 'OTHER',     label: 'Other' },
];
const ARCHIVE_REASON_LABEL = Object.fromEntries(ARCHIVE_REASONS.map((r) => [r.value, r.label]));

function ArchiveModal({ enquiry, onClose, onDone }) {
  const [form, setForm]     = useState({ reason: '', note: '' });
  const [dup, setDup]       = useState(null); // { id, ref_no, title }
  const [term, setTerm]     = useState('');
  const [found, setFound]   = useState([]);
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };

  // Find the enquiry it duplicates (archived ones are not listed).
  useEffect(() => {
    if (form.reason !== 'DUPLICATE' || dup || term.trim().length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => {
      apiGet(`/sales/enquiries?search=${encodeURIComponent(term.trim())}&limit=8`, { silent: true })
        .then((r) => setFound((r.data || []).filter((e) => e.id !== enquiry.id)))
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [term, form.reason, dup, enquiry.id]);

  const go = async (e) => {
    e.preventDefault();
    if (!form.reason) { setError('Choose why it is archived'); return; }
    if (form.reason === 'OTHER' && !form.note.trim()) { setError('Say why it is archived'); return; }
    setSaving(true); setError('');
    try {
      const body = { reason: form.reason, note: form.note.trim() || null, duplicate_of_id: form.reason === 'DUPLICATE' && dup ? dup.id : null };
      const res = await apiPost(`/sales/enquiries/${enquiry.id}/archive`, body);
      onDone(res.data); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={go} className="w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Archive {enquiry.ref_no}</h2>
        <p className="text-sm text-gray-500 mb-4">
          It leaves the list, dashboards, reports, reminders and flows, and is read-only until restored.
        </p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className={label}>Reason<span className="text-red-500"> *</span></label>
            <select name="reason" value={form.reason} onChange={change} required className="ams-input">
              <option value="">Choose…</option>
              {ARCHIVE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {form.reason === 'DUPLICATE' && (
            <div>
              <label className={label}>Duplicate of</label>
              {dup ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded border border-gray-200 bg-gray-50 text-sm">
                  <span className="min-w-0 truncate"><span className="font-mono text-xs text-gray-500">{dup.ref_no}</span> {dup.title}</span>
                  <button type="button" onClick={() => { setDup(null); setTerm(''); }} className="text-xs text-blue-600 hover:underline cursor-pointer shrink-0">Change</button>
                </div>
              ) : (
                <div className="relative">
                  <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by ref no. or title (optional)" className="ams-input" />
                  {found.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 max-h-56 overflow-auto rounded border border-gray-200 bg-white shadow-lg">
                      {found.map((e) => (
                        <button type="button" key={e.id} onClick={() => { setDup(e); setFound([]); }}
                          className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                          <span className="font-mono text-xs text-gray-500">{e.ref_no}</span> {e.title}
                          <span className="block text-xs text-gray-400">{e.customer?.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">The enquiry being kept.</p>
            </div>
          )}
          <div>
            <label className={label}>Note{form.reason === 'OTHER' && <span className="text-red-500"> *</span>}</label>
            <textarea name="note" value={form.note} onChange={change} rows={3} required={form.reason === 'OTHER'}
              placeholder="Anything that helps later" className="ams-input resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={saving} className="btn-danger flex-1 justify-center py-2">{saving ? 'Archiving…' : 'Archive'}</button>
        </div>
      </form>
    </div>
  );
}

function RestoreModal({ enquiry, onClose, onDone }) {
  const [note, setNote]     = useState('');
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    if (!note.trim()) { setError('Say why it is restored'); return; }
    setSaving(true); setError('');
    try { const res = await apiPost(`/sales/enquiries/${enquiry.id}/restore`, { note: note.trim() }); onDone(res.data); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={go} className="w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Restore {enquiry.ref_no}</h2>
        <p className="text-sm text-gray-500 mb-4">It goes back to {enquiry.stage === 'LOST' ? 'Lost' : 'its stage'} with whoever held it, and is counted again.</p>
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <label className={label}>Why<span className="text-red-500"> *</span></label>
        <textarea value={note} onChange={(e) => { setNote(e.target.value); setError(''); }} rows={3} required
          placeholder="Archived by mistake, not a duplicate after all…" className="ams-input resize-none" />
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Restoring…' : 'Restore'}</button>
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
function EditModal({ enquiry, users, onClose, onDone, canReassign = true }) {
  const config = useSalesConfig();
  const currencies = useCurrencies();
  // Active currencies, plus the enquiry's own even if it has since been deactivated.
  const currencyOptions = (currencies?.list || []).some((c) => c.code === enquiry.currency_code)
    ? currencies?.list || []
    : [...(currencies?.list || []), { code: enquiry.currency_code, name: enquiry.currency?.name || enquiry.currency_code }];
  const currencyLocked = enquiry.stage === 'WON' || enquiry.stage === 'LOST';
  // Active applications, plus the current one even if it has since been made inactive.
  const appOptions = (config?.applications || []).filter((a) => a.is_active || a.id === enquiry.application_id);
  const [form, setForm] = useState({
    title: enquiry.title || '', customer_id: enquiry.customer_id || '', contact_id: enquiry.contact_id || '',
    owner_id: enquiry.owner_id || '', enquiry_type: enquiry.enquiry_type || 'INCOMING',
    is_refurbishment: Boolean(enquiry.is_refurbishment),
    application_id: enquiry.application_id ? String(enquiry.application_id) : '',
    currency_code: enquiry.currency_code || 'INR',
    expected_value: enquiry.expected_value ?? '', expected_close: toDateInput(enquiry.expected_close), description: enquiry.description || '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  // The type picks the flow (Generated skips Contacted), so it's fixed after New.
  const typeLocked = enquiry.stage !== 'NEW';
  // Refurbishment decides whether Concept is in the flow: fixed after Review.
  const refurbLocked = !['NEW', 'CONTACTED', 'REVIEW'].includes(enquiry.stage);

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
    if (refurbLocked) delete payload.is_refurbishment;
    if (currencyLocked) delete payload.currency_code;
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
              <select name="owner_id" value={form.owner_id} onChange={change} disabled={!canReassign}
                title={canReassign ? undefined : 'Changing the owner needs the Sales reassign permission'}
                className="ams-input disabled:bg-gray-50">
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
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={form.is_refurbishment} disabled={refurbLocked}
                  onChange={(e) => setForm((f) => ({ ...f, is_refurbishment: e.target.checked }))} />
                <span className="text-sm text-gray-700">
                  <span className="font-medium">Refurbishment enquiry</span>
                  <span className="block text-xs text-gray-500 mt-0.5">Skips the Concept stage — goes from Review straight to Costing.</span>
                </span>
              </label>
              {refurbLocked && <p className="text-xs text-gray-400 mt-1">Fixed once the enquiry has passed Review.</p>}
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Application</label>
              <select name="application_id" value={form.application_id} onChange={change} disabled={!config} className="ams-input">
                <option value="">{config ? '— None —' : 'Loading…'}</option>
                {appOptions.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_active ? '' : ' (inactive)'}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Currency</label>
              <select name="currency_code" value={form.currency_code} onChange={change} disabled={!currencies || currencyLocked}
                className="ams-input disabled:bg-gray-50 disabled:text-gray-500">
                {currencyOptions.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
              </select>
              {currencyLocked && <p className="text-xs text-gray-400 mt-1">Fixed once the enquiry is closed.</p>}
            </div>
            <div>
              <label className={label}>Expected Value ({form.currency_code})</label>
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
  const nav = useNav();
  const { me, can, loading: permLoading } = usePermissions();
  const salesConfig = useSalesConfig();
  const dc = useDisplayCurrency(); // the navbar's currency: the "≈" values (the server converts)

  const [enquiry, setEnquiry] = useState(null);
  const [users, setUsers]     = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [modal, setModal]     = useState(null);
  const [busy, setBusy]       = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const canDelete = me?.is_system || can('SALES_DELETE');
  // Reassignment (owner / handler) has its own permission, granted per role.
  const canReassign = me?.is_system || can('SALES_REASSIGN');

  const loadReadiness = useCallback(() => {
    apiGet(`/sales/enquiries/${id}/readiness`, { silent: true }).then((r) => setReadiness(r.data)).catch(() => {});
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiGet(`/sales/enquiries/${id}${dc.code !== 'INR' ? `?display_currency=${dc.code}` : ''}`); setEnquiry(res.data); loadReadiness(); }
    catch { setNotFound(true); }
    finally { setLoading(false); }
  }, [id, loadReadiness, dc.code]);

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
    try { await apiDelete(`/sales/enquiries/${id}`); nav('/dashboard/sales/enquiries'); }
    catch (err) { alert(err.message); setBusy(false); }
  };

  if (loading || permLoading) return <DetailPageSkeleton />;
  if (notFound || !enquiry) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Enquiry not found</p>
        <button onClick={() => nav('/dashboard/sales/enquiries')} className="text-sm text-blue-600 hover:underline">Back to enquiries</button>
      </div>
    );
  }

  // The "≈" values in the navbar's currency (expected at today's rate, the order at its won-day rate).
  const shownIn = (value) => (enquiry.display_currency && enquiry.display_currency !== 'INR'
    ? { value, code: enquiry.display_currency, symbol: dc.list.find((c) => c.code === enquiry.display_currency)?.symbol }
    : undefined);
  const shownExpected = shownIn(enquiry.expected_value_display);
  const shownOrder = shownIn(enquiry.order_value_display);
  const shownCurrent = shownIn(enquiry.current_value_display);

  const isClosed = enquiry.stage === 'WON' || enquiry.stage === 'LOST';
  // Archived: read-only for everyone until restored (Sales → Archive).
  const isArchived = Boolean(enquiry.archived_at);
  const live = !isArchived;
  const canArchive = Boolean(me?.is_system || can('SALES_ARCHIVE'));
  const handlerId = enquiry.handler_id ?? enquiry.owner_id;
  const isHolder = me?.id != null && me.id === handlerId;
  const isCreator = me?.id != null && (me.id === enquiry.created_by || me.id === enquiry.owner_id);
  // Matches the API (Backend/src/modules/sales/access.js):
  //   - the flow gives access: whoever holds it does the stage's work;
  //   - Sales → Edit (edit all): any open enquiry's details, anyone's documents, offer prices;
  //   - Sales own → Edit: deleting (own items) and editing details (raiser), while holding it;
  //   - Won: the raiser; Lost: whoever holds it; Reopen: Sales → Reassign.
  const canFlow = live && (me?.is_system || isHolder);
  const canEditAll = live && Boolean(me?.is_system || (can('SALES_EDIT') && !isClosed));
  const canEditOwn = live && can('SALES_EDIT_OWN') && isHolder;
  const canManage = canEditAll || canEditOwn;
  const canEditDetails = canEditAll || (canEditOwn && isCreator);
  const canWin = live && (me?.is_system || (isHolder && isCreator));
  const canReopen = live && (me?.is_system || can('SALES_REASSIGN'));
  const canReassignHere = live && canReassign;
  // Activities & reviews: open at every stage until Won / Lost — log with
  // Sales → View + Create, or View while it is with you (the flow gives access);
  // your own entries: edit with Sales activity → Edit while still in their stage, delete with Sales → Delete.
  const canLogActivity = live && (me?.is_system || (!isClosed && (can('SALES_VIEW') || can('SALES_VIEW_OWN')) && (can('SALES_CREATE') || isHolder)));
  const canEditActivity = live && (me?.is_system || can('SALES_ACTIVITY_EDIT'));
  const canDeleteActivity = live && (me?.is_system || can('SALES_DELETE'));
  const owns = (item) => live && Boolean(me?.is_system || (me?.id != null && item?.created_by === me.id));
  // Documents: their uploader — or anyone with Sales → Edit on an open enquiry.
  const ownsDocument = (item) => owns(item) || canEditAll;
  // An entry is edited only while the enquiry is still in the stage it was logged in.
  const editableAt = (item) => Boolean(me?.is_system || (item?.stage && item.stage === enquiry.stage));
  const wonBlocked = readiness?.blocked?.WON || [];

  return (
    <div className="pb-10">
      {/* Header — a full-width bar (no card border or rounding), divided from
          the content below by a single line. */}
      <div className="bg-white border-b border-gray-200 px-5 py-4">
        <div className="flex items-start gap-3">
          <button onClick={() => nav('/dashboard/sales/enquiries')}
            className="p-1.5 -ml-1.5 rounded hover:bg-gray-100 text-gray-500 cursor-pointer shrink-0" title="Back">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400">{enquiry.ref_no}</span>
              <StageBadge stage={enquiry.stage} />
              {isArchived && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-gray-200 text-gray-700">Archived</span>
              )}
              <span className="text-xs text-gray-500">{TYPE_LABEL[enquiry.enquiry_type] || enquiry.enquiry_type}</span>
              {enquiry.is_refurbishment && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700"
                  title="Refurbishment enquiry — skips the Concept stage">Refurbishment</span>
              )}
              <button onClick={() => setShowHistory(true)}
                className="text-xs text-blue-600 hover:underline cursor-pointer">Stage history</button>
              {enquiry.current_temperature && <TempChip value={enquiry.current_temperature} />}
            </div>
            <h1 className="text-xl font-semibold text-gray-800 mt-0.5 break-words">{enquiry.title}</h1>
            {(() => {
              const prob = salesConfig?.probability?.[enquiry.stage];
              const showWeighted = prob !== undefined && Number(enquiry.current_value) > 0 && !['WON', 'LOST'].includes(enquiry.stage);
              if (prob === undefined && !enquiry.application) return null;
              return (
                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                  {prob !== undefined && (
                    <span title="Win probability at the current stage (Sales → Configuration)"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-gray-800 bg-gray-100">
                      <span className="text-gray-500 font-normal">Probability:</span> {prob}%
                      {showWeighted && (
                        <span className="text-gray-500 font-normal">
                          · weighted {dc.formatterFor(enquiry.display_currency).format(Number(enquiry.current_value_display ?? enquiry.current_value_inr ?? enquiry.current_value) * prob / 100)}
                        </span>
                      )}
                    </span>
                  )}
                  {enquiry.application && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-[var(--ams-primary)] bg-[var(--ams-primary-mid)]">
                      <span className="text-gray-500 font-normal">Application:</span> {enquiry.application.name}
                    </span>
                  )}
                </div>
              );
            })()}
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-x-4 gap-y-1 flex-wrap">
              <button onClick={() => nav(`/dashboard/master-data/customers/${enquiry.customer_id}`)}
                className="hover:underline text-blue-600 cursor-pointer">{enquiry.customer?.name}</button>
              <span>Owner: {enquiry.owner?.name || '—'}</span>
              {!isClosed && (
                <span className="inline-flex items-center gap-1">
                  With:
                  <span className="font-medium text-gray-700">{enquiry.handler?.name || enquiry.owner?.name || '—'}</span>
                  {isHolder && <span className="text-[10px] font-semibold text-green-700 bg-green-50 rounded px-1 py-0.5">you</span>}
                  {enquiry.queue_department_id && <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 rounded px-1 py-0.5">to assign</span>}
                </span>
              )}
              {enquiry.current_value != null && (
                <span className="inline-flex items-center gap-1">Value: <MoneyText value={enquiry.current_value} inr={enquiry.current_value_inr} code={enquiry.currency_code} symbol={enquiry.currency?.symbol} shown={shownCurrent} />
                  <ValueBasis basis={enquiry.current_value_basis} label={enquiry.current_value_label} /></span>
              )}
            </div>
            {enquiry.queue_department_id && !isClosed && live && (
              <EnquiryQueueBanner enquiry={enquiry} me={me} onAssigned={() => load()} />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <IssueRecordButton module="sales" entityType="Enquiry" entityId={enquiry.id} label={`${enquiry.ref_no} · ${enquiry.title}`} />
              {(canFlow || canReopen || canEditDetails) && (
                <>
                  {canEditDetails && (
                    <button onClick={() => setModal('edit')} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Edit</button>
                  )}
                  {!isClosed ? (
                    canFlow && <>
                      {canWin && <button onClick={() => setModal('win')} disabled={wonBlocked.length > 0}
                        title={wonBlocked.length ? `Needs ${wonBlocked.join(' & ')} first` : 'Mark won'}
                        className="px-3 py-1.5 text-sm font-medium text-white rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: '#15803D' }}>Won</button>}
                      <button onClick={() => setModal('lose')} className="btn-danger px-3 py-1.5 text-sm cursor-pointer">Lost</button>
                    </>
                  ) : (
                    canReopen && <button onClick={reopen} disabled={busy} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Reopen</button>
                  )}
                </>
              )}
              {canReassignHere && !isClosed && (
                <button onClick={() => setModal('reassign')} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Reassign</button>
              )}
              {canArchive && live && enquiry.stage !== 'WON' && (
                <button onClick={() => setModal('archive')} title="Archive — e.g. a duplicate enquiry"
                  className="btn-secondary px-3 py-1.5 text-sm cursor-pointer">Archive</button>
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
        </div>
      </div>

      <div className="space-y-4 p-4">
      {/* Archived banner */}
      {isArchived && (
        <div className="rounded-lg border border-gray-300 bg-gray-100 px-5 py-3 flex flex-wrap items-start gap-x-8 gap-y-2">
          <Field label="Archived">
            <span className="text-gray-800">{fmtDate(enquiry.archived_at)}{enquiry.archived_by?.name ? ` by ${enquiry.archived_by.name}` : ''}</span>
          </Field>
          <Field label="Reason">
            <span className="text-gray-800">
              {ARCHIVE_REASON_LABEL[enquiry.archive_reason] || enquiry.archive_reason}
              {enquiry.duplicate_of && (
                <> of <button onClick={() => nav(`/dashboard/sales/enquiries/${enquiry.duplicate_of.id}`)}
                  className="text-blue-600 hover:underline cursor-pointer font-mono text-xs">{enquiry.duplicate_of.ref_no}</button> {enquiry.duplicate_of.title}</>
              )}
            </span>
          </Field>
          {enquiry.archive_note && <Field label="Note"><span className="whitespace-pre-wrap text-gray-800">{enquiry.archive_note}</span></Field>}
          <p className="basis-full text-xs text-gray-500">Not counted in dashboards or reports, no reminders or flows — read-only until restored.</p>
          {canArchive && (
            <button onClick={() => setModal('restore')} className="btn-secondary px-3 py-1.5 text-sm cursor-pointer ml-auto">Restore</button>
          )}
        </div>
      )}
      {/* Won / Lost banner */}
      {enquiry.stage === 'WON' && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-3 space-y-3">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Field label="PO Value">
              <MoneyText className="font-semibold text-green-800" value={enquiry.order_value} inr={enquiry.order_value_inr}
                code={enquiry.currency_code} symbol={enquiry.currency?.symbol} shown={shownOrder} />
            </Field>
            <Field label="PO Number">{enquiry.order_no}</Field>
            <Field label="PO Date">{fmtDate(enquiry.order_date)}</Field>
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
      <EnquiryProcess enquiry={enquiry} canManage={canFlow} busy={busy} onPick={changeStage} blocked={readiness?.blocked} />

      {/* Two columns (60 / 40): the record (details, documents) on the left;
          the conversation (reviews, activity log) on the right. Stacks on small
          screens. */}
      {(() => {
        const showReviews = true; // reviews can be logged at any stage
        // The activity log is there from New for both types: field sales follow
        // up on a Generated enquiry before its format is ready, too. (Only an
        // Incoming enquiry moves to Contacted on its first activity.)
        return (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
            <div className="space-y-4 min-w-0">
              <Section title="Customer & Details" right={
                <button onClick={() => nav(`/dashboard/master-data/customers/${enquiry.customer_id}`)}
                  className="text-xs text-blue-600 hover:underline cursor-pointer">Open customer</button>
              }>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                  <Field label="Customer">{enquiry.customer?.name}</Field>
                  <Field label="GSTIN">{enquiry.customer?.gstin}</Field>
                  <Field label="State">{enquiry.customer?.state}{enquiry.customer?.state_code ? ` (${enquiry.customer.state_code})` : ''}</Field>
                  <Field label="Contact">{enquiry.contact?.name}</Field>
                  <Field label="Designation">{enquiry.contact?.designation}</Field>
                  <Field label="Contact Info">{[enquiry.contact?.email, enquiry.contact?.phone].filter(Boolean).join(' · ') || null}</Field>
                  <Field label="Type">{TYPE_LABEL[enquiry.enquiry_type] || enquiry.enquiry_type}</Field>
                  <Field label="Owner">{enquiry.owner?.name}</Field>
                  <Field label="Temperature">{enquiry.current_temperature ? <TempChip value={enquiry.current_temperature} /> : null}</Field>
                  <Field label="Currency">{enquiry.currency_code}{enquiry.currency?.name ? ` · ${enquiry.currency.name}` : ''}</Field>
                  <Field label="Expected Value">
                    {enquiry.expected_value != null
                      ? <MoneyText value={enquiry.expected_value} inr={enquiry.expected_value_inr} code={enquiry.currency_code} symbol={enquiry.currency?.symbol} shown={shownExpected} />
                      : null}
                  </Field>
                  <Field label="Current Value">
                    {enquiry.current_value != null
                      ? <span className="inline-flex items-center gap-1"><MoneyText value={enquiry.current_value} inr={enquiry.current_value_inr} code={enquiry.currency_code} symbol={enquiry.currency?.symbol} shown={shownCurrent} /><ValueBasis basis={enquiry.current_value_basis} label={enquiry.current_value_label} /></span>
                      : null}
                  </Field>
                  <Field label="Expected Close">{fmtDate(enquiry.expected_close)}</Field>
                  <Field label="Created">{fmtDate(enquiry.created_at)}</Field>
                  <Field label="Created by">{enquiry.created_by ? (users.find((u) => String(u.id) === String(enquiry.created_by))?.name || `#${enquiry.created_by}`) : '—'}</Field>
                  {enquiry.description && (
                    <div className="col-span-2 sm:col-span-3"><Field label="Description">{enquiry.description}</Field></div>
                  )}
                </div>
              </Section>
              <EnquiryAttachments enquiryId={enquiry.id} canEdit={canFlow || canEditAll} canManage={canFlow || canEditAll} canSend={canFlow} canDelete={canManage} owns={ownsDocument} kinds={visibleDocKinds(enquiry.stage, enquiry.is_refurbishment)} onChanged={load}
                currencyCode={enquiry.currency_code} currencySymbol={enquiry.currency?.symbol}
                finalCost={enquiry.final_cost} canCost={canFlow && COSTED_STAGES.includes(enquiry.stage)} />
            </div>
            <div className="space-y-4 min-w-0">
              {showReviews && <EnquiryReviews enquiryId={enquiry.id} canCreate={canLogActivity} canEdit={canEditActivity} canDelete={canDeleteActivity} owns={owns} editableAt={editableAt} users={users} onChanged={load} />}
              <div id="activity">
                <EnquiryActivities enquiryId={enquiry.id} canCreate={canLogActivity} canEdit={canEditActivity} canDelete={canDeleteActivity} owns={owns} editableAt={editableAt} users={users} stage={enquiry.stage} onChanged={load} />
              </div>
              <EnquiryFlows enquiryId={enquiry.id} version={enquiry.updated_at} />
            </div>
          </div>
        );
      })()}


      {showHistory && <StageHistoryDrawer events={enquiry.stageEvents} users={users} onClose={() => setShowHistory(false)} />}

      {modal === 'edit'  && <EditModal enquiry={enquiry} users={users} canReassign={canReassign} onClose={() => setModal(null)} onDone={setEnquiry} />}
      {modal === 'reassign' && <ReassignModal enquiry={enquiry} users={users} onClose={() => setModal(null)} onDone={setEnquiry} />}
      {modal === 'win'   && <WinModal enquiryId={enquiry.id} currencyCode={enquiry.currency_code} onClose={() => setModal(null)} onDone={setEnquiry} />}
      {modal === 'lose'  && <LoseModal enquiryId={enquiry.id} onClose={() => setModal(null)} onDone={setEnquiry} />}
      {modal === 'archive' && <ArchiveModal enquiry={enquiry} onClose={() => setModal(null)} onDone={() => load()} />}
      {modal === 'restore' && <RestoreModal enquiry={enquiry} onClose={() => setModal(null)} onDone={() => load()} />}
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
    </div>
  );
}
