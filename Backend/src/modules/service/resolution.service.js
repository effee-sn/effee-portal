const { resolutionRepository } = require('./resolution.repository');
const { deptTaskRepository } = require('./deptTask.repository');
const { serviceRepository } = require('./service.repository');
const { canView, hasPermission } = require('./ticketPolicy');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../../core');

/**
 * Resolution-plan business logic.
 *
 * A plan is a versioned document authored per department task — one lineage per
 * issue. Access mirrors the ticket's record-level policy: anyone who can view
 * the ticket can read its tasks' plans; only the task's LEAD (or an
 * SERVICE_EDIT / admin) writes, finalises, clones, restores or discards one.
 * There is no separate ticket-stage gate — the plan follows its task's lead.
 *
 * @param {ReturnType<typeof import('./resolution.repository').createResolutionRepository>} repository
 * @param {typeof deptTaskRepository} tasks
 * @param {typeof serviceRepository} tickets
 */
function createResolutionService(repository, tasks, tickets) {
  /** Loads the ticket and asserts the actor may view it (else 404, no leak). */
  async function ticketForView(ticketId, user) {
    const ticket = await tickets.findById(ticketId);
    if (!ticket || !canView(user, ticket)) throw new NotFoundError('Ticket');
    return ticket;
  }

  /** Loads a department task and asserts it belongs to the ticket. */
  async function taskOfTicket(ticketId, taskId) {
    const task = await tasks.findById(taskId);
    if (!task || task.ticket_id !== ticketId) throw new NotFoundError('Department task');
    return task;
  }

  /**
   * Loads the task for reading its plans: the actor need only view the ticket.
   * @returns {Promise<object>} the task
   */
  async function taskForRead(ticketId, taskId, user) {
    await ticketForView(ticketId, user);
    return taskOfTicket(ticketId, taskId);
  }

  /**
   * Loads the task for authoring its plan: the actor must be the task's LEAD
   * (the owner of its resolution) or hold SERVICE_EDIT / be a system actor.
   * @returns {Promise<object>} the task
   */
  async function taskForAuthor(ticketId, taskId, user) {
    await ticketForView(ticketId, user);
    const task = await taskOfTicket(ticketId, taskId);
    // Once the issue leaves OPEN (resolved or declined) its plan is frozen — no
    // more saving, finalising, revising or restoring.
    if (task.status !== 'OPEN') {
      throw new BadRequestError('This issue is closed — its resolution plan can no longer be changed');
    }
    const isLead = task.lead_user_id && task.lead_user_id === user?.id;
    if (!isLead && !hasPermission(user, 'SERVICE_EDIT')) {
      throw new ForbiddenError('Only the department lead authors this issue’s resolution plan');
    }
    return task;
  }

  /** Loads a plan and asserts it belongs to the task. */
  async function planOfTask(taskId, planId) {
    const plan = await repository.findById(planId);
    if (!plan || plan.dept_task_id !== taskId) throw new NotFoundError('Resolution plan');
    return plan;
  }

  return {
    /** Lists every plan version for a task. Requires ticket view access. */
    async list(ticketId, taskId, user) {
      await taskForRead(ticketId, taskId, user);
      return repository.listForTask(taskId);
    },

    /** Reads a single plan. Requires ticket view access. */
    async getOne(ticketId, taskId, planId, user) {
      await taskForRead(ticketId, taskId, user);
      return planOfTask(taskId, planId);
    },

    /**
     * Returns the task's editable draft, creating a fresh empty one if none
     * exists. Idempotent — at most one draft per task at a time. Lead-only.
     */
    async ensureDraft(ticketId, taskId, user) {
      const task = await taskForAuthor(ticketId, taskId, user);

      const existing = await repository.findDraftForTask(taskId);
      if (existing) return existing;

      const version = (await repository.maxVersion(taskId)) + 1;
      const plan = await repository.create({
        ticket_id: task.ticket_id,
        dept_task_id: taskId,
        title: null,
        content_json: undefined,
        content_text: null,
        status: 'DRAFT',
        version,
        created_by: user?.id ?? null,
        created_by_name: user?.name ?? null,
      });

      await auditService.record({
        action: auditService.Action.CREATE, entity: 'ResolutionPlan', entityId: plan.id,
        actor: user, changes: { ticket_id: ticketId, dept_task_id: taskId, version },
      });
      return plan;
    },

    /**
     * Saves draft content. Only a DRAFT is editable — a finalised plan is a
     * locked record; to change it, clone a new version. Lead-only.
     *
     * @param {object} dto { title?, content_json?, content_text? }
     */
    async saveDraft(ticketId, taskId, planId, dto, user) {
      await taskForAuthor(ticketId, taskId, user);
      const plan = await planOfTask(taskId, planId);
      if (plan.status !== 'DRAFT') throw new BadRequestError('This plan is finalised — clone it to make a new version');

      return repository.update(planId, {
        title: dto.title ?? plan.title,
        content_json: dto.content_json === undefined ? undefined : dto.content_json,
        content_text: dto.content_text ?? plan.content_text,
      });
    },

    /**
     * Finalises a draft: locks it as the FINAL record for this issue. This is
     * document-completion only — it does NOT change the task's status or holder
     * (that is driven by the department-task actions). Lead-only.
     *
     * @returns {Promise<object>} The finalised plan.
     */
    async finalize(ticketId, taskId, planId, user) {
      await taskForAuthor(ticketId, taskId, user);
      const plan = await planOfTask(taskId, planId);
      if (plan.status !== 'DRAFT') throw new BadRequestError('This plan is already finalised');

      const finalized = await repository.update(planId, { status: 'FINAL', finalized_at: new Date() });

      await auditService.record({
        action: 'FINALIZED', entity: 'ResolutionPlan', entityId: planId,
        actor: user, changes: { ticket_id: ticketId, dept_task_id: taskId, version: finalized.version },
      });
      return finalized;
    },

    /**
     * Discards a draft revision. If it was cloned from a version that this
     * revision superseded, that version is brought back as the current FINAL —
     * so discarding a revision cleanly rolls back to the plan you had before.
     * Lead-only.
     *
     * @returns {Promise<{ id: number }>}
     */
    async discard(ticketId, taskId, planId, user) {
      await taskForAuthor(ticketId, taskId, user);
      const plan = await planOfTask(taskId, planId);
      if (plan.status !== 'DRAFT') throw new BadRequestError('Only a draft revision can be discarded');

      await repository.softDelete(planId);

      // Undo the revision: restore the version it was cloned from, if that
      // version was superseded by this draft.
      if (plan.parent_plan_id) {
        const parent = await repository.findById(plan.parent_plan_id);
        if (parent && parent.status === 'SUPERSEDED') {
          await repository.update(parent.id, { status: 'FINAL' });
        }
      }

      await auditService.record({
        action: 'DISCARDED', entity: 'ResolutionPlan', entityId: planId,
        actor: user, changes: { ticket_id: ticketId, dept_task_id: taskId, version: plan.version },
      });
      return { id: planId };
    },

    /**
     * Rolls back to a superseded version: makes it the current FINAL and
     * supersedes whatever was active. Refuses while a draft is open (discard or
     * finish it first) so the version history stays unambiguous. Lead-only.
     *
     * @returns {Promise<object>} The restored (now FINAL) plan.
     */
    async restore(ticketId, taskId, planId, user) {
      await taskForAuthor(ticketId, taskId, user);
      const plan = await planOfTask(taskId, planId);
      if (plan.status !== 'SUPERSEDED') throw new BadRequestError('Only a superseded version can be restored');

      const openDraft = await repository.findDraftForTask(taskId);
      if (openDraft) throw new BadRequestError('Finish or discard the open draft before rolling back');

      await repository.supersedeActiveExcept(taskId, planId);
      const restored = await repository.update(planId, { status: 'FINAL', finalized_at: new Date() });

      await auditService.record({
        action: 'RESTORED', entity: 'ResolutionPlan', entityId: planId,
        actor: user, changes: { ticket_id: ticketId, dept_task_id: taskId, version: restored.version },
      });
      return restored;
    },

    /**
     * Clones a plan into a fresh DRAFT — used to revise without touching the
     * locked record. The source, if it was the active FINAL, is marked
     * SUPERSEDED but kept for comparison. Refuses if a draft already exists.
     * Lead-only.
     *
     * @returns {Promise<object>} The new draft.
     */
    async clone(ticketId, taskId, planId, user) {
      const task = await taskForAuthor(ticketId, taskId, user);
      const source = await planOfTask(taskId, planId);

      const openDraft = await repository.findDraftForTask(taskId);
      if (openDraft) throw new BadRequestError('A draft plan already exists — finish or discard it first');

      const version = (await repository.maxVersion(taskId)) + 1;
      const draft = await repository.create({
        ticket_id: task.ticket_id,
        dept_task_id: taskId,
        title: source.title,
        content_json: source.content_json === null ? undefined : source.content_json,
        content_text: source.content_text,
        status: 'DRAFT',
        version,
        parent_plan_id: source.id,
        created_by: user?.id ?? null,
        created_by_name: user?.name ?? null,
      });

      if (source.status === 'FINAL') {
        await repository.update(source.id, { status: 'SUPERSEDED' });
      }

      await auditService.record({
        action: 'CLONED', entity: 'ResolutionPlan', entityId: draft.id,
        actor: user, changes: { ticket_id: ticketId, dept_task_id: taskId, cloned_from: source.id, version },
      });
      return draft;
    },
  };
}

const resolutionService = createResolutionService(resolutionRepository, deptTaskRepository, serviceRepository);

module.exports = { resolutionService, createResolutionService };
