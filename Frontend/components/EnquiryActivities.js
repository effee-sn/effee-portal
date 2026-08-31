'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { ACTIVITY_MEDIUMS, MEDIUM_LABEL, TEMPERATURES, TEMPERATURE_STYLE, STAGE_STYLE } from '@/lib/salesOptions';
import UserMultiSelect from '@/components/UserMultiSelect';

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const isOverdue = (iso, ended) => iso && !ended && new Date(iso) < new Date(new Date().toDateString());

function TempChip({ value }) {
  const s = TEMPERATURE_STYLE[value];
  if (!s) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>
  );
}

// ── Add / edit modal ──────────────────────────────────────────────────────────
function ActivityModal({ enquiryId, activity, users, stage, onClose, onSaved }) {
  const isEdit = Boolean(activity);
  // The "needs negotiation" flag only does anything at the Follow-up stage,
  // where it flips the enquiry into Negotiation.
  const canNegotiate = stage === 'FOLLOW_UP';
  const [form, setForm] = useState({
    type: activity?.type || 'CALL',
    activity_at: toLocalInput(activity?.activity_at || new Date()),
    subject: activity?.subject || '',
    minutes: activity?.minutes || '',
    outcome: activity?.outcome || '',
    duration_min: activity?.duration_min ?? '',
    internal_participants: (activity?.internal_participants || []).map(String),
    customer_participants: activity?.customer_participants || '',
    next_action: activity?.next_action || '',
    follow_up_at: toDateInput(activity?.follow_up_at),
    next_medium: activity?.next_medium || '',
    temperature: activity?.temperature || '',
    follow_up_ended: activity?.follow_up_ended || false,
    needs_negotiation: activity?.needs_negotiation || false,
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const change = (e) => {
    const { name, type, checked, value, options, multiple } = e.target;
    if (multiple) {
      const vals = Array.from(options).filter((o) => o.selected).map((o) => o.value);
      setForm((f) => ({ ...f, [name]: vals }));
    } else {
      setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    }
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = isEdit
        ? await apiPut(`/sales/activities/${activity.id}`, form)
        : await apiPost(`/sales/enquiries/${enquiryId}/activities`, form);
      onSaved();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? 'Edit Activity' : 'Log Activity'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>Medium</label>
              <select name="type" value={form.type} onChange={change} className="ams-input">
                {ACTIVITY_MEDIUMS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Date &amp; Time</label>
              <input name="activity_at" type="datetime-local" value={form.activity_at} onChange={change} required className="ams-input" />
            </div>
          </div>

          <div>
            <label className={label}>Subject<span className="text-red-500"> *</span></label>
            <input name="subject" value={form.subject} onChange={change} required placeholder="What was this interaction about?" className="ams-input" />
          </div>
          <div>
            <label className={label}>Minutes / Notes (MOM)</label>
            <textarea name="minutes" value={form.minutes} onChange={change} rows={3} className="ams-input resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Outcome</label>
              <textarea name="outcome" value={form.outcome} onChange={change} rows={2} className="ams-input resize-none" />
            </div>
            <div>
              <label className={label}>Duration (min)</label>
              <input name="duration_min" type="number" min="0" value={form.duration_min} onChange={change} className="ams-input" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Internal participants</label>
              <UserMultiSelect users={users} value={form.internal_participants}
                onChange={(ids) => setForm((f) => ({ ...f, internal_participants: ids }))} />
            </div>
            <div>
              <label className={label}>Customer participants</label>
              <input name="customer_participants" value={form.customer_participants} onChange={change}
                placeholder="e.g. Mr. Rao (Purchase)" className="ams-input" />
            </div>
          </div>

          {/* Follow-up */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Follow-up</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={label}>Next follow-up date</label>
                <input name="follow_up_at" type="date" value={form.follow_up_at} onChange={change} className="ams-input" />
              </div>
              <div>
                <label className={label}>Next medium</label>
                <select name="next_medium" value={form.next_medium} onChange={change} className="ams-input">
                  <option value="">— None —</option>
                  {ACTIVITY_MEDIUMS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Temperature</label>
                <select name="temperature" value={form.temperature} onChange={change} className="ams-input">
                  <option value="">— None —</option>
                  {TEMPERATURES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={label}>Next action</label>
              <input name="next_action" value={form.next_action} onChange={change} placeholder="What needs to happen next?" className="ams-input" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" name="follow_up_ended" checked={form.follow_up_ended} onChange={change} className="rounded" />
              Follow-up ended (no more follow-ups needed)
            </label>
            {canNegotiate && (
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" name="needs_negotiation" checked={form.needs_negotiation} onChange={change} className="rounded" />
                <span>Needs negotiation <span className="text-gray-400">— moves the enquiry to the Negotiation stage on save</span></span>
              </label>
            )}
          </div>

          <div className="flex gap-3 pt-1 pb-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────
export default function EnquiryActivities({ enquiryId, canEdit, users = [], stage, onChanged }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const userName = (id) => users.find((u) => String(u.id) === String(id))?.name || `#${id}`;

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiGet(`/sales/enquiries/${enquiryId}/activities?review=false`, { silent: true }); setItems(res.data || []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, [enquiryId]);

  useEffect(() => { load(); }, [load]);

  const onSaved = () => { load(); onChanged?.(); };

  const del = async (id) => {
    try { await apiDelete(`/sales/activities/${id}`); setConfirmDel(null); load(); onChanged?.(); }
    catch (err) { alert(err.message); }
  };

  const Item = ({ a }) => (
    <li className="mb-5 ml-4 group">
      <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-white"
        style={{ backgroundColor: a.temperature ? (TEMPERATURE_STYLE[a.temperature]?.color || '#9CA3AF') : '#9CA3AF' }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{MEDIUM_LABEL[a.type] || a.type}</span>
            <span className="text-xs text-gray-400">{fmtDateTime(a.activity_at)}</span>
            {a.duration_min ? <span className="text-xs text-gray-400">· {a.duration_min}m</span> : null}
            {a.temperature && <TempChip value={a.temperature} />}
            {a.stage && STAGE_STYLE[a.stage] && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ color: STAGE_STYLE[a.stage].color, backgroundColor: STAGE_STYLE[a.stage].bg }}>
                {STAGE_STYLE[a.stage].label}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-800 mt-0.5">{a.subject}</p>
          {a.minutes && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{a.minutes}</p>}
          {a.outcome && <p className="text-xs text-gray-500 mt-1"><span className="font-semibold">Outcome:</span> {a.outcome}</p>}
          {(a.internal_participants?.length > 0 || a.customer_participants) && (
            <p className="text-xs text-gray-400 mt-1">
              {a.internal_participants?.length > 0 && <>With: {a.internal_participants.map(userName).join(', ')}</>}
              {a.internal_participants?.length > 0 && a.customer_participants && ' · '}
              {a.customer_participants && <>Customer: {a.customer_participants}</>}
            </p>
          )}
          {(a.follow_up_at || a.next_action || a.needs_negotiation) && (
            <div className="mt-1.5 text-xs flex items-center gap-2 flex-wrap">
              {a.needs_negotiation && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded font-medium" style={{ color: STAGE_STYLE.NEGOTIATION.color, backgroundColor: STAGE_STYLE.NEGOTIATION.bg }}>
                  Negotiation requested
                </span>
              )}
              {a.follow_up_ended ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">Follow-up ended</span>
              ) : a.follow_up_at ? (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-medium ${isOverdue(a.follow_up_at, a.follow_up_ended) ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  Next: {fmtDate(a.follow_up_at)}{a.next_medium ? ` · ${MEDIUM_LABEL[a.next_medium]}` : ''}{isOverdue(a.follow_up_at, a.follow_up_ended) ? ' · overdue' : ''}
                </span>
              ) : null}
              {a.next_action && <span className="text-gray-500">{a.next_action}</span>}
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => setModal({ type: 'edit', activity: a })}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 cursor-pointer" title="Edit">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={() => setConfirmDel(a)}
              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer" title="Delete">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </li>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Activity Timeline{items.length ? ` (${items.length})` : ''}</h2>
        <div className="flex items-center gap-3">
          {items.length > 0 && (
            <button onClick={() => setShowAll(true)} className="text-xs text-blue-600 hover:underline cursor-pointer">Show activities</button>
          )}
          {canEdit && (
            <button onClick={() => setModal({ type: 'create' })}
              className="px-2.5 py-1 text-xs font-medium text-white rounded-sm cursor-pointer"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              Log Activity
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No activity yet. Log the first interaction.</p>
        ) : (
          <>
            <ol className="relative border-l border-gray-200 ml-2">
              {items.slice(0, 3).map((a) => <Item key={a.id} a={a} />)}
            </ol>
            {items.length > 3 && (
              <button onClick={() => setShowAll(true)} className="mt-1 text-xs text-blue-600 hover:underline cursor-pointer">
                + {items.length - 3} more — show all activity
              </button>
            )}
          </>
        )}
      </div>

      {/* All activity — right off-canvas */}
      {showAll && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAll(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">Activity Timeline ({items.length})</h2>
              <div className="flex items-center gap-3">
                {canEdit && (
                  <button onClick={() => setModal({ type: 'create' })}
                    className="px-2.5 py-1 text-xs font-medium text-white rounded-sm cursor-pointer"
                    style={{ backgroundColor: 'var(--ams-primary)' }}>Log Activity</button>
                )}
                <button onClick={() => setShowAll(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ol className="relative border-l border-gray-200 ml-2">
                {items.map((a) => <Item key={a.id} a={a} />)}
              </ol>
            </div>
          </div>
        </div>
      )}

      {modal?.type === 'create' && <ActivityModal enquiryId={enquiryId} users={users} stage={stage} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'edit'   && <ActivityModal enquiryId={enquiryId} activity={modal.activity} users={users} stage={stage} onClose={() => setModal(null)} onSaved={onSaved} />}

      {confirmDel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-2">Delete Activity</h2>
            <p className="text-sm text-gray-500 mb-4">Delete “{confirmDel.subject}”? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
              <button onClick={() => del(confirmDel.id)} className="btn-danger flex-1 justify-center py-2">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
