'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TECHNICAL_CATEGORIES } from '@/lib/serviceOptions';
import useNav from '@/lib/useNav';

const STATUS = {
  OPEN:     { label: 'Open',     color: '#D97706', bg: '#FFFBEB' },
  RESOLVED: { label: 'Resolved', color: '#059669', bg: '#ECFDF5' },
  DECLINED: { label: 'Declined', color: '#DC2626', bg: '#FEF2F2' },
};

// The journey of one department's issue, derived from its current fields.
function flowSteps(t) {
  const steps = [{ label: 'Raised', note: t.issue_note }];
  if (t.lead_name) steps.push({ label: `Assigned to ${t.department_name} lead`, who: t.lead_name });
  if (t.resolver_name) steps.push({ label: 'Handed to a resolver', who: t.resolver_name });
  if (t.awaiting_validation && t.status === 'OPEN') {
    steps.push({ label: 'Submitted — awaiting the lead’s validation', who: t.resolver_name, note: t.resolution_note, tone: 'current' });
  }
  if (t.status === 'RESOLVED') steps.push({ label: 'Validated & resolved', who: t.lead_name, note: t.resolution_note, tone: 'done' });
  else if (t.status === 'DECLINED') steps.push({ label: 'Declined — back to the PM', who: t.assigned_to_name, note: t.decline_reason, tone: 'declined' });
  else if (!t.awaiting_validation) steps.push({ label: t.assigned_user_id ? 'In progress' : 'Awaiting dispatch', who: t.assigned_to_name, tone: 'current' });
  return steps;
}

const DOT = { done: '#059669', declined: '#DC2626', current: 'var(--ams-primary)' };

/** The vertical flow timeline for one department task. Reused in the panel and
 * in the ticket's combined split-flow overview. */
