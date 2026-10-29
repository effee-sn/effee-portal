'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';

/**
 * Top-bar link to My Approvals, with how many wait for you. Checked on load,
 * every minute, and when the tab comes back into view.
 */
export default function ApprovalsButton() {
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    let alive = true;
    const check = () => apiGet('/approvals/count', { silent: true })
      .then((r) => { if (alive) setWaiting(r.data?.waiting || 0); })
      .catch(() => {});
    check();
    const t = setInterval(check, 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  return (
    <Link href="/dashboard/approvals"
      className="relative w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 transition"
      aria-label={waiting ? `My Approvals — ${waiting} waiting` : 'My Approvals'} title={waiting ? `${waiting} waiting for your approval` : 'My Approvals'}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      {waiting > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
          {waiting > 9 ? '9+' : waiting}
        </span>
      )}
    </Link>
  );
}
