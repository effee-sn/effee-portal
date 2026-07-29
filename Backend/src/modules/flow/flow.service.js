const { flowRepository } = require('./flow.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ValidationError, buildSearchClause } = require('../../core');

/**
 * Workflow business logic.
 *
 * A workflow is a template: an ordered list of steps, each naming who owns that
 * stage. This layer validates that a step's assignee target actually exists and
 * matches its declared type, then persists the workflow. It does not touch
 * tickets — running a workflow against tickets is a later phase.
 *
 * @param {ReturnType<typeof import('./flow.repository').createFlowRepository>} repository
 */
function createFlowService(repository) {
  const SORTABLE_FIELDS   = Object.freeze(['name', 'created_at']);
  const SEARCHABLE_FIELDS = Object.freeze(['name', 'description']);

  /**
   * Which id field each assignee type requires. DEPARTMENT_HEAD reuses the
   * department id (the head is resolved from it); MANUAL needs no target.
   */
  const TARGET_FIELD = Object.freeze({
    USER:            'assignee_user_id',
    ROLE:            'assignee_role_id',
    DEPARTMENT:      'assignee_department_id',
    // DEPARTMENT_HEAD's department is OPTIONAL: with one it routes to that
    // department's head; without one it routes to the head of the ticket's
    // originating department (resolved at runtime). So it is not required here.
    DEPARTMENT_HEAD: null,
    CREATOR:         null,
    MANUAL:          null,
  });

  /**
   * Validates every step's assignee and shapes it for persistence.
   *
   * Each step must carry exactly the id its type needs (and none of the
   * others), and that id must reference a live record. Failures are collected
   * per-step so the client gets all of them at once.
   *
   * @param {Array<object>} steps Validated step DTOs.
   * @returns {Promise<Array<object>>} Prisma-shaped step rows.
   * @throws {ValidationError}
   */
  async function buildSteps(steps) {
    const issues = [];

    // Collect referenced ids per target type for a single existence check each.
    const userIds = [];
    const roleIds = [];
    const deptIds = [];

    steps.forEach((step) => {
      const field = TARGET_FIELD[step.assignee_type];
      const value = field ? step[field] : undefined;

      if (field && !value) {
        issues.push({ field: `steps.${step.step_order}`, message: `${step.assignee_type} step needs a target` });
        return;
      }
      if (step.assignee_type === 'USER')       userIds.push(value);
      if (step.assignee_type === 'ROLE')       roleIds.push(value);
      if (step.assignee_type === 'DEPARTMENT')  deptIds.push(value);
      // DEPARTMENT_HEAD only carries a department when it targets a specific one.
      if (step.assignee_type === 'DEPARTMENT_HEAD' && step.assignee_department_id) {
        deptIds.push(step.assignee_department_id);
      }
    });

    const [users, roles, depts] = await Promise.all([
      repository.existingUserIds(userIds),
      repository.existingRoleIds(roleIds),
      repository.existingDepartmentIds(deptIds),
    ]);

    /** @type {Array<object>} */
    const rows = [];

    steps.forEach((step) => {
      const row = {
        name: step.name,
        step_order: step.step_order,
        assignee_type: step.assignee_type,
        assignee_user_id: null,
        assignee_role_id: null,
        assignee_department_id: null,
      };

      switch (step.assignee_type) {
        case 'USER':
          if (!users.has(step.assignee_user_id)) issues.push({ field: `steps.${step.step_order}`, message: 'Assigned user does not exist' });
          row.assignee_user_id = step.assignee_user_id;
          break;
        case 'ROLE':
          if (!roles.has(step.assignee_role_id)) issues.push({ field: `steps.${step.step_order}`, message: 'Assigned role does not exist' });
          row.assignee_role_id = step.assignee_role_id;
          break;
        case 'DEPARTMENT':
          if (!depts.has(step.assignee_department_id)) issues.push({ field: `steps.${step.step_order}`, message: 'Assigned department does not exist' });
          row.assignee_department_id = step.assignee_department_id;
          break;
        case 'DEPARTMENT_HEAD':
          // A specific department is validated; no department means "the
          // originating department", resolved when the ticket runs.
          if (step.assignee_department_id) {
            if (!depts.has(step.assignee_department_id)) issues.push({ field: `steps.${step.step_order}`, message: 'Assigned department does not exist' });
            row.assignee_department_id = step.assignee_department_id;
          }
          break;
        case 'CREATOR':
        case 'MANUAL':
        default:
          break;
      }

      rows.push(row);
    });

    if (issues.length > 0) throw new ValidationError('Validation failed', issues);
    return rows;
  }

  return {
    SORTABLE_FIELDS,

    /** @param {import('../../core/http/queryOptions').ListQuery} query */
    async list(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const where = { ...query.filters, ...(search || {}) };
      return repository.findPage({ where, orderBy: query.orderBy, skip: query.skip, take: query.take });
    },

    /** @param {number} id @throws {NotFoundError} */
    async getById(id) {
      const workflow = await repository.findById(id);
      if (!workflow) throw new NotFoundError('Workflow');
      return workflow;
    },

    /**
     * Soft-deletes a workflow.
     *
     * @param {number} id
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     * @returns {Promise<void>}
     * @throws {NotFoundError}
     */
    async remove(id, actor) {
      const workflow = await repository.findById(id);
      if (!workflow) throw new NotFoundError('Workflow');

      await repository.softDelete(id, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'Workflow',
        entityId: id,
        actor,
        changes: { name: workflow.name, soft_deleted: true },
      });
    },

    /**
     * Creates a workflow with its steps.
     *
     * @param {object} dto Validated body.
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     * @returns {Promise<object>}
     */
    async create(dto, actor) {
      // Re-number steps to a clean 1..n sequence in the order supplied, so the
      // stored order never has gaps regardless of what the client sent.
      const ordered = dto.steps.map((step, index) => ({ ...step, step_order: index + 1 }));
      const steps = await buildSteps(ordered);

      const workflow = await repository.create({
        data: {
          name: dto.name,
          module: dto.module || 'service',
          description: dto.description ?? null,
          is_active: Boolean(dto.is_active),
          created_by: actor?.id ?? null,
          updated_by: actor?.id ?? null,
        },
        steps,
      });

      // At most one active workflow per module.
      if (workflow.is_active) {
        await repository.deactivateOthers(workflow.module, workflow.id);
      }

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'Workflow',
        entityId: workflow.id,
        actor,
        changes: { name: workflow.name, module: workflow.module, steps: steps.length },
      });

      return workflow;
    },

    /**
     * Updates a workflow, replacing its stages.
     *
     * @param {number} id
     * @param {object} dto Validated body (same shape as create).
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     * @returns {Promise<object>}
     * @throws {NotFoundError|ValidationError}
     */
    async update(id, dto, actor) {
      const existing = await repository.findById(id);
      if (!existing) throw new NotFoundError('Workflow');

      const ordered = dto.steps.map((step, index) => ({ ...step, step_order: index + 1 }));
      const steps = await buildSteps(ordered);

      const workflow = await repository.update(id, {
        data: {
          name: dto.name,
          module: dto.module || existing.module,
          description: dto.description ?? null,
          is_active: Boolean(dto.is_active),
          updated_by: actor?.id ?? null,
        },
        steps,
      });

      if (workflow.is_active) {
        await repository.deactivateOthers(workflow.module, workflow.id);
      }

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Workflow',
        entityId: id,
        actor,
        changes: { name: workflow.name, steps: steps.length },
      });

      return workflow;
    },
  };
}

const flowService = createFlowService(flowRepository);

module.exports = { flowService, createFlowService };
