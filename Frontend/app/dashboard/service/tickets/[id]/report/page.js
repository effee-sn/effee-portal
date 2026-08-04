'use client';

import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPut } from '@/lib/api';

// BlockNote is browser-only.
const BlockEditor = dynamic(() => import('@/components/BlockEditor'), {
  ssr: false,
  loading: () => <div className="text-sm text-gray-400 py-10 text-center">Loading editor…</div>,
});

/**
 * Work Report page — the account of what was actually done for ONE department's
 * issue, authored in the block editor. Scoped to a department task (`?task=`).
 * The task's current holder edits; everyone who can view the ticket can read.
 */
function WorkReportInner() {
  useAuth();
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get('task');
  const { me, can, loading: permLoading } = usePermissions();

  const [ticket, setTicket]   = useState(null);
  const [task, setTask]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [msg, setMsg]         = useState('');
  const editorRef = useRef(null);

  // The report is written by whoever currently holds the task — the resolver
  // while they work it, the lead when it is back with them. Backend enforces it.
  // A closed (resolved/declined) issue's report is frozen — read-only for everyone.
  const canAct = Boolean(task && me && task.status === 'OPEN' && (
    me.is_system || can('SERVICE_EDIT') || (task.assigned_user_id && task.assigned_user_id === me.id)
  ));

  const load = useCallback(async () => {
    const [tRes, taskRes] = await Promise.all([
      apiGet(`/service/tickets/${id}`),
      apiGet(`/service/tickets/${id}/dept-tasks`).catch(() => ({ data: [] })),
    ]);
    setTicket(tRes.data);
    setTask((taskRes.data || []).find((t) => String(t.id) === String(taskId)) || null);
  }, [id, taskId]);

  useEffect(() => {
    if (permLoading) return;
    load().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [permLoading, load]);

  const save = async () => {
    const doc = editorRef.current?.document ?? [];
    let text = '';
    try { text = await editorRef.current?.blocksToMarkdownLossy(doc); } catch { /* best effort */ }
    setBusy(true); setError(''); setMsg('');
    try {
      await apiPut(`/service/tickets/${id}/dept-tasks/${taskId}/report`, { resolution_note_json: doc, resolution_note: text });
      await load();
      setMsg('Saved');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (permLoading || loading) {
    return (
      <div className="max-w-8xl p-4 sm:p-6 space-y-4 animate-pulse">
        <div className="h-7 w-56 bg-gray-200 rounded" />
        <div className="h-96 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  if (!ticket || !taskId || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">{taskId ? 'Ticket unavailable' : 'No department selected'}</p>
        {!taskId && <p className="text-sm text-gray-500">Open a report from a department on the ticket.</p>}
        <button onClick={() => router.push(`/dashboard/service/tickets/${id}`)} className="btn-secondary text-sm mt-4">Back to ticket</button>
      </div>
    );
  }

  return (
    <div className="max-w-8xl p-4 sm:p-6 pb-10 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push(`/dashboard/service/tickets/${id}`)} className="text-gray-400 hover:text-gray-600 text-sm">← Back to ticket</button>
        <h1 className="text-lg font-semibold text-gray-800">Work Report</h1>
        <span className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border bg-gray-50 border-gray-200 text-gray-600">
          <span className="font-medium">{task.department_name}</span>
          {task.technical_category && <span className="opacity-60">· {task.technical_category}</span>}
        </span>
        <span className="text-sm text-gray-400">{ticket.ticket_id}</span>
      </div>

      {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800">What was done to resolve this issue</h2>
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-green-600">{msg}</span>}
            {canAct
              ? <button onClick={save} disabled={busy} className="btn-primary text-sm py-1.5">{busy ? 'Saving…' : 'Save'}</button>
              : <span className="text-xs text-gray-400">Read-only</span>}
          </div>
        </div>
        <div className="px-2 py-3">
          <BlockEditor
            key={canAct ? 'report-edit' : `report-read-${task.updated_at}`}
            initialContent={task.resolution_note_json}
            editable={canAct}
            onReady={(ed) => { editorRef.current = ed; }}
          />
        </div>
        {canAct && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">Record the work you performed — parts replaced, tests run, the outcome. <span className="font-medium">Save</span> when done.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkReportPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl p-4 sm:p-6 text-sm text-gray-400">Loading…</div>}>
      <WorkReportInner />
    </Suspense>
  );
}
