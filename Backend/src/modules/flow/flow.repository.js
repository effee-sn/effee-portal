const prisma = require('../../lib/prisma');

/**
 * Workflow data-access layer. The only file in the flow module touching Prisma.
 *
 * A workflow is a module-scoped, ordered set of steps; each step names an
 * assignee target (user / role / department / department-head / manual).
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createFlowRepository(db) {
  /** Step projection, including the resolved assignee name for display. */
  const stepSelect = Object.freeze({
    id: true,
    name: true,
    step_order: true,
    assignee_type: true,
    assignee_user_id: true,
    assignee_role_id: true,
    assignee_department_id: true,
    assignee_user:       { select: { id: true, name: true } },
    assignee_role:       { select: { id: true, name: true } },
    assignee_department: { select: { id: true, name: true } },
  });

  const workflowSelect = Object.freeze({
    id: true,
    name: true,
    module: true,
    description: true,
    is_active: true,
    created_at: true,
    updated_at: true,
    steps: { select: stepSelect, orderBy: { step_order: 'asc' } },
  });

  /** @param {Record<string, unknown>} [where] */
  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    workflowSelect,

    /**
     * @param {object} params
     * @param {Record<string, unknown>} params.where
     * @param {Record<string, 'asc'|'desc'>} params.orderBy
     * @param {number} params.skip
     * @param {number} params.take
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async findPage({ where, orderBy, skip, take }) {
      const scoped = active(where);
      const [items, total] = await Promise.all([
        db.workflow.findMany({ where: scoped, select: workflowSelect, orderBy, skip, take }),
        db.workflow.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /** @param {number} id */
    findById(id) {
      return db.workflow.findFirst({ where: active({ id }), select: workflowSelect });
    },

    /**
     * Soft-deletes a workflow. Its steps are left in place (they cascade only
     * on a hard delete), so a restore would bring the flow back intact.
     *
     * @param {number} id
     * @param {number|null} [actorId]
     * @returns {Promise<{ id: number }>}
     */
    softDelete(id, actorId = null) {
      return db.workflow.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    /**
     * Creates a workflow and its ordered steps in one write.
     *
     * @param {object} params
     * @param {object} params.data Workflow scalar fields.
     * @param {Array<object>} params.steps Prisma-shaped step create rows.
     * @returns {Promise<object>}
     */
    create({ data, steps }) {
      return db.workflow.create({
        data: {
          ...data,
          ...(steps.length > 0 ? { steps: { create: steps } } : {}),
        },
        select: workflowSelect,
      });
    },

    /**
     * Updates a workflow's fields and replaces its steps wholesale.
     *
     * Editing a flow means redefining its stages, so the old steps are removed
     * and the new set inserted in one transaction — never leaving the workflow
     * with a half-updated stage list.
     *
     * @param {number} id
     * @param {object} params
     * @param {object} params.data Workflow scalar fields.
     * @param {Array<object>} params.steps Prisma-shaped step create rows.
     * @returns {Promise<object>}
     */
    update(id, { data, steps }) {
      return db.$transaction(async (tx) => {
        await tx.workflowStep.deleteMany({ where: { workflow_id: id } });
        await tx.workflow.update({
          where: { id },
          data: { ...data, ...(steps.length > 0 ? { steps: { create: steps } } : {}) },
        });
        return tx.workflow.findUnique({ where: { id }, select: workflowSelect });
      });
    },

    /**
     * Clears the active flag on other workflows in the same module, so at most
     * one is active per module. Run before activating a workflow.
     *
     * @param {string} module
     * @param {number} exceptId
     */
    deactivateOthers(module, exceptId) {
      return db.workflow.updateMany({
        where: { module, deleted_at: null, NOT: { id: exceptId } },
        data: { is_active: false },
      });
    },

    // ── Reference existence checks (for validating step assignees) ────────────

    /** @param {number[]} ids @returns {Promise<Set<number>>} */
    async existingUserIds(ids) {
      if (ids.length === 0) return new Set();
      const rows = await db.user.findMany({ where: { id: { in: ids }, deleted_at: null }, select: { id: true } });
      return new Set(rows.map((r) => r.id));
    },

    /** @param {number[]} ids @returns {Promise<Set<number>>} */
    async existingRoleIds(ids) {
      if (ids.length === 0) return new Set();
      const rows = await db.role.findMany({ where: { id: { in: ids }, deleted_at: null }, select: { id: true } });
      return new Set(rows.map((r) => r.id));
    },

    /** @param {number[]} ids @returns {Promise<Set<number>>} */
    async existingDepartmentIds(ids) {
      if (ids.length === 0) return new Set();
      const rows = await db.department.findMany({ where: { id: { in: ids }, deleted_at: null }, select: { id: true } });
      return new Set(rows.map((r) => r.id));
    },
  };
}

const flowRepository = createFlowRepository(prisma);

module.exports = { flowRepository, createFlowRepository };
