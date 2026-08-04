'use client';

import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';

// BlockNote is browser-only — never render it on the server.
const PlanEditor = dynamic(() => import('@/components/BlockEditor'), {
  ssr: false,
  loading: () => <div className="text-sm text-gray-400 py-10 text-center">Loading editor…</div>,
});

const STATUS_BADGE = {
  DRAFT:      { label: 'Draft',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  FINAL:      { label: 'Final',      cls: 'bg-green-50 text-green-700 border-green-200' },
  SUPERSEDED: { label: 'Superseded', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

function ResolutionPlanInner() {
  useAuth();
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get('task');
  const { me, can, loading: permLoading } = usePermissions();

  const [ticket, setTicket]   = useState(null);
  const [task, setTask]       = useState(null);
  const [plans, setPlans]     = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle]     = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [msg, setMsg]         = useState('');
  const editorRef = useRef(null);

  const plansBase = `/service/tickets/${id}/dept-tasks/${taskId}/plans`;

  // The plan is authored by this issue's department lead. A resolver holds the
  // task but only reads the plan. The backend enforces this; we mirror it so the
  // authoring controls simply don't appear otherwise.
  // A closed (resolved/declined) issue's plan is frozen — read-only for everyone.
  const canPlan = Boolean(task && me && task.status === 'OPEN' && (
    me.is_system || can('SERVICE_EDIT') || (task.lead_user_id && task.lead_user_id === me.id)
  ));

  const load = useCallback(async (preferId) => {
    const [tRes, taskRes, pRes] = await Promise.all([
      apiGet(`/service/tickets/${id}`),
      apiGet(`/service/tickets/${id}/dept-tasks`).catch(() => ({ data: [] })),
      apiGet(plansBase).catch(() => ({ data: [] })),
    ]);
    setTicket(tRes.data);
    setTask((taskRes.data || []).find((t) => String(t.id) === String(taskId)) || null);
    const list = pRes.data || [];
    setPlans(list);
    // Pick the requested plan, else the open draft, else the newest version.
    const pick = (preferId && list.find((p) => p.id === preferId))
      || list.find((p) => p.status === 'DRAFT')
      || list[list.length - 1];
    setSelectedId(pick?.id ?? null);
    setTitle(pick?.title ?? '');
  }, [id, taskId, plansBase]);

  useEffect(() => {
    if (permLoading) return;
    load().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [permLoading, load]);

  const selected = plans.find((p) => p.id === selectedId) || null;
  const editable = Boolean(selected && selected.status === 'DRAFT' && canPlan);
  const hasOpenDraft = plans.some((p) => p.status === 'DRAFT');

  const selectPlan = (p) => { setSelectedId(p.id); setTitle(p.title ?? ''); setMsg(''); setError(''); };

  // Start a fresh draft (or open the existing one).
  const startDraft = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const res = await apiPost(plansBase);
      await load(res.data.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const readDoc = async () => {
    const doc = editorRef.current?.document ?? [];
    let text = '';
    try { text = await editorRef.current?.blocksToMarkdownLossy(doc); } catch { /* text is best-effort */ }
    return { content_json: doc, content_text: text };
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const { content_json, content_text } = await readDoc();
      await apiPut(`${plansBase}/${selected.id}`, { title, content_json, content_text });
      setMsg('Saved');
      setPlans((ps) => ps.map((p) => (p.id === selected.id ? { ...p, title, content_json, content_text } : p)));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // Finalise = mark the plan done (locks it). Saves the latest content first so
  // nothing is lost.
  const finalize = async () => {
    if (!selected) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const { content_json, content_text } = await readDoc();
      await apiPut(`${plansBase}/${selected.id}`, { title, content_json, content_text });
      await apiPost(`${plansBase}/${selected.id}/finalize`);
      await load(selected.id);
      setMsg('Finalised');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const clone = async () => {
    if (!selected) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const res = await apiPost(`${plansBase}/${selected.id}/clone`);
      await load(res.data.id);
      setMsg('New draft created from this version');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // Discard a draft revision — brings back the version it was cloned from.
  const discard = async () => {
    if (!selected) return;
    if (!window.confirm('Discard this draft? The previous version will be restored.')) return;
    setBusy(true); setError(''); setMsg('');
    try {
      await apiDelete(`${plansBase}/${selected.id}`);
      await load();
      setMsg('Draft discarded');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // Roll back to a superseded version — makes it the current final plan.
  const restore = async () => {
    if (!selected) return;
    setBusy(true); setError(''); setMsg('');
    try {
      await apiPost(`${plansBase}/${selected.id}/restore`);
      await load(selected.id);
      setMsg('Version restored');
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

  if (!ticket || !taskId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">{taskId ? 'Ticket unavailable' : 'No department selected'}</p>
        {!taskId && <p className="text-sm text-gray-500">Open a plan from a department on the ticket.</p>}
        <button onClick={() => router.push(`/dashboard/service/tickets/${id}`)} className="btn-secondary text-sm mt-4">Back to ticket</button>
      </div>
    );
  }

  return (
    <div className="max-w-8xl p-4 sm:p-6 pb-10 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push(`/dashboard/service/tickets/${id}`)} className="cursor-pointer text-gray-400 hover:text-gray-600 text-sm">← Back to ticket</button>
        <h1 className="text-lg font-semibold text-gray-800">Resolution Plan</h1>
        {task && (
          <span className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border bg-gray-50 border-gray-200 text-gray-600">
            <span className="font-medium">{task.department_name}</span>
            {task.technical_category && <span className="opacity-60">· {task.technical_category}</span>}
          </span>
        )}
        <span className="text-sm text-gray-400">{ticket.ticket_id}</span>
      </div>

      {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      {plans.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 px-5 py-10 text-center">
          <p className="text-sm text-gray-500 mb-4">No resolution plan yet for this department’s issue.</p>
          {canPlan
            ? <button onClick={startDraft} disabled={busy} className="btn-primary text-sm">{busy ? 'Starting…' : 'Write resolution plan'}</button>
            : <p className="text-xs text-gray-400">The resolution plan is written by the department lead.</p>}
        </div>
      ) : (
        <>
          {/* Version switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            {plans.map((p) => {
              const b = STATUS_BADGE[p.status] || {};
              const active = p.id === selectedId;
              return (
                <button key={p.id} onClick={() => selectPlan(p)}
                  className={`inline-flex items-center gap-2 text-xs rounded-full px-3 py-1.5 border ${active ? 'ring-2 ring-offset-1' : ''} ${b.cls}`}
                  style={active ? { boxShadow: '0 0 0 2px var(--ams-primary)' } : undefined}>
                  <span className="font-semibold">v{p.version}</span>
                  <span>{b.label}</span>
                </button>
              );
            })}
            {canPlan && !hasOpenDraft && (
              <button onClick={startDraft} disabled={busy} className="btn-secondary text-xs py-1.5 ml-1">+ New draft</button>
            )}
          </div>

          {/* Editor card */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 flex-wrap">
              {editable ? (
                <input value={title} onChange={(e) => { setTitle(e.target.value); setMsg(''); }}
                  placeholder="Plan title…" className="ams-input max-w-xs" />
              ) : (
                <h2 className="text-sm font-semibold text-gray-800">{selected?.title || 'Untitled plan'}</h2>
              )}
              <div className="flex items-center gap-2">
                {msg && <span className="text-xs text-green-600">{msg}</span>}
                {editable && <button onClick={discard} disabled={busy} className="btn-danger text-sm py-1.5">Discard</button>}
                {editable && <button onClick={save} disabled={busy} className="btn-secondary text-sm py-1.5">{busy ? 'Saving…' : 'Save'}</button>}
                {editable && <button onClick={finalize} disabled={busy} className="btn-primary text-sm py-1.5">Finalise</button>}
                {!editable && selected?.status === 'FINAL' && canPlan && !hasOpenDraft && (
                  <button onClick={clone} disabled={busy} className="btn-secondary text-sm py-1.5">Revise (new version)</button>
                )}
                {!editable && selected?.status === 'SUPERSEDED' && canPlan && !hasOpenDraft && (
                  <button onClick={restore} disabled={busy} className="btn-secondary text-sm py-1.5">Restore this version</button>
                )}
              </div>
            </div>

            <div className="px-2 py-3">
              {selected && (
                <PlanEditor
                  key={selected.id}
                  initialContent={selected.content_json}
                  editable={editable}
                  onReady={(ed) => { editorRef.current = ed; }}
                />
              )}
            </div>

            {editable && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Save</span> keeps a working draft. <span className="font-medium">Finalise</span> locks
                  it as the final plan for this department’s issue.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function ResolutionPlanPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl p-4 sm:p-6 text-sm text-gray-400">Loading…</div>}>
      <ResolutionPlanInner />
    </Suspense>
  );
}
