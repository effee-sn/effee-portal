'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useIssues } from '@/lib/issues';
import IssuePanel from './IssuePanel';

/**
 * The issue logger, everywhere in the portal: a floating button (bottom right)
 * with a count of what is waiting on you — issues for you, issues in your
 * department's queue, and resolved ones you raised to confirm — and the side
 * panel it opens.
 */
export default function IssueLauncher({ me }) {
  const { view, open, version } = useIssues();
  const [summary, setSummary] = useState(null);

  const refresh = useCallback(() => {
    apiGet('/issues/summary', { silent: true }).then((r) => setSummary(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [me, refresh, version]);

  // Opened from a link (a notification, an email): /dashboard/…?open=<issue id>.
  useEffect(() => {
    if (!me || typeof window === 'undefined') return;
    const id = Number(new URLSearchParams(window.location.search).get('open'));
    if (id) open({ mode: 'issue', id });
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = summary?.total || 0;
  const startTab = summary?.to_confirm && !summary?.assigned ? 'raised' : summary?.queue && !summary?.assigned ? 'queue' : 'assigned';

  return (
    <>
      {!view && me && (
        <button type="button" onClick={() => open({ mode: 'list', tab: startTab })}
          className="fixed bottom-5 right-5 z-30 h-11 pl-3.5 pr-4 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium text-white cursor-pointer hover:brightness-110 print:hidden"
          style={{ backgroundColor: 'var(--ams-primary)' }}
          aria-label={total ? `Issues — ${total} waiting on you` : 'Issues — raise or follow an issue'}
          title="Raise an issue, or follow yours">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 6l2.5-3H19a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14z" />
          </svg>
          <span className="hidden sm:inline">Issues</span>
          {total > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">{total > 99 ? '99+' : total}</span>
          )}
        </button>
      )}
      <IssuePanel me={me} summary={summary} onSummary={refresh} />
    </>
  );
}
