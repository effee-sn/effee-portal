'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import UserMultiSelect from '@/components/UserMultiSelect';
import { ListSkeleton } from '@/components/Skeleton';

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ── Log / edit review ─────────────────────────────────────────────────────────
function ReviewModal({ enquiryId, review, users, onClose, onSaved }) {
  const isEdit = Boolean(review);
  const [form, setForm] = useState({
    subject: review?.subject || 'Internal review',
    activity_at: toLocalInput(review?.activity_at || new Date()),
    internal_participants: (review?.internal_participants || []).map(String),
    minutes: review?.minutes || '',
    follow_up_at: review?.follow_up_at ? toLocalInput(review.follow_up_at) : '',
    no_future_review: review?.follow_up_ended || false,
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const change = (e) => {
    const { name, type, checked, value } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        is_review: true,
        type: 'MEETING',
        subject: form.subject,
        activity_at: form.activity_at,
        internal_participants: form.internal_participants,
        minutes: form.minutes,
        follow_up_ended: form.no_future_review,
        follow_up_at: form.no_future_review ? '' : form.follow_up_at,
      };
      if (isEdit) await apiPut(`/sales/activities/${review.id}`, payload);
      else await apiPost(`/sales/enquiries/${enquiryId}/activities`, payload);
      onSaved();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? 'Edit Review' : 'Log Review'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Subject / Agenda</label>
              <input name="subject" value={form.subject} onChange={change} required className="ams-input" />
            </div>
            <div>
              <label className={label}>Review date &amp; time</label>
              <input name="activity_at" type="datetime-local" value={form.activity_at} onChange={change} required className="ams-input" />
            </div>
          </div>
          <div>
            <label className={label}>Participants (attended)</label>
            <UserMultiSelect users={users} value={form.internal_participants}
              onChange={(ids) => setForm((f) => ({ ...f, internal_participants: ids }))} />
          </div>
          <div>
            <label className={label}>Minutes of Meeting (MOM)</label>
            <textarea name="minutes" value={form.minutes} onChange={change} rows={4} className="ams-input resize-none"
              placeholder="What was discussed, decisions, action items…" />
          </div>
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Next review</p>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" name="no_future_review" checked={form.no_future_review} onChange={change} className="rounded" />
              No future review (conclude the review)
            </label>
            {!form.no_future_review && (
              <div>
                <label className={label}>Next review date &amp; time</label>
                <input name="follow_up_at" type="datetime-local" value={form.follow_up_at} onChange={change} className="ams-input" />
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-1 pb-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : isEdit ? 'Save' : 'Log Review'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reviews card ──────────────────────────────────────────────────────────────
export default function EnquiryReviews({ enquiryId, canEdit, users = [], onChanged }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const userName = (id) => users.find((u) => String(u.id) === String(id))?.name || `#${id}`;

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiGet(`/sales/enquiries/${enquiryId}/activities?review=true`, { silent: true }); setItems(res.data || []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, [enquiryId]);

  useEffect(() => { load(); }, [load]);

  const onSaved = () => { load(); onChanged?.(); };
  const del = async (id) => {
    try { await apiDelete(`/sales/activities/${id}`); setConfirmDel(null); load(); onChanged?.(); }
    catch (err) { alert(err.message); }
  };

  const concluded = items.some((r) => r.follow_up_ended);

  const Item = ({ r }) => (
    <li className="group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{r.subject}</span>
            <span className="text-xs text-gray-400">{fmtDateTime(r.activity_at)}</span>
          </div>
          {r.minutes && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{r.minutes}</p>}
          {r.internal_participants?.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">Attended: {r.internal_participants.map(userName).join(', ')}</p>
          )}
          <div className="mt-1.5 text-xs">
            {r.follow_up_ended ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">No future review</span>
            ) : r.follow_up_at ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">Next review: {fmtDateTime(r.follow_up_at)}</span>
            ) : null}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => setModal({ type: 'edit', review: r })}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 cursor-pointer" title="Edit">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={() => setConfirmDel(r)}
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
        <h2 className="text-sm font-semibold text-gray-800">Reviews{items.length ? ` (${items.length})` : ''}</h2>
        <div className="flex items-center gap-3">
          {items.length > 0 && (
            <button onClick={() => setShowAll(true)} className="text-xs text-blue-600 hover:underline cursor-pointer">Show reviews</button>
          )}
          {canEdit && (
            <button onClick={() => setModal({ type: 'create' })}
              className="px-2.5 py-1 text-xs font-medium text-white rounded-sm cursor-pointer"
              style={{ backgroundColor: 'var(--ams-primary)' }}>Log Review</button>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        {!loading && !concluded && items.length > 0 && (
          <p className="text-xs text-amber-700 mb-3">A future review is still open — mark a review “No future review” to move on to Concept.</p>
        )}
        {loading ? (
          <ListSkeleton rows={2} />
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 py-2 text-center">No reviews yet. Log the internal review.</p>
        ) : (
          <>
            <ol className="space-y-4">
              {items.slice(0, 3).map((r) => <Item key={r.id} r={r} />)}
            </ol>
            {items.length > 3 && (
              <button onClick={() => setShowAll(true)} className="mt-3 text-xs text-blue-600 hover:underline cursor-pointer">
                + {items.length - 3} more — show all reviews
              </button>
            )}
          </>
        )}
      </div>

      {/* All reviews — right off-canvas */}
      {showAll && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAll(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">Reviews ({items.length})</h2>
              <div className="flex items-center gap-3">
                {canEdit && (
                  <button onClick={() => setModal({ type: 'create' })}
                    className="px-2.5 py-1 text-xs font-medium text-white rounded-sm cursor-pointer"
                    style={{ backgroundColor: 'var(--ams-primary)' }}>Log Review</button>
                )}
                <button onClick={() => setShowAll(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <p className="text-sm text-gray-400">No reviews yet.</p>
              ) : (
                <ol className="space-y-4">{items.map((r) => <Item key={r.id} r={r} />)}</ol>
              )}
            </div>
          </div>
        </div>
      )}

      {modal?.type === 'create' && <ReviewModal enquiryId={enquiryId} users={users} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'edit'   && <ReviewModal enquiryId={enquiryId} review={modal.review} users={users} onClose={() => setModal(null)} onSaved={onSaved} />}

      {confirmDel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-2">Delete Review</h2>
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
