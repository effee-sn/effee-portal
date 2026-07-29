const prisma = require('../../lib/prisma');

/**
 * Data-access for per-department work tasks (part of the service module).
 * Only this file touches Prisma for TicketDepartmentTask. Soft-delete scoped.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createDeptTaskRepository(db) {
  const taskSelect = Object.freeze({
    id: true, ticket_id: true, department_id: true, department_name: true,
    technical_category: true, issue_note: true, status: true,
    lead_user_id: true, lead_name: true,
    assigned_user_id: true, assigned_to_name: true,
    resolver_user_id: true, resolver_name: true,
    awaiting_validation: true,
    resolution_note: true, resolution_note_json: true, decline_reason: true,
    created_at: true, updated_at: true, resolved_at: true,
    // Presence of a FINALISED plan for this issue — drives the resolve gate
    // (a task cannot be resolved without a final plan AND a report). One row max.
    plans: { where: { deleted_at: null, status: 'FINAL' }, select: { id: true }, take: 1 },
  });

  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    taskSelect,

    /** All active tasks for a ticket, oldest first. */
    listForTicket(ticketId) {
      return db.ticketDepartmentTask.findMany({
        where: active({ ticket_id: ticketId }), select: taskSelect, orderBy: { created_at: 'asc' },
      });
    },

    /** @param {number} id */
    findById(id) {
      return db.ticketDepartmentTask.findFirst({ where: active({ id }), select: taskSelect });
    },

    /** @param {object} data */
    create(data) { return db.ticketDepartmentTask.create({ data, select: taskSelect }); },

    /** @param {number} id @param {object} data */
    update(id, data) { return db.ticketDepartmentTask.update({ where: { id }, data, select: taskSelect }); },

    /** @param {number} id */
    softDelete(id) {
      return db.ticketDepartmentTask.update({ where: { id }, data: { deleted_at: new Date() }, select: { id: true } });
    },

    /**
     * Ticket ids where the user currently holds an OPEN task — for the inbox, so
     * a lead/resolver sees a ticket while a department task is with them.
     * @param {number} userId
     * @returns {Promise<number[]>}
     */
    async ticketIdsForAssignee(userId) {
      const rows = await db.ticketDepartmentTask.findMany({
        where: active({ assigned_user_id: userId, status: 'OPEN' }), select: { ticket_id: true },
      });
      return [...new Set(rows.map((r) => r.ticket_id))];
    },
  };
}

const deptTaskRepository = createDeptTaskRepository(prisma);

module.exports = { deptTaskRepository, createDeptTaskRepository };
