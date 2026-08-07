'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost } from '@/lib/api';
import DepartmentTasks from '@/components/DepartmentTasks';
import TicketComments from '@/components/TicketComments';
import {
  SERVICE_LOCATIONS, TICKET_TYPES,
  SEVERITY_STYLE, STATUS_STYLE,
} from '@/lib/serviceOptions';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

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


export default function TicketDetailPage() {
  useAuth();
  const { id } = useParams();
  const router = useRouter();
  const { me, can, loading: permLoading } = usePermissions();

  const [ticket, setTicket]     = useState(null);
  const [departments, setDeps]  = useState([]);
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [reopenOpen, setReopenOpen]     = useState(false);
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

  const applyTicket = (t) => { setTicket(t); };

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

  const doClose = async () => {
    if (!window.confirm('Close this ticket? Observation is complete.')) return;
    setError('');
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
        <button onClick={() => router.back()} className="cursor-pointer text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <h1 className="text-lg font-semibold text-gray-800">{ticket.ticket_id}</h1>
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ color: sev.color, backgroundColor: sev.bg }}>{sev.label}</span>
        <span className="text-xs font-medium" style={{ color: st.color }}>● {st.label}</span>
        {ticket.reopened_count > 0 && (
          <span className="text-xs font-semibold text-red-600" title="Times reopened">↻ {ticket.reopened_count}×</span>
        )}
      </div>

      {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

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
              ) : ticket.next_stage?.assignee_type === 'DEPARTMENT_HEAD' ? (
                // Triage: routing is done by adding/dispatching departments below.
                <span className="text-xs text-gray-400">Add &amp; dispatch departments below</span>
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
          <Field label="Source Type">{TICKET_TYPES.find((o) => o.value === ticket.ticket_type)?.label || ticket.ticket_type}</Field>
          {ticket.ticket_type === 'OTHERS' && <Field label="Others source details">{ticket.source_details}</Field>}
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
          <Field label="Service Location">{SERVICE_LOCATIONS.find((o) => o.value === ticket.service_location)?.label}</Field>
          <Field label="Complaint Date">{fmtDate(ticket.complaint_date)} {ticket.complaint_time}</Field>
          <Field label="Machine / Project">{ticket.machine_project}</Field>
          <Field label="Serial No">{ticket.machine_serial_no}</Field>
          <Field label="Created By">{ticket.created_by_name}</Field>
          <Field label="Created">{fmtDate(ticket.created_at)}</Field>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <Field label="Issue Title">{ticket.issue_title}</Field>
          <Field label="Issue Description"><p className="whitespace-pre-wrap">{ticket.issue_description}</p></Field>
          {ticket.impact_details && <Field label="Impact Details"><p className="whitespace-pre-wrap">{ticket.impact_details}</p></Field>}
        </div>
      </Section>

      {/* Departments — each carries its own category + issue + resolution */}
      <DepartmentTasks
        ticket={ticket} me={me} can={can} users={users} departments={departments}
        onChanged={reloadTicket}
        onTasksLoaded={handleTasksLoaded}
      />

      {/* Status — flow-driven, read-only. Site findings are now captured per
          department, in each department task's plan / report. */}
      <Section title="Status">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Status">{STATUS_STYLE[ticket.status]?.label || ticket.status}</Field>
          <Field label="Customer Confirmed">
            {ticket.customer_confirmed === true ? 'Yes' : ticket.customer_confirmed === false ? 'No' : 'Pending'}
          </Field>
        </div>
        <p className="text-[11px] text-gray-400 mt-3">Status updates automatically as the ticket moves through the flow.</p>
      </Section>

      {/* Discussion thread — any viewer can comment while the ticket is open. */}
      <TicketComments
        ticketId={id}
        closed={ticket.status === 'CLOSED'}
        me={me}
        canModerate={Boolean(me?.is_system || can('SERVICE_EDIT'))}
      />

      </div>{/* /content */}

      {confirmOpen && (
        <ConfirmModal ticketId={id} onClose={() => setConfirmOpen(false)} onDone={(t) => applyTicket(t)} />
      )}
      {reopenOpen && (
        <ReopenModal ticketId={id} onClose={() => setReopenOpen(false)} onDone={(t) => applyTicket(t)} />
      )}
    </div>
  );
}
