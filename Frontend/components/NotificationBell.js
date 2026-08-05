'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { pushSupported, currentPushState, enablePush, disablePush } from '@/lib/push';

/** Compact relative time for a notification row. */
const timeAgo = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24); if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
};

/**
 * Top-bar notification bell: an unread badge, a dropdown of recent items, and
 * click-to-open (marks read + deep-links to the ticket). The unread count polls
 * on an interval; the full list loads when the dropdown is opened.
 */
export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [items, setItems]   = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pushState, setPushState] = useState('unsupported'); // unsupported|denied|default|subscribed|busy
  const ref = useRef(null);

  const refreshCount = useCallback(async () => {
    try { const r = await apiGet('/notifications/unread-count'); setUnread(r.data?.unread ?? 0); } catch { /* silent */ }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGet('/notifications?limit=12');
      setItems(r.data || []);
      setUnread(r.meta?.unread ?? 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // Near-real-time badge: poll the unread count every 5s, but only while the tab
  // is visible — a backgrounded tab makes no requests, and regaining focus does
  // an immediate refresh so the badge is current the moment you look at it.
  useEffect(() => {
    const tick = () => { if (!document.hidden) refreshCount(); };
    tick();
    const t = setInterval(tick, 5000);
    const onVisible = () => { if (!document.hidden) refreshCount(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [refreshCount]);

  // Close on any outside click.
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Resolve this browser's push state once, for the enable/disable control.
  useEffect(() => { if (pushSupported()) currentPushState().then(setPushState); }, []);

  const togglePush = async () => {
    setPushState('busy');
    try {
      if (pushState === 'subscribed') { await disablePush(); setPushState('default'); }
      else { setPushState(await enablePush()); }
    } catch { setPushState(await currentPushState()); }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read_at) {
      try { const r = await apiPost(`/notifications/${n.id}/read`); setUnread(r.data?.unread ?? 0); } catch { /* silent */ }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    if (n.link) router.push(n.link);
  };

  const markAll = async () => {
    try { await apiPost('/notifications/read-all'); } catch { /* silent */ }
    setUnread(0);
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 transition cursor-pointer"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 h-11 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer">Mark all read</button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">You&apos;re all caught up.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition flex gap-2.5 cursor-pointer ${n.read_at ? '' : 'bg-indigo-50/40'}`}
                >
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.read_at ? 'bg-transparent' : 'bg-indigo-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-800 truncate">{n.title}</span>
                    {n.body && <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</span>}
                    <span className="block text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Browser push toggle — instant alerts even when the portal is closed. */}
          {pushState !== 'unsupported' && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
              {pushState === 'denied' ? (
                <p className="text-[11px] text-gray-400">Desktop notifications are blocked in your browser settings.</p>
              ) : (
                <button
                  onClick={togglePush}
                  disabled={pushState === 'busy'}
                  className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer disabled:opacity-50"
                >
                  <span className={`w-2 h-2 rounded-full ${pushState === 'subscribed' ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {pushState === 'busy'
                    ? 'Working…'
                    : pushState === 'subscribed'
                      ? 'Desktop notifications on — turn off'
                      : 'Enable desktop notifications'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
