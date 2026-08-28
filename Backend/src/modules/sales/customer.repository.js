const prisma = require('../../lib/prisma');

/**
 * Customer data-access layer. The only file in the customer resource touching
 * Prisma.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createCustomerRepository(db) {
  // List projection — light; contacts/enquiries are only loaded on detail.
  const customerListSelect = Object.freeze({
    id: true,
    name: true,
    gstin: true,
    email: true,
    phone: true,
    city: true,
    state: true,
    industry: true,
    owner_id: true,
    owner: { select: { id: true, name: true } },
    created_at: true,
    _count: {
      select: {
        contacts:  { where: { deleted_at: null } },
        enquiries: { where: { deleted_at: null } },
      },
    },
  });

  // Detail projection — includes the contact list and live owner.
  const customerDetailSelect = Object.freeze({
    id: true,
    name: true,
    gstin: true,
    email: true,
    phone: true,
    website: true,
    industry: true,
    billing_address: true,
    shipping_address: true,
    city: true,
    state: true,
    state_code: true,
    pincode: true,
    notes: true,
    owner_id: true,
    owner: { select: { id: true, name: true } },
    contacts: {
      where: { deleted_at: null },
      orderBy: [{ is_primary: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        designation: true,
        email: true,
        phone: true,
        is_primary: true,
        notes: true,
      },
    },
    created_at: true,
    updated_at: true,
  });

  /** @param {Record<string, unknown>} [where] */
  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    customerListSelect,
    customerDetailSelect,
    active,

    /**
     * @param {object} params
     * @param {Record<string, unknown>} params.where
     * @param {Record<string, 'asc'|'desc'>} params.orderBy
     * @param {number} params.skip
     * @param {number} params.take
     */
    async findPage({ where, orderBy, skip, take }) {
      const scoped = active(where);
      const [items, total] = await Promise.all([
        db.customer.findMany({ where: scoped, select: customerListSelect, orderBy, skip, take }),
        db.customer.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /** Minimal id/name projection for dropdowns. */
    findActiveOptions() {
      return db.customer.findMany({
        where: active(),
        select: { id: true, name: true, state: true, state_code: true },
        orderBy: { name: 'asc' },
      });
    },

    /** @param {number} id */
    findById(id) {
      return db.customer.findFirst({ where: active({ id }), select: customerDetailSelect });
    },

    /** @param {number} id */
    async existsById(id) {
      const found = await db.customer.findFirst({ where: active({ id }), select: { id: true } });
      return found !== null;
    },

    /**
     * Duplicate guard on name (case-insensitive via MySQL collation).
     * @param {{ name: string, excludeId?: number }} params
     */
    findConflicting({ name, excludeId }) {
      if (!name) return Promise.resolve(null);
      return db.customer.findFirst({
        where: active({ name, ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}) }),
        select: { id: true, name: true },
      });
    },

    /** @param {object} data */
    create(data) {
      return db.customer.create({ data, select: customerDetailSelect });
    },

    /** @param {number} id @param {object} data */
    update(id, data) {
      return db.customer.update({ where: { id }, data, select: customerDetailSelect });
    },

    /** @param {number} id @param {number|null} [actorId] */
    softDelete(id, actorId = null) {
      return db.customer.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    /**
     * Counts live enquiries on a customer — the delete guard.
     * @param {number} id
     */
    countEnquiries(id) {
      return db.enquiry.count({ where: { customer_id: id, deleted_at: null } });
    },

    /** @param {number} userId */
    async userExists(userId) {
      const user = await db.user.findFirst({ where: { id: userId, deleted_at: null }, select: { id: true } });
      return user !== null;
    },
  };
}

const customerRepository = createCustomerRepository(prisma);

module.exports = { customerRepository, createCustomerRepository };
