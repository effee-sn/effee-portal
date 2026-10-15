const prisma = require('../../lib/prisma');

/**
 * Audit log data-access layer.
 *
 * Append and read only — deliberately exposes no update or delete. An audit
 * trail that the application can rewrite is not evidence of anything, so the
 * inability to modify it is a feature rather than an omission.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createAuditRepository(db) {
  /**
   * How to name a record of each audited type, for display. Soft-deleted rows
   * are included on purpose: the trail is about the past.
   * @type {Record<string, (ids: number[]) => Promise<Array<[number, string]>>>}
   */
  const LABELERS = {
    User: async (ids) => (await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }))
      .map((u) => [u.id, `${u.name} · ${u.email}`]),
    Enquiry: async (ids) => (await db.enquiry.findMany({ where: { id: { in: ids } }, select: { id: true, ref_no: true, title: true } }))
      .map((e) => [e.id, `${e.ref_no} · ${e.title}`]),
    Customer: async (ids) => (await db.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
      .map((r) => [r.id, r.name]),
    Contact: async (ids) => (await db.contact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
      .map((r) => [r.id, r.name]),
    Role: async (ids) => (await db.role.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
      .map((r) => [r.id, r.name]),
    Department: async (ids) => (await db.department.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
      .map((r) => [r.id, r.name]),
    Workflow: async (ids) => (await db.workflow.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
      .map((r) => [r.id, r.name]),
    SalesApplication: async (ids) => (await db.salesApplication.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
      .map((r) => [r.id, r.name]),
    Project: async (ids) => (await db.project.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } }))
      .map((r) => [r.id, `${r.code} · ${r.name}`]),
    ServiceTicket: async (ids) => (await db.serviceTicket.findMany({ where: { id: { in: ids } }, select: { id: true, ticket_id: true, issue_title: true } }))
      .map((r) => [r.id, `${r.ticket_id} · ${r.issue_title}`]),
    TicketDepartmentTask: async (ids) => (await db.ticketDepartmentTask.findMany({ where: { id: { in: ids } }, select: { id: true, department_name: true } }))
      .map((r) => [r.id, r.department_name]),
    EnquiryActivity: async (ids) => (await db.enquiryActivity.findMany({ where: { id: { in: ids } }, select: { id: true, subject: true } }))
      .map((r) => [r.id, r.subject]),
    EnquiryAttachment: async (ids) => (await db.enquiryAttachment.findMany({ where: { id: { in: ids } }, select: { id: true, file_name: true } }))
      .map((r) => [r.id, r.file_name]),
  };

  return {
    /**
     * Display names for records, per type, in one query per type.
     * @param {Record<string, number[]>} idsByEntity e.g. { User: [3, 7], Enquiry: [12] }
     * @returns {Promise<Record<string, Map<number, string>>>}
     */
    async labelsFor(idsByEntity) {
      const out = {};
      await Promise.all(Object.entries(idsByEntity).map(async ([entity, ids]) => {
        const labeler = LABELERS[entity];
        const unique = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
        if (!labeler || !unique.length) return;
        try { out[entity] = new Map(await labeler(unique)); }
        catch { /* a missing table or column must never break the audit view */ }
      }));
      return out;
    },

    /**
     * @param {object} entry
     * @returns {Promise<object>}
     */
    create(entry) {
      return db.auditLog.create({ data: entry });
    },

    /**
     * @param {object} params
     * @param {Record<string, unknown>} params.where
     * @param {Record<string, 'asc'|'desc'>} params.orderBy
     * @param {number} params.skip
     * @param {number} params.take
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async findPage({ where, orderBy, skip, take }) {
      const [items, total] = await Promise.all([
        db.auditLog.findMany({ where, orderBy, skip, take }),
        db.auditLog.count({ where }),
      ]);
      return { items, total };
    },
  };
}

const auditRepository = createAuditRepository(prisma);

module.exports = { auditRepository, createAuditRepository };
