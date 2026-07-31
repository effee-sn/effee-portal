const { deptTaskRepository } = require('./deptTask.repository');
const { serviceRepository } = require('./service.repository');
const { ticketAssignment } = require('./ticketAssignment');
const { canView, hasPermission } = require('./ticketPolicy');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ForbiddenError, BadRequestError, ValidationError } = require('../../core');

/**
 * Multi-department task business logic.
 *
 * A ticket can involve several departments. The PM (a SERVICE_VIEW / oversight
 * holder) adds a task per department at triage, then DISPATCHES them: each task
 * goes to that department's lead, in parallel. A lead may hand their task to a
 * resolver, who submits their work back for the lead to validate — only the
 * lead finalises (RESOLVED) or declines it back to the PM. When every task is
 * resolved, the ticket lands at customer confirmation with the initiator.
 *
 * @param {ReturnType<typeof import('./deptTask.repository').createDeptTaskRepository>} repository
 * @param {typeof serviceRepository} tickets
 */
function createDeptTaskService(repository, tickets) {
  /** Loads the ticket and asserts the actor may view it. */
  async function ticketForView(ticketId, user) {
    const ticket = await tickets.findById(ticketId);
    if (!ticket || !canView(user, ticket)) throw new NotFoundError('Ticket');
    return ticket;
  }

  /** Only the PM / oversight (SERVICE_VIEW) manages the task list. */
  function assertManage(user) {
    if (!hasPermission(user, 'SERVICE_VIEW')) {
      throw new ForbiddenError('Only the project manager can manage the departments on a ticket');
    }
  }

  /** Loads a task and asserts it belongs to the ticket. */
  async function taskOfTicket(ticketId, taskId) {
    const task = await repository.findById(taskId);
    if (!task || task.ticket_id !== ticketId) throw new NotFoundError('Department task');
    return task;
  }

  /** The current holder of a task may work it (plus SERVICE_EDIT / admin). */
  function assertHolds(user, task) {
    const holds = task.assigned_user_id && task.assigned_user_id === user?.id;
    if (!holds && !hasPermission(user, 'SERVICE_EDIT')) {
      throw new ForbiddenError('Only the person this task is with can do that');
    }
  }

  /** The lead who owns validation/finalisation of a task. */
  function assertLead(user, task) {
    const isLead = task.lead_user_id && task.lead_user_id === user?.id;
    if (!isLead && !hasPermission(user, 'SERVICE_EDIT')) {
      throw new ForbiddenError('Only the department lead can validate/finalise this task');
    }
  }

  /**
   * Reconciles the ticket with its tasks after any task change (only while the
   * ticket is in the dispatched / department-work phase):
   *   - any task still OPEN or DECLINED → ticket stays IN_PROGRESS;
   *   - every task RESOLVED → ticket moves to the initiator for confirmation.
   * Triage (OPEN/REOPENED) and post-confirmation (ON_OBSERVATION/CLOSED) states
   * are left alone.
   */
  async function syncTicket(ticketId) {
    const ticket = await tickets.findById(ticketId);
    if (!ticket) return;
    if (['OPEN', 'REOPENED', 'ON_OBSERVATION', 'CLOSED'].includes(ticket.status)) return;

    const tasks = await repository.listForTicket(ticketId);
    if (tasks.length === 0) return;

    const open     = tasks.filter((t) => t.status === 'OPEN').length;
    const declined = tasks.filter((t) => t.status === 'DECLINED').length;
    const resolved = tasks.filter((t) => t.status === 'RESOLVED').length;

    if (open > 0 || declined > 0) {
      const label = declined > 0
        ? `${resolved}/${tasks.length} departments done · ${declined} declined`
        : `${resolved}/${tasks.length} departments done`;
      await tickets.update(ticketId, {
        status: 'IN_PROGRESS', assigned_user_id: null, assigned_department_id: null,
        assigned_role_id: null, assigned_to_name: label,
      });
      return;
    }

    // Every department is done → hand to the initiator for customer confirmation.
    const creatorStep = await ticketAssignment.findCreatorStep(ticket);
    await tickets.update(ticketId, {
      status: 'RESOLVED',
      current_step_id: creatorStep?.id ?? null,
      assigned_user_id: ticket.created_by,
      assigned_department_id: null, assigned_role_id: null,
      assigned_to_name: ticket.created_by_name ? `${ticket.created_by_name} (initiator)` : null,
    });
    if (ticket.created_by) await tickets.addParticipant(ticketId, ticket.created_by, ticket.created_by_name, 'Customer confirmation');
  }

  const rec = (action, taskId, user, changes) =>
    auditService.record({ action, entity: 'TicketDepartmentTask', entityId: taskId, actor: user, changes });

  return {
    /** List a ticket's department tasks (view access). */
    async list(ticketId, user) {
      await ticketForView(ticketId, user);
      return repository.listForTicket(ticketId);
    },

    /**
     * Adds a department task. Before dispatch (ticket at triage) it is pending;
     * once the ticket is dispatched, a newly added task is assigned to that
     * department's lead straight away (and re-opens a ticket that had reached
     * confirmation).
     */
    async addTask(ticketId, { department_id, issue_note, technical_category }, user) {
      const ticket = await ticketForView(ticketId, user);
      assertManage(user);

      const dept = await tickets.findDepartmentWithHead(department_id);
      if (!dept) throw new ValidationError('Validation failed', [{ field: 'department_id', message: 'Department does not exist' }]);

      const dispatched = !['OPEN', 'REOPENED'].includes(ticket.status);
      const data = {
        ticket_id: ticketId, department_id: dept.id, department_name: dept.name,
        technical_category: technical_category ?? null,
        issue_note, status: 'OPEN', created_by: user?.id ?? null,
      };
      if (dispatched) {
        if (!dept.head_user_id) throw new BadRequestError(`${dept.name} has no head set — set one before dispatching to it`);
        Object.assign(data, {
          lead_user_id: dept.head_user_id, lead_name: dept.head?.name ?? null,
          assigned_user_id: dept.head_user_id, assigned_to_name: `${dept.head?.name ?? 'Head'} (${dept.name} lead)`,
        });
      }
      const task = await repository.create(data);
      if (dispatched) {
        await tickets.addParticipant(ticketId, dept.head_user_id, dept.head?.name ?? null, `${dept.name} task`);
        await syncTicket(ticketId);
      }
      await rec('DEPT_TASK_ADDED', task.id, user, { ticket_id: ticketId, department: dept.name });
      return repository.listForTicket(ticketId);
    },

    /** Edit a task's classification / issue note (manage). */
    async updateTask(ticketId, taskId, { issue_note, technical_category }, user) {
      await ticketForView(ticketId, user);
      assertManage(user);
      const task = await taskOfTicket(ticketId, taskId);
      await repository.update(taskId, {
        issue_note: issue_note ?? task.issue_note,
        ...(technical_category !== undefined ? { technical_category } : {}),
      });
      return repository.listForTicket(ticketId);
    },

    /** Remove a task (manage). Removing the last blocker can complete the ticket. */
    async removeTask(ticketId, taskId, user) {
      await ticketForView(ticketId, user);
      assertManage(user);
      await taskOfTicket(ticketId, taskId);
      await repository.softDelete(taskId);
      await syncTicket(ticketId);
      await rec('DEPT_TASK_REMOVED', taskId, user, { ticket_id: ticketId });
      return repository.listForTicket(ticketId);
    },

    /**
     * Dispatches all pending tasks to their department leads, in parallel, and
     * moves the ticket into the department-work phase.
     */
    async dispatch(ticketId, user) {
      const ticket = await ticketForView(ticketId, user);
      assertManage(user);
      if (!['OPEN', 'REOPENED'].includes(ticket.status)) throw new BadRequestError('This ticket has already been dispatched');

      const tasks = await repository.listForTicket(ticketId);
      const pending = tasks.filter((t) => t.status === 'OPEN' && !t.assigned_user_id);
      if (pending.length === 0) throw new BadRequestError('Add at least one department before dispatching');

      for (const t of pending) {
        const dept = await tickets.findDepartmentWithHead(t.department_id);
        if (!dept?.head_user_id) throw new BadRequestError(`${t.department_name} has no head set — set one before dispatching`);
        await repository.update(t.id, {
          lead_user_id: dept.head_user_id, lead_name: dept.head?.name ?? null,
          assigned_user_id: dept.head_user_id, assigned_to_name: `${dept.head?.name ?? 'Head'} (${dept.name} lead)`,
        });
        await tickets.addParticipant(ticketId, dept.head_user_id, dept.head?.name ?? null, `${dept.name} task`);
      }
      await tickets.update(ticketId, { status: 'IN_PROGRESS', current_step_id: null });
      await syncTicket(ticketId);
      await rec('DEPT_DISPATCHED', ticketId, user, { ticket_id: ticketId, departments: pending.length });
      return repository.listForTicket(ticketId);
    },

    /** Lead hands the task to a resolver in their department. */
    async assignResolver(ticketId, taskId, assigneeUserId, user) {
      await ticketForView(ticketId, user);
      const task = await taskOfTicket(ticketId, taskId);
      assertHolds(user, task);
      if (task.status !== 'OPEN') throw new BadRequestError('This task is not open');

      const target = await tickets.findUserById(assigneeUserId);
      if (!target) throw new ValidationError('Validation failed', [{ field: 'assignee_user_id', message: 'User does not exist' }]);

      // A lead assigns only within their own department. Admins (SERVICE_EDIT /
      // system) may cross departments if they ever need to.
      if (task.department_id && target.department_id !== task.department_id && !hasPermission(user, 'SERVICE_EDIT')) {
        throw new ValidationError('Validation failed', [{
          field: 'assignee_user_id',
          message: `${target.name} is not in ${task.department_name || 'this department'}`,
        }]);
      }

      await repository.update(taskId, {
        resolver_user_id: target.id, resolver_name: target.name,
        assigned_user_id: target.id, assigned_to_name: target.name, awaiting_validation: false,
      });
      await tickets.addParticipant(ticketId, target.id, target.name, `${task.department_name} resolver`);
      await rec('DEPT_TASK_ASSIGNED', taskId, user, { ticket_id: ticketId, to: target.name });
      return repository.listForTicket(ticketId);
    },

    /** Resolver submits their work back to the lead for validation. */
    async submit(ticketId, taskId, resolutionNote, user) {
      await ticketForView(ticketId, user);
      const task = await taskOfTicket(ticketId, taskId);
      assertHolds(user, task);
      if (!task.lead_user_id || task.assigned_user_id === task.lead_user_id) {
        throw new BadRequestError('Only a resolver submits for validation — the lead finalises directly');
      }
      await repository.update(taskId, {
        awaiting_validation: true, resolution_note: resolutionNote,
        assigned_user_id: task.lead_user_id, assigned_to_name: task.lead_name,
      });
      await rec('DEPT_TASK_SUBMITTED', taskId, user, { ticket_id: ticketId });
      return repository.listForTicket(ticketId);
    },

    /** Lead sends a submitted task back to the resolver for more work. */
    async returnToResolver(ticketId, taskId, user) {
      await ticketForView(ticketId, user);
      const task = await taskOfTicket(ticketId, taskId);
      assertLead(user, task);
      if (!task.resolver_user_id) throw new BadRequestError('No resolver to return this to');
      await repository.update(taskId, {
        assigned_user_id: task.resolver_user_id, assigned_to_name: task.resolver_name, awaiting_validation: false,
      });
      await rec('DEPT_TASK_RETURNED', taskId, user, { ticket_id: ticketId });
      return repository.listForTicket(ticketId);
    },

    /** Lead finalises the task (validates the resolver's work, or resolves it directly). */
    async resolve(ticketId, taskId, resolutionNote, user) {
      await ticketForView(ticketId, user);
      const task = await taskOfTicket(ticketId, taskId);
      assertLead(user, task);
      if (task.status === 'RESOLVED') throw new BadRequestError('This task is already resolved');

      // Guard against fake-closing: an issue is only RESOLVED once it has both a
      // finalised resolution plan (the intent) and a work report (what was done).
      const hasFinalPlan = Array.isArray(task.plans) && task.plans.length > 0;
      if (!hasFinalPlan) {
        throw new BadRequestError('Finalise this issue’s resolution plan before resolving it');
      }
      const report = resolutionNote ?? task.resolution_note;
      const hasReport = Boolean((report && String(report).trim()) || task.resolution_note_json);
      if (!hasReport) {
        throw new BadRequestError('Record a work report (what was done) before resolving this issue');
      }

      await repository.update(taskId, {
        status: 'RESOLVED', resolved_at: new Date(),
        resolution_note: resolutionNote ?? task.resolution_note, awaiting_validation: false,
        assigned_user_id: user?.id ?? null, assigned_to_name: task.lead_name,
      });
      await syncTicket(ticketId);
      await rec('DEPT_TASK_RESOLVED', taskId, user, { ticket_id: ticketId, department: task.department_name });
      return repository.listForTicket(ticketId);
    },

    /**
     * Saves the rich work report for this issue (`resolution_note_json` + its
     * plain-text mirror). Authored by the current holder — the resolver while
     * they work it, the lead when it is back with them.
     */
    async saveReport(ticketId, taskId, { resolution_note, resolution_note_json }, user) {
      await ticketForView(ticketId, user);
      const task = await taskOfTicket(ticketId, taskId);
      // A resolved/declined issue's report is frozen — it records what was done.
      if (task.status !== 'OPEN') {
        throw new BadRequestError('This issue is closed — its report can no longer be changed');
      }
      assertHolds(user, task);
      await repository.update(taskId, {
        ...(resolution_note !== undefined ? { resolution_note } : {}),
        ...(resolution_note_json !== undefined ? { resolution_note_json } : {}),
      });
      await rec('DEPT_TASK_REPORTED', taskId, user, { ticket_id: ticketId });
      return repository.listForTicket(ticketId);
    },

    /** Current holder declines the task back to the PM. */
    async declineTask(ticketId, taskId, reason, user) {
      await ticketForView(ticketId, user);
      const task = await taskOfTicket(ticketId, taskId);
      assertHolds(user, task);
      await repository.update(taskId, { status: 'DECLINED', decline_reason: reason, awaiting_validation: false });
      await syncTicket(ticketId);
      await rec('DEPT_TASK_DECLINED', taskId, user, { ticket_id: ticketId, reason });
      return repository.listForTicket(ticketId);
    },

    /** PM re-opens a declined task, optionally re-routing it to a different department. */
    async redirectTask(ticketId, taskId, { department_id, issue_note, technical_category }, user) {
      const ticket = await ticketForView(ticketId, user);
      assertManage(user);
      const task = await taskOfTicket(ticketId, taskId);
      if (task.status !== 'DECLINED') throw new BadRequestError('Only a declined task can be redirected');

      const deptId = department_id ?? task.department_id;
      const dept = await tickets.findDepartmentWithHead(deptId);
      if (!dept) throw new ValidationError('Validation failed', [{ field: 'department_id', message: 'Department does not exist' }]);
      if (!dept.head_user_id) throw new BadRequestError(`${dept.name} has no head set`);

      await repository.update(taskId, {
        department_id: dept.id, department_name: dept.name,
        technical_category: technical_category ?? task.technical_category,
        issue_note: issue_note ?? task.issue_note,
        status: 'OPEN', decline_reason: null, resolution_note: null,
        resolver_user_id: null, resolver_name: null, awaiting_validation: false,
        lead_user_id: dept.head_user_id, lead_name: dept.head?.name ?? null,
        assigned_user_id: dept.head_user_id, assigned_to_name: `${dept.head?.name ?? 'Head'} (${dept.name} lead)`,
      });
      await tickets.addParticipant(ticketId, dept.head_user_id, dept.head?.name ?? null, `${dept.name} task`);
      await syncTicket(ticketId);
      await rec('DEPT_TASK_REDIRECTED', taskId, user, { ticket_id: ticketId, department: dept.name });
      return repository.listForTicket(ticketId);
    },
  };
}

const deptTaskService = createDeptTaskService(deptTaskRepository, serviceRepository);

module.exports = { deptTaskService, createDeptTaskService };