export function TaskFlow({ task }) {
  const steps = flowSteps(task);
  return (
    <ol className="space-y-2.5">
      {steps.map((step, i, all) => (
        <li key={i} className="flex gap-2.5">
          <div className="flex flex-col items-center shrink-0">
            <span className="w-2 h-2 rounded-full mt-1" style={{ backgroundColor: DOT[step.tone] || '#D1D5DB' }} />
            {i < all.length - 1 && <span className="w-px flex-1 bg-gray-200 mt-0.5" />}
          </div>
          <div className="min-w-0 pb-0.5">
            <p className="text-xs">
              <span className="font-medium text-gray-700">{step.label}</span>
              {step.who && <span className="text-gray-400"> · {step.who}</span>}
            </p>
            {step.note && <p className="text-xs text-gray-500 whitespace-pre-wrap mt-0.5">{step.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One department's header (name · category · status) + its flow — for the
 * combined overview shown up top. */
export function TaskFlowCard({ task }) {
  const s = STATUS[task.status] || {};
  return (
    <div className="border border-gray-100 rounded-md px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-800">{task.department_name}</span>
        {task.technical_category && <span className="text-[11px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{task.technical_category}</span>}
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>
      </div>
      <TaskFlow task={task} />
    </div>
  );
}

// Compact modal used for every task action that needs input.
function TaskModal({ title, subtitle, fields, confirmLabel, tone, departments, users, initial, onClose, onSubmit }) {
  const [vals, setVals] = useState(initial || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setVals((s) => ({ ...s, [k]: v }));
  const missing = fields.some((f) => f.required && !vals[f.name]);

  const go = async () => {
    setBusy(true); setError('');
    try { await onSubmit(vals); } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.name}>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{f.label}</label>
              {f.type === 'dept' ? (
                <select value={vals[f.name] || ''} onChange={(e) => set(f.name, e.target.value)} className="ams-input" autoFocus>
                  <option value="">— Choose a department —</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              ) : f.type === 'category' ? (
                <select value={vals[f.name] || ''} onChange={(e) => set(f.name, e.target.value)} className="ams-input">
                  <option value="">—</option>
                  {TECHNICAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : f.type === 'user' ? (
                <select value={vals[f.name] || ''} onChange={(e) => set(f.name, e.target.value)} className="ams-input" autoFocus>
                  <option value="">— Choose who attends this —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              ) : (
                <textarea value={vals[f.name] || ''} onChange={(e) => set(f.name, e.target.value)} rows={3}
                  placeholder={f.placeholder} className="ams-input resize-none" autoFocus={f === fields[0]} />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button onClick={go} disabled={busy || missing}
            className={`flex-1 justify-center py-2 ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Department tasks panel. At triage the PM adds a task per involved department
 * and dispatches them in parallel; each department's lead then works its own
 * task (hand to a resolver → resolver submits → lead validates), or declines it
 * back to the PM. Once every task is Resolved the ticket moves to the initiator
 * for customer confirmation.
 *
 * @param {object} props
 * @param {object} props.ticket
 * @param {object} props.me
 * @param {(code:string)=>boolean} props.can
 * @param {Array} props.users
 * @param {Array} props.departments
 * @param {() => Promise<void>|void} props.onChanged Called after any change so the parent re-fetches the ticket.
 */
export default function DepartmentTasks({ ticket, me, can, users, departments, onChanged, onTasksLoaded }) {
  const id = ticket.id;
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [openFlow, setOpenFlow] = useState(null); // task id whose flow is expanded

  const canManage = Boolean(me?.is_system || can('SERVICE_VIEW'));
  const atTriage  = ['OPEN', 'REOPENED'].includes(ticket.status);
  const pending   = atTriage && tasks.every((t) => !t.assigned_user_id);

  const nav = useNav();

  // Store tasks locally and report them up so the People section can highlight
  // whoever is currently holding an open task.
  const applyTasks = useCallback((list) => { setTasks(list); onTasksLoaded?.(list); }, [onTasksLoaded]);

  const load = useCallback(async () => {
    try { const r = await apiGet(`/service/tickets/${id}/dept-tasks`); applyTasks(r.data || []); }
    catch { applyTasks([]); }
  }, [id, applyTasks]);
  useEffect(() => { load(); }, [load]);

  // Run a task API call; endpoints return the fresh task list. Refresh ticket too.
  const run = (promise) => promise
    .then(async (r) => { applyTasks(r.data || []); setModal(null); setError(''); await onChanged?.(); })
    .catch((e) => { setError(e.message); throw e; });

  const P = (path, body) => run(apiPost(`/service/tickets/${id}/dept-tasks${path}`, body));

  const nothingYet = tasks.length === 0;
  if (nothingYet && !canManage) return null; // nothing to show a non-PM before dispatch

  const amHolder = (t) => t.assigned_user_id && me && t.assigned_user_id === me.id;
  const amLead   = (t) => t.lead_user_id && me && t.lead_user_id === me.id;
  // An issue can only be resolved once it has BOTH a finalised plan and a report
  // (mirrors the backend guard against fake-closing). The plan is a hard
  // prerequisite (authored on the plan page); the report can be typed in the
  // resolve modal, so only the plan gates the button.
  const hasFinalPlan = (t) => (t.plans?.length ?? 0) > 0;
  const hasReport    = (t) => Boolean(t.resolution_note || t.resolution_note_json);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-gray-800">
          Departments {tasks.length > 0 && <span className="text-gray-400 font-normal">· {tasks.filter((t) => t.status === 'RESOLVED').length}/{tasks.length} resolved</span>}
        </h2>
        <div className="flex items-center gap-2">
          {canManage && (
            <button onClick={() => setModal({ type: 'add' })} className="btn-secondary text-sm py-1.5">+ Add department</button>
          )}
          {canManage && pending && tasks.length > 0 && (
            <button onClick={() => run(apiPost(`/service/tickets/${id}/dept-tasks/dispatch`))} className="btn-primary text-sm py-1.5">
              Dispatch to {tasks.length} department{tasks.length > 1 ? 's' : ''} →
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

        {nothingYet && (
          <p className="text-sm text-gray-400">No departments added yet. Add a department and the issue for it, then dispatch.</p>
        )}

        {tasks.map((t) => {
          const s = STATUS[t.status] || {};
          return (
            <div key={t.id} className="border border-gray-200 rounded-md px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-800">{t.department_name}</span>
                {t.technical_category && <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{t.technical_category}</span>}
                <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>
                {t.assigned_to_name && t.status === 'OPEN' && (
                  <span className="text-xs text-gray-400">· with {t.assigned_to_name}{t.awaiting_validation ? ' (awaiting validation)' : ''}</span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => setOpenFlow((v) => (v === t.id ? null : t.id))} className="text-xs text-gray-400 hover:text-gray-600">
                    {openFlow === t.id ? '− Flow' : '+ Flow'}
                  </button>
                  {canManage && pending && (
                    <button onClick={() => setModal({ type: 'edit', task: t })} className="text-xs text-gray-400 hover:text-gray-600">edit</button>
                  )}
                  {canManage && (t.status === 'DECLINED' || pending) && (
                    <button onClick={() => apiDelete(`/service/tickets/${id}/dept-tasks/${t.id}`).then(async (r) => { applyTasks(r.data || []); await onChanged?.(); }).catch((e) => setError(e.message))} className="text-xs text-red-400 hover:text-red-600">remove</button>
                  )}
                </div>
              </div>

              <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-wrap"><span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1.5">Issue</span>{t.issue_note}</p>
              {t.resolution_note && (
                <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap"><span className="text-[11px] font-semibold text-green-500 uppercase tracking-wider mr-1.5">Done</span>{t.resolution_note}</p>
              )}
              {t.decline_reason && (
                <p className="text-sm text-amber-700 mt-1.5 whitespace-pre-wrap"><span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider mr-1.5">Declined</span>{t.decline_reason}</p>
              )}

              {/* Per-task actions */}
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                {t.status === 'OPEN' && amHolder(t) && (amLead(t) ? (
                  t.awaiting_validation ? (
                    <>
                      <button onClick={() => setModal({ type: 'resolve', task: t })} disabled={!hasFinalPlan(t)} title={hasFinalPlan(t) ? undefined : 'Finalise the resolution plan first'} className="btn-primary text-xs py-1.5 disabled:opacity-40 disabled:cursor-not-allowed">Validate &amp; finalise</button>
                      <button onClick={() => run(apiPost(`/service/tickets/${id}/dept-tasks/${t.id}/return`))} className="btn-secondary text-xs py-1.5">Return to resolver</button>
                      <button onClick={() => setModal({ type: 'decline', task: t })} className="btn-danger text-xs py-1.5">Decline</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setModal({ type: 'assign', task: t })} className="btn-secondary text-xs py-1.5">Assign to person</button>
                      <button onClick={() => setModal({ type: 'resolve', task: t })} disabled={!hasFinalPlan(t)} title={hasFinalPlan(t) ? undefined : 'Finalise the resolution plan first'} className="btn-primary text-xs py-1.5 disabled:opacity-40 disabled:cursor-not-allowed">Resolve</button>
                      <button onClick={() => setModal({ type: 'decline', task: t })} className="btn-danger text-xs py-1.5">Decline</button>
                    </>
                  )
                ) : (
                  <>
                    <button onClick={() => setModal({ type: 'submit', task: t })} className="btn-primary text-xs py-1.5">Submit for validation</button>
                    <button onClick={() => setModal({ type: 'decline', task: t })} className="btn-danger text-xs py-1.5">Decline</button>
                  </>
                ))}
                {t.status === 'DECLINED' && canManage && (
                  <button onClick={() => setModal({ type: 'redirect', task: t })} className="btn-primary text-xs py-1.5">Reassign to a department</button>
                )}
              </div>

              {/* Why the resolve button is disabled — the plan isn't finalised. */}
              {t.status === 'OPEN' && amLead(t) && amHolder(t) && !hasFinalPlan(t) && (
                <p className="text-[11px] text-amber-600 mt-1.5">Finalise this issue’s resolution plan (below) before you can resolve it.</p>
              )}

              {/* Per-issue documents — the plan (what's intended) and the report
                  (what was done). Available once the issue has a lead. A ✓ marks
                  the two things required before the issue can be resolved. */}
              {t.lead_user_id && (
                <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-gray-100 text-xs">
                  <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Docs</span>
                  <button onClick={() => nav(`/dashboard/service/tickets/${id}/plan?task=${t.id}`)} className="text-gray-500 hover:text-gray-700 font-medium">
                    Plan {hasFinalPlan(t) ? <span className="text-green-600">✓</span> : <span className="text-gray-300">→</span>}
                  </button>
                  <button onClick={() => nav(`/dashboard/service/tickets/${id}/report?task=${t.id}`)} className="text-gray-500 hover:text-gray-700 font-medium">
                    Report {hasReport(t) ? <span className="text-green-600">✓</span> : <span className="text-gray-300">→</span>}
                  </button>
                </div>
              )}

              {/* Expandable per-issue flow */}
              {openFlow === t.id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Flow</p>
                  <TaskFlow task={t} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal?.type === 'add' && (
        <TaskModal title="Add a department" subtitle="Which department must check/solve part of this, its category, and what?"
          departments={departments} confirmLabel="Add"
          fields={[
            { name: 'technical_category', label: 'Technical Category', type: 'category' },
            { name: 'department_id', label: 'Department', type: 'dept', required: true },
            { name: 'issue_note', label: 'Issue for this department', type: 'text', required: true, placeholder: 'What they must check / solve…' },
          ]}
          onClose={() => setModal(null)} onSubmit={(v) => P('', { department_id: v.department_id, issue_note: v.issue_note, technical_category: v.technical_category || undefined })} />
      )}
      {modal?.type === 'edit' && (
        <TaskModal title={`Edit — ${modal.task.department_name}`} confirmLabel="Save"
          initial={{ technical_category: modal.task.technical_category || '', issue_note: modal.task.issue_note || '' }}
          fields={[
            { name: 'technical_category', label: 'Technical Category', type: 'category' },
            { name: 'issue_note', label: 'Issue for this department', type: 'text', required: true },
          ]}
          onClose={() => setModal(null)} onSubmit={(v) => run(apiPut(`/service/tickets/${id}/dept-tasks/${modal.task.id}`, { issue_note: v.issue_note, technical_category: v.technical_category || '' }))} />
      )}
      {modal?.type === 'redirect' && (
        <TaskModal title="Reassign to a department" subtitle="Send this declined item to another department (or the same, re-worded)."
          departments={departments} confirmLabel="Reassign"
          initial={{ technical_category: modal.task.technical_category || '' }}
          fields={[
            { name: 'department_id', label: 'Department', type: 'dept', required: true },
            { name: 'technical_category', label: 'Technical Category', type: 'category' },
            { name: 'issue_note', label: 'Issue (optional — keep or change)', type: 'text' },
          ]}
          onClose={() => setModal(null)} onSubmit={(v) => P(`/${modal.task.id}/redirect`, { department_id: v.department_id, issue_note: v.issue_note || undefined, technical_category: v.technical_category || undefined })} />
      )}
      {modal?.type === 'assign' && (
        <TaskModal title="Assign to a person" subtitle="Hand this to someone in your department to work on."
          users={users} confirmLabel="Assign"
          fields={[{ name: 'assignee_user_id', label: 'Assign to', type: 'user', required: true }]}
          onClose={() => setModal(null)} onSubmit={(v) => P(`/${modal.task.id}/assign`, { assignee_user_id: v.assignee_user_id })} />
      )}
      {modal?.type === 'submit' && (
        <TaskModal title="Submit for validation" subtitle="Describe what you did; your lead validates and finalises it."
          confirmLabel="Submit"
          fields={[{ name: 'resolution_note', label: 'What was done', type: 'text', required: true, placeholder: 'Work performed, parts, tests, outcome…' }]}
          onClose={() => setModal(null)} onSubmit={(v) => P(`/${modal.task.id}/submit`, { resolution_note: v.resolution_note })} />
      )}
      {modal?.type === 'resolve' && (
        <TaskModal title="Resolve this department's part"
          subtitle={hasReport(modal.task)
            ? 'Confirm what was done — this marks the department’s task resolved.'
            : 'Record what was done — a report is required before this issue can be resolved.'}
          confirmLabel="Resolve"
          fields={[{ name: 'resolution_note', label: 'What was done', type: 'text', required: !hasReport(modal.task), placeholder: 'Work performed, outcome…' }]}
          onClose={() => setModal(null)} onSubmit={(v) => P(`/${modal.task.id}/resolve`, { resolution_note: v.resolution_note || undefined })} />
      )}
      {modal?.type === 'decline' && (
        <TaskModal title="Decline this task" subtitle="It returns to the project manager to reassign." tone="danger"
          confirmLabel="Decline"
          fields={[{ name: 'reason', label: 'Reason', type: 'text', required: true, placeholder: 'Why this can’t be done here…' }]}
          onClose={() => setModal(null)} onSubmit={(v) => P(`/${modal.task.id}/decline`, { reason: v.reason })} />
      )}
    </div>
  );
}
