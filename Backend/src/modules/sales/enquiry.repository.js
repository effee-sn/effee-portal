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
    source: true,
    expected_value: true,
    expected_close: true,
    order_value: true,
    customer_id: true,
    customer: { select: { id: true, name: true } },
    owner_id: true,
    owner: { select: { id: true, name: true } },
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
    source: true,
    description: true,
    expected_value: true,
    expected_close: true,
    won_at: true,
    order_no: true,
    order_value: true,
    order_date: true,
    lost_at: true,
    lost_reason: true,
    customer_id: true,
    customer: { select: { id: true, name: true, state: true, state_code: true, gstin: true } },
    contact_id: true,
    contact: { select: { id: true, name: true, designation: true, email: true, phone: true } },
    owner_id: true,
    owner: { select: { id: true, name: true } },
    created_at: true,
    updated_at: true,
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

    async userExists(id) {
      const row = await db.user.findFirst({ where: { id, deleted_at: null }, select: { id: true } });
      return row !== null;
    },
  };
}

const enquiryRepository = createEnquiryRepository(prisma);

module.exports = { enquiryRepository, createEnquiryRepository };
