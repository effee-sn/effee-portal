const prisma = require('../../lib/prisma');

/**
 * Users data-access layer.
 *
 * This file is the only place in the users module that touches Prisma. That
 * boundary is the point of the pattern: the service reasons about users, not
 * about `findFirst` and `select` clauses, so a change in persistence — adding
 * soft deletes, moving a query to raw SQL, introducing a read replica — is
 * contained here rather than spread across business logic.
 *
 * Rules for this layer:
 *   - No business decisions. "Is this email taken?" is answered here; "what
 *     should happen when it is" belongs in the service.
 *   - No HTTP. Nothing here throws AppError or knows about status codes.
 *   - Returns plain data or null. Absence is not an error at this level.
 *
 * Built as a factory taking its client so the service can be unit tested
 * against a stub without a live database. `usersRepository` is the shared
 * instance the application uses.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createUsersRepository(db) {
  /**
   * Fields returned for a user.
   *
   * An explicit allowlist rather than an exclusion: `password` is absent
   * because it is never listed, so a column added to the schema later cannot
   * silently start appearing in API responses.
   */
  const userSelect = Object.freeze({
    id: true,
    name: true,
    email: true,
    phone: true,
    status: true,
    is_verified: true,
    designation: true,
    created_at: true,
    updated_at: true,
    role: { select: { id: true, name: true, slug: true } },
    department: { select: { id: true, name: true } },
  });

  /**
   * Restricts a query to rows that have not been soft-deleted.
   *
   * Every read in this repository composes this. Applying it here rather than
   * at each call site is the point of the pattern: the service cannot forget
   * it, so a deleted user cannot reappear through a query somebody wrote
   * without thinking about deletion.
   *
   * @param {Record<string, unknown>} [where]
   * @returns {Record<string, unknown>}
   */
  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    userSelect,
    active,

    /**
     * Finds a page of users matching a filter.
     *
     * Runs the page query and the total count concurrently — they are
     * independent, and sequencing them would double the latency of every list
     * request.
     *
     * @param {object} params
     * @param {Record<string, unknown>} params.where Prisma where clause.
     * @param {Record<string, 'asc'|'desc'>} params.orderBy
     * @param {number} params.skip
     * @param {number} params.take
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async findPage({ where, orderBy, skip, take }) {
      const scoped = active(where);

      const [items, total] = await Promise.all([
        db.user.findMany({ where: scoped, select: userSelect, orderBy, skip, take }),
        db.user.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /**
     * @param {number} id
     * @returns {Promise<object|null>} Safe user projection, or null.
     */
    findById(id) {
      return db.user.findFirst({ where: active({ id }), select: userSelect });
    },

    /**
     * Checks existence without transferring the row.
     *
     * @param {number} id
     * @returns {Promise<boolean>}
     */
    async existsById(id) {
      const found = await db.user.findFirst({ where: active({ id }), select: { id: true } });
      return found !== null;
    },

    /**
     * Finds a user whose email or phone matches, optionally ignoring one id.
     *
     * Used for uniqueness checks on create and update; `excludeId` is what lets
     * an update ignore the record being edited.
     *
     * @param {object} params
     * @param {string} [params.email]
     * @param {string} [params.phone]
     * @param {number} [params.excludeId]
     * @returns {Promise<{ id: number, email: string, phone: string|null }|null>}
     */
    findConflicting({ email, phone, excludeId }) {
      /** @type {Array<Record<string, unknown>>} */
      const or = [];
      if (email) or.push({ email });
      if (phone) or.push({ phone });
      if (or.length === 0) return Promise.resolve(null);

      return db.user.findFirst({
        where: {
          OR: or,
          ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true, email: true, phone: true },
      });
    },

    /**
     * @param {object} data Prisma-shaped create input; `password` pre-hashed.
     * @returns {Promise<object>}
     */
    create(data) {
      return db.user.create({ data, select: userSelect });
    },

    /**
     * @param {number} id
     * @param {object} data Prisma-shaped update input.
     * @returns {Promise<object>}
     */
    update(id, data) {
      return db.user.update({ where: { id }, data, select: userSelect });
    },

    /**
     * Soft-deletes a user by stamping `deleted_at`.
     *
     * The row survives, so audit entries and password-reset history keep
     * referring to something real. Every read in this repository filters on
     * `deleted_at: null`, so the user disappears from the application as
     * completely as a hard delete would have made it — but recoverably, and
     * without cascading destruction through foreign keys.
     *
     * @param {number} id
     * @param {number|null} [actorId] Recorded as the last mutator.
     * @returns {Promise<{ id: number }>}
     */
    softDelete(id, actorId = null) {
      return db.user.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    /**
     * Permanently removes a user.
     *
     * Not reachable from the API. Retained for data-retention duties — an
     * erasure request under GDPR or similar cannot be satisfied by a soft
     * delete, since the personal data would still be there.
     *
     * @param {number} id
     * @returns {Promise<object>}
     */
    hardDelete(id) {
      return db.user.delete({ where: { id }, select: { id: true } });
    },

    /**
     * Counts live users holding roles flagged `is_system`.
     *
     * Supports the service's guard against removing the last super
     * administrator, which would leave the installation unadministrable.
     *
     * @returns {Promise<number>}
     */
    countSystemAdmins() {
      return db.user.count({ where: active({ role: { is_system: true } }) });
    },

    /**
     * @param {number} id
     * @returns {Promise<{ id: number, role: { is_system: boolean } }|null>}
     */
    findWithRoleFlags(id) {
      return db.user.findFirst({
        where: active({ id }),
        select: { id: true, role: { select: { is_system: true } } },
      });
    },

    /**
     * @param {number} roleId
     * @returns {Promise<boolean>}
     */
    async roleExists(roleId) {
      const role = await db.role.findFirst({
        where: { id: roleId, deleted_at: null },
        select: { id: true },
      });
      return role !== null;
    },

    /**
     * @param {number} departmentId
     * @returns {Promise<boolean>}
     */
    async departmentExists(departmentId) {
      const dept = await db.department.findFirst({
        where: { id: departmentId, deleted_at: null },
        select: { id: true },
      });
      return dept !== null;
    },
  };
}

/** Shared instance bound to the application's Prisma client. */
const usersRepository = createUsersRepository(prisma);

module.exports = { usersRepository, createUsersRepository };
