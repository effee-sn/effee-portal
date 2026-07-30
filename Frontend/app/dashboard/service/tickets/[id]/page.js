'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPut, apiPost } from '@/lib/api';
import DepartmentTasks from '@/components/DepartmentTasks';
import {
  SUPPORT_TYPES,
  SEVERITY_STYLE, STATUS_STYLE,
} from '@/lib/serviceOptions';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const toDateInput = (iso) => (iso ? String(iso).slice(0, 10) : '');

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <div className="text-sm text-gray-700">{children ?? <span className="text-gray-300">—</span>}</div>
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {right}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function ModalShell({ title, subtitle, error, children, onClose, onConfirm, confirmLabel, confirmBusy, confirmTone = 'primary', disabled }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        {children}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button onClick={onConfirm} disabled={confirmBusy || disabled}
            className={`flex-1 justify-center py-2 ${confirmTone === 'danger' ? 'btn-danger' : 'btn-primary'}`}>
            {confirmBusy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Advance / Assign ──────────────────────────────────────────────────────────
// Moves the ticket to its next stage. When that stage assigns a specific person
// (MANUAL) the owner is picked here; otherwise it auto-routes (e.g. to the
// originating department's lead) and this is just a confirmation.
function AdvanceModal({ ticketId, users, nextStage, onClose, onDone }) {
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const needsOwner = nextStage?.assignee_type === 'MANUAL';
  const stageName  = nextStage?.name || 'the next stage';

  const go = async () => {
    setSaving(true); setError('');
    try {
      const body = (needsOwner && assignee) ? { assignee_user_id: assignee } : {};
      const res = await apiPost(`/service/tickets/${ticketId}/advance`, body);
      onDone(res.data); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell
      title={needsOwner ? 'Assign owner' : `Move to: ${stageName}`}
      onClose={onClose} onConfirm={go} confirmBusy={saving}
      confirmLabel={needsOwner ? 'Assign' : 'Confirm'} disabled={needsOwner && !assignee}
      subtitle={needsOwner
        ? 'Choose the person who will attend and resolve this issue.'
        : `This moves the ticket to “${stageName}” and assigns it automatically.`}
      error={error}
    >
      {needsOwner && (
        <>
          <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Assign to</label>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="ams-input" autoFocus>
            <option value="">— Choose who attends this —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </>
      )}
    </ModalShell>
  );
}

// ── Decline ───────────────────────────────────────────────────────────────────
function DeclineModal({ ticketId, returnTo, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const go = async () => {
    setSaving(true); setError('');
    try {
      const res = await apiPost(`/service/tickets/${ticketId}/decline`, { reason: reason.trim() });
      onDone(res.data); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell
      title="Decline this ticket" onClose={onClose} onConfirm={go} confirmBusy={saving}
      confirmLabel="Decline" confirmTone="danger" disabled={!reason.trim()}
      subtitle={`It returns to ${returnTo || 'whoever routed it'} to be re-assigned. Give a clear reason.`}
      error={error}
    >
      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Reason</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
        placeholder="Why you cannot take this on…" className="ams-input resize-none" />
    </ModalShell>
  );
}

// ── Reassign the current stage ────────────────────────────────────────────────
// `mode` follows the returned-to stage: 'user' re-assigns a person (a lead
// picking a different resolver after a decline), 'department' re-routes to a
// department's head (the PM after a lead declined).
function ReassignModal({ ticketId, mode, users, departments, onClose, onDone }) {
  const [value, setValue]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const isUser = mode === 'user';

  const go = async () => {
    setSaving(true); setError('');
    try {
      const body = isUser ? { assignee_user_id: value } : { department_id: value };
      const res = await apiPost(`/service/tickets/${ticketId}/reassign`, body);
      onDone(res.data); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell
      title={isUser ? 'Re-assign owner' : 'Reassign to a department'} onClose={onClose} onConfirm={go}
      confirmBusy={saving} confirmLabel="Reassign" disabled={!value}
      subtitle={isUser
        ? 'Assign this to a different person to attend it. The resolution plan is kept.'
        : 'Route this to a department’s head — the same one again after discussion, or a different one. They then accept or decline.'}
      error={error}
    >
      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{isUser ? 'Assign to' : 'Department'}</label>
      <select value={value} onChange={(e) => setValue(e.target.value)} className="ams-input" autoFocus>
        <option value="">{isUser ? '— Choose who attends this —' : '— Choose a department —'}</option>
        {(isUser ? users : departments).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </ModalShell>
  );
}

// ── Customer confirmed → observation ──────────────────────────────────────────
function ConfirmModal({ ticketId, onClose, onDone }) {
  const [days, setDays]     = useState(7);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const go = async () => {
    setSaving(true); setError('');
    try {
      const res = await apiPost(`/service/tickets/${ticketId}/confirm`, { observation_days: days });
      onDone(res.data); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell
      title="Customer confirmed" onClose={onClose} onConfirm={go} confirmBusy={saving} confirmLabel="Confirm & observe"
      subtitle="Record that the customer is satisfied. The ticket enters an observation window — close it once that passes cleanly, or reopen it if the issue recurs."
      error={error}
    >
      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Observation window (days)</label>
      <input type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="ams-input" autoFocus />
    </ModalShell>
  );
}

// ── Reopen ────────────────────────────────────────────────────────────────────
function ReopenModal({ ticketId, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const go = async () => {
    setSaving(true); setError('');
    try {
      const res = await apiPost(`/service/tickets/${ticketId}/reopen`, { reason: reason.trim() });
      onDone(res.data); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell
      title="Reopen ticket" onClose={onClose} onConfirm={go} confirmBusy={saving}
      confirmLabel="Reopen" confirmTone="danger" disabled={!reason.trim()}
      subtitle="The customer rejected the fix, or it recurred. This sends the ticket back to the Project Manager to re-triage, and records why."
      error={error}
    >
      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Reason</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
        placeholder="What the customer reported…" className="ams-input resize-none" />
    </ModalShell>
  );
}

const inputCls = 'ams-input';
const labelCls = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1';

// The forward action's label depends on who the next stage assigns to.
const ADVANCE_LABEL = {
  DEPARTMENT_HEAD: 'Assign to lead',
  MANUAL:          'Assign owner',
  CREATOR:         'Send for confirmation',
  USER:            'Advance →',
  ROLE:            'Advance →',
  DEPARTMENT:      'Advance →',
};

// Display-first section: shows the entered data as a read view, with an Add /
// Edit affordance for whoever can act. Only turns into a form while `active`.
function EditableSection({ title, active, canAct, hasData, onEdit, onCancel, onSave, saving, msg, error, read, children }) {
  const right = !canAct
    ? <span className="text-xs text-gray-400">Read-only</span>
    : active
      ? (
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="btn-secondary text-sm py-1.5">Cancel</button>
          <button onClick={onSave} disabled={saving} className="btn-primary text-sm py-1.5">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      )
      : (
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-green-600">{msg}</span>}
          <button onClick={onEdit} className="btn-secondary text-sm py-1.5">{hasData ? 'Edit' : '+ Add'}</button>
        </div>
      );

  return (
    <Section title={title} right={right}>
      {active && error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-4">{error}</div>}
      {active
        ? children
        : hasData
          ? read
          : (
            <button onClick={canAct ? onEdit : undefined} disabled={!canAct}
              className="w-full text-left text-sm text-gray-400 hover:text-gray-600 disabled:hover:text-gray-400">
              {canAct ? `+ Add ${title.toLowerCase()}` : 'Nothing added yet'}
            </button>
          )}
    </Section>
  );
}

export default function TicketDetailPage() {
  useAuth();
  const { id } = useParams();
  const router = useRouter();
  const { me, can, loading: permLoading } = usePermissions();

  const [ticket, setTicket]     = useState(null);
  const [departments, setDeps]  = useState([]);
  const [users, setUsers]       = useState([]);
  const [work, setWork]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [msg, setMsg]           = useState('');
  const [advanceOpen, setAdvanceOpen]   = useState(false);
  const [declineOpen, setDeclineOpen]   = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [reopenOpen, setReopenOpen]     = useState(false);
  // Which detail section is currently in edit mode (display-first: read by
  // default, one section editable at a time). null = everything read-only.
  const [editSection, setEditSection]   = useState(null);
  // The parallel department tasks, reported up by DepartmentTasks so the People
  // section can render the department → lead → resolver tree and its active holder.
  const [deptTasks, setDeptTasks] = useState([]);
  const [showDeptPeople, setShowDeptPeople] = useState(false);
  // Stable so it doesn't re-trigger the tasks fetch on every render.
  const handleTasksLoaded = useCallback((list) => { setDeptTasks(list); }, []);

  // Record-level access, mirroring the backend policy: a global permission OR
  // being the ticket's current assignee (directly, by department, or by role).
  const isAssignee = (t) => Boolean(t && me && (
    (t.assigned_user_id && t.assigned_user_id === me.id) ||
    (t.assigned_department_id && me.department_id && t.assigned_department_id === me.department_id) ||
    (t.assigned_role_id && me.role?.id && t.assigned_role_id === me.role.id)
  ));
  const canAct = Boolean(ticket && (me?.is_system || can('SERVICE_EDIT') || isAssignee(ticket)));

  const initWork = (t) => ({
    site_visit_notes: t.site_visit_notes || '',
    acknowledged_at: toDateInput(t.acknowledged_at),
    first_response_at: toDateInput(t.first_response_at),
    machine_restore_at: toDateInput(t.machine_restore_at),
  });

  const applyTicket = (t) => { setTicket(t); setWork(initWork(t)); };

  // Re-fetch the ticket — used after department-task changes, which can move the
  // ticket's status/holder (e.g. all resolved → the initiator).
  const reloadTicket = async () => {
    const res = await apiGet(`/service/tickets/${id}`);
    applyTicket(res.data);
  };

  useEffect(() => {
    if (permLoading) return;
    // Always attempt the fetch — the backend decides access (an assignee with no
    // service permission may still view their ticket). A denied/missing ticket
    // comes back as 404.
    Promise.all([
      apiGet(`/service/tickets/${id}`),
      apiGet('/lookup/departments').catch(() => []),
      apiGet('/lookup/users').catch(() => []),
    ]).then(([res, deps, us]) => {
      applyTicket(res.data);
      setDeps(deps);
      setUsers(us);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [permLoading, id]);

  const changeWork = (e) => { setWork((w) => ({ ...w, [e.target.name]: e.target.value })); setMsg(''); setError(''); };

  // Open a section for editing: reset the working copy from the ticket so an
  // earlier cancelled edit never leaks in, then reveal that section's form.
  const openEdit = (section) => { setWork(initWork(ticket)); setError(''); setMsg(''); setEditSection(section); };
  const cancelEdit = () => { setWork(initWork(ticket)); setError(''); setEditSection(null); };

  // Persist just the given fields (one section at a time).
  const persist = async (payload) => {
    setSaving(true); setError(''); setMsg('');
    try {
      const res = await apiPut(`/service/tickets/${id}`, payload);
      applyTicket(res.data);
      setEditSection(null);
      setMsg('Saved');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const saveFindings = () => persist({ site_visit_notes: work.site_visit_notes });
  const saveTimeline = () => persist({
    acknowledged_at: work.acknowledged_at,
    first_response_at: work.first_response_at,
    machine_restore_at: work.machine_restore_at,
  });

  const doClose = async () => {
    if (!window.confirm('Close this ticket? Observation is complete.')) return;
    setError(''); setMsg('');
    try { const res = await apiPost(`/service/tickets/${id}/close`); applyTicket(res.data); }
    catch (e) { setError(e.message); }
  };

  if (permLoading || loading) {
    return (
      <div className="max-w-5xl p-4 sm:p-6 space-y-4 animate-pulse">
        <div className="h-7 w-48 bg-gray-200 rounded" />
        <div className="h-40 bg-gray-100 rounded-lg" />
        <div className="h-56 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Ticket unavailable</p>
        <p className="text-sm text-gray-500">It may not exist, or it isn&apos;t assigned to you.</p>
        <button onClick={() => router.push('/dashboard/service/inbox')} className="btn-secondary text-sm mt-4">Go to My Tickets</button>
      </div>
    );
  }

  const sev = SEVERITY_STYLE[ticket.issue_severity] || {};
  const st  = STATUS_STYLE[ticket.status] || {};

  return (
    <div className="max-w-8xl p-4 sm:p-6 pb-10 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <h1 className="text-lg font-semibold text-gray-800">{ticket.ticket_id}</h1>
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ color: sev.color, backgroundColor: sev.bg }}>{sev.label}</span>
        <span className="text-xs font-medium" style={{ color: st.color }}>● {st.label}</span>
        {ticket.reopened_count > 0 && (
          <span className="text-xs font-semibold text-red-600" title="Times reopened">↻ {ticket.reopened_count}×</span>
        )}
        {ticket.production_impact && <span className="text-xs font-semibold text-red-600">Production</span>}
        {ticket.safety_impact && <span className="text-xs font-semibold text-red-600">Safety</span>}
      </div>

      {/* Assignment / stage / people-chain */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-3 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Currently with</span>
          <span className="text-sm font-medium text-gray-800">{ticket.assigned_to_name || 'Unassigned'}</span>
          {ticket.workflow_id && <span className="text-xs text-gray-400">in workflow</span>}
          {canAct && ticket.workflow_id && (
            <div className="flex items-center gap-2 ml-auto">
              {ticket.status === 'ON_OBSERVATION' ? (
                // Under observation: close it clean, or reopen on recurrence.
                <>
                  <button onClick={() => setReopenOpen(true)} className="btn-danger text-sm py-1.5">Reopen</button>
                  <button onClick={doClose} className="btn-primary text-sm py-1.5">Close ticket</button>
                </>
              ) : ticket.status === 'CLOSED' ? (
                <button onClick={() => setReopenOpen(true)} className="btn-secondary text-sm py-1.5">Reopen</button>
              ) : ticket.stage?.assignee_type === 'CREATOR' ? (
                // Customer-confirmation stage (the creator): confirm or reopen.
                <>
                  <button onClick={() => setReopenOpen(true)} className="btn-danger text-sm py-1.5">Customer not satisfied</button>
                  <button onClick={() => setConfirmOpen(true)} className="btn-primary text-sm py-1.5">Customer confirmed →</button>
                </>
              ) : (ticket.decline_reason && ticket.status !== 'REOPENED') ? (
                // Returned after a decline. Re-do the current stage's assignment:
                // a resolve stage (MANUAL) re-assigns a person; a routing stage
                // re-routes to a department.
                <button onClick={() => setReassignOpen(true)} className="btn-primary text-sm py-1.5">
                  {ticket.stage?.assignee_type === 'MANUAL' ? 'Re-assign owner' : 'Reassign to department'}
                </button>
              ) : ticket.next_stage?.assignee_type === 'DEPARTMENT_HEAD' ? (
                // Routing to departments is done via the Departments panel below.
                <span className="text-xs text-gray-400">Add &amp; dispatch departments below</span>
              ) : ticket.next_stage ? (
                <>
                  <button onClick={() => setAdvanceOpen(true)} className="btn-primary text-sm py-1.5">
                    {ADVANCE_LABEL[ticket.next_stage.assignee_type] || 'Advance →'}
                  </button>
                  {ticket.assigned_by_id && (
                    <button onClick={() => setDeclineOpen(true)} className="btn-danger text-sm py-1.5">Decline</button>
                  )}
                </>
              ) : (
                <span className="text-xs text-gray-400" />
              )}
            </div>
          )}
        </div>

        {/* Observation window reminder */}
        {ticket.status === 'ON_OBSERVATION' && ticket.observation_until && (
          <p className="text-xs" style={{ color: '#0891B2' }}>Under observation until <span className="font-medium">{fmtDate(ticket.observation_until)}</span> — close it after this if the fix holds.</p>
        )}

        {/* Why the ticket came back — a decline, or a customer reopen. */}
        {ticket.decline_reason && (
          <div className="flex gap-2 items-start pt-2 border-t border-gray-100">
            <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider mt-0.5 shrink-0">
              {ticket.status === 'REOPENED' ? 'Reopened' : 'Returned'}
            </span>
            <p className="text-sm text-amber-700 whitespace-pre-wrap">{ticket.decline_reason}</p>
          </div>
        )}

        {ticket.participants?.length > 0 && (() => {
          // Anyone already shown in the department tree (lead or resolver) is
          // pulled out of the flat row so it stays just the initiator / PM.
          const deptPeople = new Set(
            deptTasks.flatMap((t) => [t.lead_user_id, t.resolver_user_id].filter(Boolean))
          );
          const flat = ticket.participants.filter((p) => !deptPeople.has(p.user_id));
          // "Issues forwarded to the dept leads" = tasks that have been dispatched.
          const dispatched = deptTasks.filter((t) => t.lead_user_id);
          const chip = (name, label, isCurrent) => (
            <span className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border"
              style={isCurrent
                ? { backgroundColor: 'var(--ams-primary-light)', borderColor: 'var(--ams-primary)', color: 'var(--ams-primary)' }
                : { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', color: '#6B7280' }}>
              <span className="font-medium">{name}</span>
              {label && <span className="opacity-60">· {label}</span>}
            </span>
          );
          return (
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">People</span>
                {flat.map((p) => (
                  <span key={p.user_id}>
                    {chip(p.user_name || `User #${p.user_id}`, p.stage_label, p.user_id === ticket.assigned_user_id)}
                  </span>
                ))}
                {dispatched.length > 0 && (
                  <button
                    onClick={() => setShowDeptPeople((v) => !v)}
                    aria-label={showDeptPeople ? 'Hide departments' : 'Show departments'}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700 leading-none">
                    {showDeptPeople ? '−' : '+'}
                  </button>
                )}
              </div>

              {/* Department tree: each dispatched issue → its lead, with the
                  assigned resolver nested beneath (hidden when none is assigned). */}
              {showDeptPeople && dispatched.length > 0 && (
                <div className="pl-1 space-y-3">
                  {dispatched.map((t) => (
                    <div key={t.id}>
                      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                        {t.department_name}{t.technical_category ? ` · ${t.technical_category}` : ''}
                      </div>
                      <div className="space-y-1.5">
                        {chip(t.lead_name || 'Lead', 'lead', t.status === 'OPEN' && t.assigned_user_id === t.lead_user_id)}
                        {t.resolver_name && (
                          <div className="flex items-center gap-1.5 pl-4">
                            <span className="text-gray-300 leading-none">↳</span>
                            {chip(t.resolver_name, 'resolver', t.status === 'OPEN' && t.assigned_user_id === t.resolver_user_id)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Ticket content. The resolution plan + work report now live per
          department task (see the Departments panel), not in a ticket sidebar. */}
      <div className="space-y-4">

      {/* Complaint (read-only) */}
      <Section title="Complaint">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Type">{ticket.ticket_type}</Field>
          {ticket.ticket_type === 'DC' && <Field label="DC Number">{ticket.dc_number}</Field>}
          <Field label="Company">{ticket.company_name}</Field>
          <Field label="Location">{ticket.company_location}</Field>
          <Field label="Reported By">{ticket.reported_by}</Field>
          <Field label="Reporter Phone">
            {ticket.reported_by_phone
              ? <a href={`tel:${ticket.reported_by_phone}`} className="hover:underline" style={{ color: 'var(--ams-primary)' }}>{ticket.reported_by_phone}</a>
              : null}
          </Field>
          <Field label="Reporter Email">
            {ticket.reported_by_email
              ? <a href={`mailto:${ticket.reported_by_email}`} className="hover:underline break-all" style={{ color: 'var(--ams-primary)' }}>{ticket.reported_by_email}</a>
              : null}
          </Field>
          <Field label="Support Type">{SUPPORT_TYPES.find((o) => o.value === ticket.support_type)?.label}</Field>
          <Field label="Complaint Date">{fmtDate(ticket.complaint_date)} {ticket.complaint_time}</Field>
          <Field label="Machine / Project">{ticket.machine_project}</Field>
          <Field label="Serial No">{ticket.machine_serial_no}</Field>
          <Field label="Created By">{ticket.created_by_name}</Field>
          <Field label="Created">{fmtDate(ticket.created_at)}</Field>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <Field label="Issue Title">{ticket.issue_title}</Field>
          <Field label="Issue Description"><p className="whitespace-pre-wrap">{ticket.issue_description}</p></Field>
        </div>
      </Section>

      {/* Departments — each carries its own category + issue + resolution */}
      <DepartmentTasks
        ticket={ticket} me={me} can={can} users={users} departments={departments}
        onChanged={reloadTicket}
        onTasksLoaded={handleTasksLoaded}
      />

      {/* Status & Findings — status is flow-driven (read-only); the holder adds
          site-visit findings when it's a site visit. */}
      <EditableSection
        title="Status & Findings"
        active={editSection === 'findings'}
        canAct={canAct && ['SITE_VISIT', 'ON_SITE'].includes(ticket.support_type)}
        hasData
        onEdit={() => openEdit('findings')} onCancel={cancelEdit} onSave={saveFindings}
        saving={saving} msg={msg} error={error}
        read={
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Status">{STATUS_STYLE[ticket.status]?.label || ticket.status}</Field>
              <Field label="Customer Confirmed">
                {ticket.customer_confirmed === true ? 'Yes' : ticket.customer_confirmed === false ? 'No' : 'Pending'}
              </Field>
            </div>
            {ticket.site_visit_notes && (
              <Field label="Site Visit Notes"><p className="whitespace-pre-wrap">{ticket.site_visit_notes}</p></Field>
            )}
            <p className="text-[11px] text-gray-400">Status updates automatically as the ticket moves through the flow.</p>
          </div>
        }
      >
        <div>
          <label className={labelCls}>Site Visit Notes</label>
          <textarea name="site_visit_notes" value={work.site_visit_notes} onChange={changeWork} rows={3}
            placeholder="Findings recorded on site…" className={inputCls + ' resize-none'} />
        </div>
      </EditableSection>

      {/* Timeline — display-first */}
      <EditableSection
        title="Timeline"
        active={editSection === 'timeline'} canAct={canAct}
        hasData={Boolean(ticket.acknowledged_at || ticket.first_response_at || ticket.machine_restore_at)}
        onEdit={() => openEdit('timeline')} onCancel={cancelEdit} onSave={saveTimeline}
        saving={saving} msg={msg} error={error}
        read={
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Acknowledged">{fmtDate(ticket.acknowledged_at)}</Field>
            <Field label="First Response">{fmtDate(ticket.first_response_at)}</Field>
            <Field label="Machine Restore">{fmtDate(ticket.machine_restore_at)}</Field>
          </div>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            ['acknowledged_at', 'Acknowledged'],
            ['first_response_at', 'First Response'],
            ['machine_restore_at', 'Machine Restore'],
          ].map(([name, lbl]) => (
            <div key={name}>
              <label className="block text-[11px] text-gray-400 mb-1">{lbl}</label>
              <input type="date" name={name} value={work[name]} onChange={changeWork} className={inputCls} />
            </div>
          ))}
        </div>
      </EditableSection>

      </div>{/* /content */}

      {advanceOpen && (
        <AdvanceModal ticketId={id} users={users} nextStage={ticket.next_stage}
          onClose={() => setAdvanceOpen(false)} onDone={(t) => applyTicket(t)} />
      )}
      {declineOpen && (
        <DeclineModal ticketId={id} returnTo={ticket.assigned_by_name}
          onClose={() => setDeclineOpen(false)} onDone={(t) => applyTicket(t)} />
      )}
      {reassignOpen && (
        <ReassignModal ticketId={id}
          mode={ticket.stage?.assignee_type === 'MANUAL' ? 'user' : 'department'}
          users={users} departments={departments}
          onClose={() => setReassignOpen(false)} onDone={(t) => applyTicket(t)} />
      )}
      {confirmOpen && (
        <ConfirmModal ticketId={id} onClose={() => setConfirmOpen(false)} onDone={(t) => applyTicket(t)} />
      )}
      {reopenOpen && (
        <ReopenModal ticketId={id} onClose={() => setReopenOpen(false)} onDone={(t) => applyTicket(t)} />
      )}
    </div>
  );
}
