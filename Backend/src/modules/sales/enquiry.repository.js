const prisma = require('../../lib/prisma');

/**
 * Enquiry data-access layer.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createEnquiryRepository(db) {
  const enquiryListSelect = Object.freeze({
    id: true,
    ref_no: true,
    title: true,
    stage: true,
    enquiry_type: true,
    is_refurbishment: true,
    current_temperature: true,
    stage_since: true,
    expected_value: true,
    expected_close: true,
    order_value: true,
    order_fx_rate: true,
    currency_code: true,
    currency: { select: { code: true, name: true, symbol: true } },
    customer_id: true,
    customer: { select: { id: true, name: true } },
    application_id: true,
    application: { select: { id: true, name: true } },
    owner_id: true,
    owner: { select: { id: true, name: true } },
    handler_id: true,
    handler: { select: { id: true, name: true } },
    queue_department_id: true,
    won_at: true,
    created_at: true,
    _count: {
      select: {
        activities: { where: { deleted_at: null } },
        quotations: { where: { deleted_at: null } },
      },
    },
  });

  const enquiryDetailSelect = Object.freeze({
    id: true,
    ref_no: true,
    title: true,
    stage: true,
    enquiry_type: true,
    is_refurbishment: true,
    current_temperature: true,
    stage_since: true,
    description: true,
    expected_value: true,
    expected_close: true,
    final_cost: true,
    won_at: true,
    order_no: true,
    order_value: true,
    order_fx_rate: true,
    order_date: true,
    currency_code: true,
    currency: { select: { code: true, name: true, symbol: true } },

    won_declaration: true,
    won_terms: true,
    lost_at: true,
    lost_reason: true,
    lost_to: true,
    customer_id: true,
    customer: { select: { id: true, name: true, state: true, state_code: true, gstin: true } },
    application_id: true,
    application: { select: { id: true, name: true, is_active: true } },
    contact_id: true,
    contact: { select: { id: true, name: true, designation: true, email: true, phone: true } },
    owner_id: true,
    owner: { select: { id: true, name: true } },
    handler_id: true,
    handler: { select: { id: true, name: true, email: true } },
    queue_department_id: true,
    queue_department: { select: { id: true, name: true, head_user_id: true } },
    queued_at: true,
    created_at: true,
    updated_at: true,
    created_by: true,
    stageEvents: {
      orderBy: { created_at: 'asc' },
      select: { id: true, from_stage: true, to_stage: true, changed_by: true, created_at: true },
    },
    _count: {
      select: {
        activities: { where: { deleted_at: null } },
        quotations: { where: { deleted_at: null } },
      },
    },
  });

  /** @param {Record<string, unknown>} [where] */
  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    enquiryListSelect,
    enquiryDetailSelect,
    active,

    async findPage({ where, orderBy, skip, take }) {
      const scoped = active(where);
      const [items, total] = await Promise.all([
        db.enquiry.findMany({ where: scoped, select: enquiryListSelect, orderBy, skip, take }),
        db.enquiry.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /** @param {number} id */
    findById(id) {
      return db.enquiry.findFirst({ where: active({ id }), select: enquiryDetailSelect });
    },

    /**
     * Highest ref_no for a given `ENQ-YYYY-` prefix — zero-padded suffixes sort
     * lexically the same as numerically, so a desc order gives the latest.
     * @param {string} prefix
     */
    async maxRefForPrefix(prefix) {
      const row = await db.enquiry.findFirst({
        where: { ref_no: { startsWith: prefix } },
        orderBy: { ref_no: 'desc' },
        select: { ref_no: true },
      });
      return row?.ref_no ?? null;
    },

    /** @param {object} data */
    create(data) {
      return db.enquiry.create({ data, select: enquiryDetailSelect });
    },

    /** @param {number} id @param {object} data */
    update(id, data) {
      return db.enquiry.update({ where: { id }, data, select: enquiryDetailSelect });
    },

    /**
     * Appends an immutable stage-transition record.
     * @param {{ enquiry_id: number, from_stage: string|null, to_stage: string, changed_by: number|null }} data
     */
    recordStageEvent(data) {
      return db.enquiryStageEvent.create({ data, select: { id: true } });
    },

    /** @param {number} id @param {number|null} [actorId] */
    softDelete(id, actorId = null) {
      return db.enquiry.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    // ── Foreign-key existence checks ──────────────────────────────────────────
    async customerExists(id) {
      const row = await db.customer.findFirst({ where: { id, deleted_at: null }, select: { id: true } });
      return row !== null;
    },

    /** A contact must exist, be live, and belong to the given customer. */
    async contactBelongsToCustomer(contactId, customerId) {
      const row = await db.contact.findFirst({
        where: { id: contactId, customer_id: customerId, deleted_at: null },
        select: { id: true },
      });
      return row !== null;
    },

    /** An application can be newly chosen only while it is active. */
    async applicationActive(id) {
      const row = await db.salesApplication.findFirst({ where: { id, is_active: true }, select: { id: true } });
      return row !== null;
    },

    async userExists(id) {
      const row = await db.user.findFirst({ where: { id, deleted_at: null }, select: { id: true } });
      return row !== null;
    },

    // ── Department queue ─────────────────────────────────────────────────────
    /** Ids of the live departments this user heads. */
    async headedDepartmentIds(userId) {
      if (!userId) return [];
      const rows = await db.department.findMany({ where: { head_user_id: userId, deleted_at: null }, select: { id: true } });
      return rows.map((r) => r.id);
    },

    /** Who a department's waiting enquiry can go to: its head and its active members. */
    async departmentTeam(departmentId) {
      const dept = await db.department.findFirst({ where: { id: departmentId, deleted_at: null }, select: { head_user_id: true } });
      const users = await db.user.findMany({
        where: {
          status: 'ACTIVE', deleted_at: null,
          OR: [{ department_id: departmentId }, ...(dept?.head_user_id ? [{ id: dept.head_user_id }] : [])],
        },
        select: { id: true, name: true, designation: true },
        orderBy: { name: 'asc' },
      });
      return users.map((u) => ({ ...u, is_head: u.id === dept?.head_user_id }));
    },

    /**
     * Enquiries waiting in these departments' queues (all queues when null),
     * oldest first, with each department's team to choose from.
     * @param {number[]|null} departmentIds
     */
    async queue(departmentIds) {
      const where = active({ queue_department_id: departmentIds ? { in: departmentIds } : { not: null } });
      const items = await db.enquiry.findMany({
        where,
        select: { ...enquiryListSelect, queued_at: true, queue_department_id: true, queue_department: { select: { id: true, name: true } } },
        orderBy: [{ queued_at: 'asc' }, { id: 'asc' }],
      });
      const ids = departmentIds ?? [...new Set(items.map((e) => e.queue_department_id))];
      const departments = await db.department.findMany({ where: { id: { in: ids }, deleted_at: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const teams = await Promise.all(departments.map(async (d) => ({ ...d, team: await this.departmentTeam(d.id) })));
      return { departments: teams, items };
    },

    /** Records who does the work at `stage` on its latest entry (after the head picks someone). */
    async setStageHandler(enquiryId, stage, userId) {
      const row = await db.enquiryStageEvent.findFirst({ where: { enquiry_id: enquiryId, to_stage: stage }, orderBy: { id: 'desc' }, select: { id: true } });
      if (row) await db.enquiryStageEvent.update({ where: { id: row.id }, data: { handler_id: userId } });
    },

    /** Waiting enquiries whose head has not been reminded, queued before `before`. */
    staleQueue(before) {
      return db.enquiry.findMany({
        where: active({ queue_department_id: { not: null }, queued_at: { lte: before }, queue_reminded_at: null }),
        select: { id: true, ref_no: true, title: true, stage: true, handler_id: true, queued_at: true, queue_department: { select: { name: true } } },
      });
    },

    /** Claims the queue reminder for this wait (one sender in a cluster). */
    async claimQueueReminder(id, queuedAt) {
      const r = await db.enquiry.updateMany({ where: { id, queued_at: queuedAt, queue_reminded_at: null }, data: { queue_reminded_at: new Date() } });
      return r.count === 1;
    },

    /**
     * Document presence flags for the prerequisite gates.
     * @param {number} enquiryId
     * @returns {Promise<{ hasConcept: boolean, hasCosting: boolean, hasSentOffer: boolean }>}
     */
    async docFlags(enquiryId) {
      const [rows, activityCount, concludedReviewCount] = await Promise.all([
        db.enquiryAttachment.findMany({
          // Current documents only — superseded versions are history.
          where: { enquiry_id: enquiryId, deleted_at: null, superseded_at: null },
          select: { kind: true, sent_at: true },
        }),
        db.enquiryActivity.count({ where: { enquiry_id: enquiryId, deleted_at: null, is_review: false } }),
        // Only a review logged in the Review stage concludes it (one logged at
        // New / Contacted is history); entries from before stages were stamped
        // (stage null) still count.
        db.enquiryActivity.count({
          where: { enquiry_id: enquiryId, deleted_at: null, is_review: true, follow_up_ended: true, OR: [{ stage: 'REVIEW' }, { stage: null }] },
        }),
      ]);
      return {
        hasFormat: rows.some((r) => r.kind === 'FORMAT_PDF' || r.kind === 'FORMAT_EXCEL'),
        hasConcept: rows.some((r) => r.kind === 'CONCEPT'),
        hasPowerCalc: rows.some((r) => r.kind === 'POWER_CALC'),
        hasCosting: rows.some((r) => r.kind === 'COSTING'),
        hasCostingReview: rows.some((r) => r.kind === 'COSTING_REVIEW'),
        hasSentOffer: rows.some((r) => r.kind === 'OFFER' && r.sent_at != null),
        hasActivity: activityCount > 0,
        hasConcludedReview: concludedReviewCount > 0,
      };
    },
  };
}

const enquiryRepository = createEnquiryRepository(prisma);

module.exports = { enquiryRepository, createEnquiryRepository };
