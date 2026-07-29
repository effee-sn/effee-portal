const prisma = require('../../lib/prisma');

/**
 * Resolution-plan data-access layer (part of the service module).
 *
 * Plans are versioned documents attached to a department task (one plan lineage
 * per issue). Only this file touches Prisma for the ResolutionPlan model.
 * Soft-delete scoping is applied through `active`.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createResolutionRepository(db) {
  const planSelect = Object.freeze({
    id: true,
    ticket_id: true,
    dept_task_id: true,
    title: true,
    content_json: true,
    content_text: true,
    status: true,
    version: true,
    parent_plan_id: true,
    created_by: true,
    created_by_name: true,
    finalized_at: true,
    created_at: true,
    updated_at: true,
  });

  /** @param {Record<string, unknown>} [where] */
  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    planSelect,

    /** All plan versions for a department task, oldest first. */
    listForTask(taskId) {
      return db.resolutionPlan.findMany({
        where: active({ dept_task_id: taskId }),
        select: planSelect,
        orderBy: { version: 'asc' },
      });
    },

    /** @param {number} id */
    findById(id) {
      return db.resolutionPlan.findFirst({ where: active({ id }), select: planSelect });
    },

    /** The task's current editable draft, if any. */
    findDraftForTask(taskId) {
      return db.resolutionPlan.findFirst({
        where: active({ dept_task_id: taskId, status: 'DRAFT' }),
        select: planSelect,
      });
    },

    /** Highest version number used on a task (0 when it has no plans yet). */
    async maxVersion(taskId) {
      const agg = await db.resolutionPlan.aggregate({
        where: active({ dept_task_id: taskId }),
        _max: { version: true },
      });
      return agg._max.version ?? 0;
    },

    /** @param {object} data */
    create(data) {
      return db.resolutionPlan.create({ data, select: planSelect });
    },

    /** @param {number} id @param {object} data */
    update(id, data) {
      return db.resolutionPlan.update({ where: { id }, data, select: planSelect });
    },

    /** Soft-deletes a plan version (used to discard a draft). */
    softDelete(id) {
      return db.resolutionPlan.update({ where: { id }, data: { deleted_at: new Date() }, select: { id: true } });
    },

    /**
     * Marks every active (DRAFT/FINAL) plan of a task as SUPERSEDED except the
     * given one. Used when rolling back to an older version so exactly one plan
     * is FINAL afterwards.
     *
     * @param {number} taskId
     * @param {number} exceptId
     */
    supersedeActiveExcept(taskId, exceptId) {
      return db.resolutionPlan.updateMany({
        where: { dept_task_id: taskId, deleted_at: null, id: { not: exceptId }, status: { in: ['DRAFT', 'FINAL'] } },
        data: { status: 'SUPERSEDED' },
      });
    },
  };
}

const resolutionRepository = createResolutionRepository(prisma);

module.exports = { resolutionRepository, createResolutionRepository };
