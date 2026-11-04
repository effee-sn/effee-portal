const prisma = require('../../lib/prisma');

/**
 * Department data-access layer. The only file in the module touching Prisma.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createDepartmentRepository(db) {
  const departmentSelect = Object.freeze({
    id: true,
    name: true,
    description: true,
    head_user_id: true,
    head: { select: { id: true, name: true } },
    created_at: true,
    updated_at: true,
    // A live count of members, useful in the list and as a delete guard.
    _count: { select: { users: { where: { deleted_at: null } } } },
  });

  /** @param {Record<string, unknown>} [where] */
  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    departmentSelect,
    active,

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
        db.department.findMany({ where: scoped, select: departmentSelect, orderBy, skip, take }),
        db.department.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /** Minimal id/name projection for dropdowns. */
    findActiveOptions() {
      return db.department.findMany({
        where: active(),
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    },

    /** @param {number} id */
    findById(id) {
      return db.department.findFirst({ where: active({ id }), select: departmentSelect });
    },

    /** @param {number} id */
    async existsById(id) {
      const found = await db.department.findFirst({ where: active({ id }), select: { id: true } });
      return found !== null;
    },

    /**
     * @param {object} params
     * @param {string} params.name
     * @param {number} [params.excludeId]
     * @returns {Promise<{ id: number, name: string }|null>}
     */
    findConflicting({ name, excludeId }) {
      if (!name) return Promise.resolve(null);

      return db.department.findFirst({
        where: { name, ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}) },
        select: { id: true, name: true },
      });
    },

    /** @param {object} data */
    create(data) {
      return db.department.create({ data, select: departmentSelect });
    },

    /** @param {number} id @param {object} data */
    update(id, data) {
      return db.department.update({ where: { id }, data, select: departmentSelect });
    },

    /**
     * Soft-deletes a department.
     * @param {number} id @param {number|null} [actorId]
     */
    softDelete(id, actorId = null) {
      return db.department.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    /**
     * Counts live users assigned to a department — the delete guard.
     * @param {number} id
     */
    countMembers(id) {
      return db.user.count({ where: { department_id: id, deleted_at: null } });
    },

    /**
     * @param {number} userId
     * @returns {Promise<boolean>}
     */
    async userExists(userId) {
      const user = await db.user.findFirst({ where: { id: userId, deleted_at: null }, select: { id: true } });
      return user !== null;
    },
  };
}

const departmentRepository = createDepartmentRepository(prisma);

module.exports = { departmentRepository, createDepartmentRepository };
