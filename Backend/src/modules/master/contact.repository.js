const prisma = require('../../lib/prisma');

/**
 * Contact data-access layer.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createContactRepository(db) {
  const contactSelect = Object.freeze({
    id: true,
    customer_id: true,
    name: true,
    designation: true,
    email: true,
    phone: true,
    is_primary: true,
    notes: true,
    created_at: true,
    updated_at: true,
  });

  /** @param {Record<string, unknown>} [where] */
  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    contactSelect,
    active,

    /** @param {number} id */
    findById(id) {
      return db.contact.findFirst({ where: active({ id }), select: contactSelect });
    },

    /** @param {number} customerId */
    findByCustomer(customerId) {
      return db.contact.findMany({
        where: active({ customer_id: customerId }),
        select: contactSelect,
        orderBy: [{ is_primary: 'desc' }, { name: 'asc' }],
      });
    },

    /** @param {object} data */
    create(data) {
      return db.contact.create({ data, select: contactSelect });
    },

    /** @param {number} id @param {object} data */
    update(id, data) {
      return db.contact.update({ where: { id }, data, select: contactSelect });
    },

    /** @param {number} id @param {number|null} [actorId] */
    softDelete(id, actorId = null) {
      return db.contact.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    /**
     * Clears the primary flag on a customer's other contacts, so at most one
     * contact is primary. Optionally excludes the one being set primary.
     *
     * @param {number} customerId @param {number} [exceptId]
     */
    clearPrimary(customerId, exceptId) {
      return db.contact.updateMany({
        where: active({
          customer_id: customerId,
          is_primary: true,
          ...(exceptId !== undefined ? { NOT: { id: exceptId } } : {}),
        }),
        data: { is_primary: false },
      });
    },
  };
}

const contactRepository = createContactRepository(prisma);

module.exports = { contactRepository, createContactRepository };
