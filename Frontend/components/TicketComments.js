'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';

/** Compact relative time. */
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

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renders a comment body, highlighting @mentions of known ticket people. */
function MentionText({ text, people }) {
  const names = (people || []).map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length === 0) return <>{text}</>;

  const re = new RegExp(`@(${names.map(escapeRe).join('|')})`, 'g');
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={m.index} className="text-indigo-600 font-medium">@{m[1]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Builds the reply tree; comments whose parent is missing become roots. */
function buildTree(list) {
  const byId = new Map(list.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent_id != null ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

// ── Composer with @-mention autocomplete ─────────────────────────────────────
function Composer({ people, onSubmit, onCancel, placeholder = 'Write a comment…', compact }) {
  const [body, setBody]           = useState('');
  const [mentioned, setMentioned] = useState([]); // {id, name} chosen from the menu
  const [menu, setMenu]           = useState(null); // { query, start } while typing @…
  const [busy, setBusy]           = useState(false);
  const taRef = useRef(null);

  const onChange = (e) => {
    const val = e.target.value;
    setBody(val);
    const upto = val.slice(0, e.target.selectionStart);
    const m = /(?:^|\s)@([\w.\-]*)$/.exec(upto); // active @token (before any space)
    setMenu(m ? { query: m[1].toLowerCase(), start: e.target.selectionStart - m[1].length - 1 } : null);
  };

  const suggestions = menu
    ? people.filter((p) => p.name && p.name.toLowerCase().includes(menu.query)).slice(0, 6)
    : [];

  const pick = (person) => {
    const cursor = taRef.current?.selectionStart ?? body.length;
    const next = `${body.slice(0, menu.start)}@${person.name} ${body.slice(cursor)}`;
    setBody(next);
    setMentioned((prev) => (prev.some((x) => x.id === person.id) ? prev : [...prev, person]));
    setMenu(null);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const submit = async (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    // Only send mentions whose @name is still present in the text.
    const ids = mentioned.filter((mm) => body.includes(`@${mm.name}`)).map((mm) => mm.id);
    setBusy(true);
    const ok = await onSubmit(text, ids);
    setBusy(false);
    if (ok) { setBody(''); setMentioned([]); setMenu(null); }
  };

  return (
    <form onSubmit={submit} className={`relative ${compact ? '' : 'border-t border-gray-100 pt-3'}`}>
      <textarea
        ref={taRef}
        value={body}
        onChange={onChange}
        rows={2}
        placeholder={placeholder}
        className="ams-input resize-none w-full"
      />
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((p) => (
            <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 cursor-pointer">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ backgroundColor: '#875A7B' }}>{initials(p.name)}</span>
              <span className="text-gray-700 truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="cursor-pointer px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800">Cancel</button>
        )}
        <button type="submit" disabled={busy || !body.trim()}
          className="cursor-pointer px-3 py-1.5 text-sm font-medium text-white rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--ams-primary)' }}>
          {busy ? 'Posting…' : (compact ? 'Reply' : 'Comment')}
        </button>
      </div>
    </form>
  );
}

// ── One comment + its replies (recursive) ────────────────────────────────────
function CommentNode({ node, depth, people, closed, canRemove, replyTo, setReplyTo, onReply, onRemove }) {
  return (
    <div className={depth > 0 ? 'pl-4 border-l border-gray-100' : ''}>
      <div className="flex gap-3 group">
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
          style={{ backgroundColor: '#875A7B' }}>{initials(node.user_name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{node.user_name || 'Unknown'}</span>
            <span className="text-[11px] text-gray-400">{timeAgo(node.created_at)}</span>
            <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
              {!closed && (
                <button onClick={() => setReplyTo(replyTo === node.id ? null : node.id)}
                  className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-700">Reply</button>
              )}
              {canRemove(node) && (
                <button onClick={() => onRemove(node)}
                  className="cursor-pointer text-[11px] text-gray-400 hover:text-red-600">Remove</button>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mt-0.5">
            <MentionText text={node.body} people={people} />
          </p>

          {replyTo === node.id && !closed && (
            <div className="mt-2">
              <Composer people={people} compact placeholder={`Reply to ${node.user_name || 'comment'}…`}
                onCancel={() => setReplyTo(null)}
                onSubmit={(body, mentions) => onReply(body, mentions, node.id)} />
            </div>
          )}
        </div>
      </div>

      {node.children.length > 0 && (
        <div className="mt-4 space-y-4">
          {node.children.map((child) => (
            <CommentNode key={child.id} node={child} depth={depth + 1} people={people} closed={closed}
              canRemove={canRemove} replyTo={replyTo} setReplyTo={setReplyTo} onReply={onReply} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Thread ────────────────────────────────────────────────────────────────────
export default function TicketComments({ ticketId, closed, me, canModerate, people = [] }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [replyTo, setReplyTo]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiGet(`/service/tickets/${ticketId}/comments`); setComments(r.data || []); }
    catch { setComments([]); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const post = async (body, mentions, parentId) => {
    setError('');
    try {
      const r = await apiPost(`/service/tickets/${ticketId}/comments`, { body, parent_id: parentId ?? undefined, mentions });
      setComments((prev) => [...prev, r.data]);
      setReplyTo(null);
      return true;
    } catch (e) { setError(e.message); return false; }
  };

  const remove = async (c) => {
    if (!window.confirm('Remove this comment?')) return;
    setError('');
    try { const r = await apiDelete(`/service/tickets/${ticketId}/comments/${c.id}`); setComments(r.data || []); }
    catch (e) { setError(e.message); }
  };

  const canRemove = (c) => !closed && me && (c.user_id === me.id || canModerate);
  const tree = buildTree(comments);

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
        ) : tree.length === 0 ? (
          <p className="text-sm text-gray-400">No comments yet.</p>
        ) : (
          <div className="space-y-4">
            {tree.map((node) => (
              <CommentNode key={node.id} node={node} depth={0} people={people} closed={closed}
                canRemove={canRemove} replyTo={replyTo} setReplyTo={setReplyTo}
                onReply={post} onRemove={remove} />
            ))}
          </div>
        )}

        {closed ? (
          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            This ticket is closed — comments are read-only.
          </p>
        ) : (
          <Composer people={people} onSubmit={(body, mentions) => post(body, mentions, null)} />
        )}
      </div>
    </div>
  );
}
