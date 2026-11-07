'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useIssues, useIssueRecord } from '@/lib/issues';

/**
 * On a record's page (an enquiry, a ticket…): ties new issues raised there to
 * the record, and shows how many open issues it has (the ones you can see) —
 * a click opens them in the issue panel.
 * @param {{ module: string, entityType: string, entityId: number|string, label: string }} props
 */
export default function IssueRecordButton({ module, entityType, entityId, label }) {
  const { open, version } = useIssues();
  const [openCount, setOpenCount] = useState(null);
  useIssueRecord(entityId ? { module, entity_type: entityType, entity_id: entityId, entity_label: label } : null);

  useEffect(() => {
    if (!entityId) return undefined;
    let live = true;
    const q = new URLSearchParams({ tab: 'record', entity_type: entityType, entity_id: String(entityId), status: 'open', limit: '1' });
    apiGet(`/issues?${q}`, { silent: true })
      .then((r) => { if (live) setOpenCount(r.meta?.pagination?.total ?? 0); })
      .catch(() => {});
    return () => { live = false; };
  }, [entityType, entityId, version]);

  return (
    <button type="button" onClick={() => open({ mode: 'record' })}
      title="Issues raised on this record — or raise one"
      className="btn-secondary px-3 py-1.5 text-sm cursor-pointer inline-flex items-center gap-1.5">
      Issues
      {openCount > 0 && (
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold inline-flex items-center justify-center">{openCount}</span>
      )}
    </button>
  );
}
