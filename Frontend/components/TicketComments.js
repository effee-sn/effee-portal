'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';

/** Compact relative time for a comment. */
const timeAgo = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24); if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const initials = (name) =>
  (name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

/**
 * Ticket discussion thread. Anyone who can view the ticket may read and post
 * while it is open; once closed the thread is read-only. The author (or a
 * moderator) may remove a comment while the ticket is open.
 *
 * @param {{ ticketId: string|number, closed: boolean, me: object, canModerate: boolean }} props
 */
export default function TicketComments({ ticketId, closed, me, canModerate }) {
  const [comments, setComments] = useState([]);
  const [body, setBody]         = useState('');
  const [loading, setLoading]   = useState(true);
  const [posting, setPosting]   = useState(false);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiGet(`/service/tickets/${ticketId}/comments`); setComments(r.data || []); }
    catch { setComments([]); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const post = async (e) => {
    e.preventDefault();
    if (!body.trim() || posting) return;
    setPosting(true); setError('');
    try {
      const r = await apiPost(`/service/tickets/${ticketId}/comments`, { body });
      setComments((prev) => [...prev, r.data]);
      setBody('');
    } catch (err) { setError(err.message); }
    finally { setPosting(false); }
  };

  const remove = async (c) => {
    if (!window.confirm('Remove this comment?')) return;
    setError('');
    try { const r = await apiDelete(`/service/tickets/${ticketId}/comments/${c.id}`); setComments(r.data || []); }
    catch (err) { setError(err.message); }
  };

  const canRemove = (c) => !closed && me && (c.user_id === me.id || canModerate);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">
          Comments {comments.length > 0 && <span className="text-gray-400 font-normal">· {comments.length}</span>}
        </h2>
      </div>

      <div className="px-5 py-4 space-y-4">
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-400">No comments yet.</p>
        ) : (
          <div className="space-y-4">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-3 group">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                  style={{ backgroundColor: '#875A7B' }}>
                  {initials(c.user_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{c.user_name || 'Unknown'}</span>
                    <span className="text-[11px] text-gray-400">{timeAgo(c.created_at)}</span>
                    {canRemove(c) && (
                      <button onClick={() => remove(c)}
                        className="cursor-pointer ml-auto text-[11px] text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition">
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Composer — hidden when the ticket is closed (read-only thread). */}
        {closed ? (
          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            This ticket is closed — comments are read-only.
          </p>
        ) : (
          <form onSubmit={post} className="border-t border-gray-100 pt-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="Write a comment…"
              className="ams-input resize-none w-full"
            />
            <div className="flex justify-end mt-2">
              <button type="submit" disabled={posting || !body.trim()}
                className="cursor-pointer px-3 py-1.5 text-sm font-medium text-white rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--ams-primary)' }}>
                {posting ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
