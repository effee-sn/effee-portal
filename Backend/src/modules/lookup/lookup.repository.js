const prisma = require('../../lib/prisma');

/**
 * Lookup data-access layer.
 *
 * Serves the minimal id/label projections that populate select inputs. Kept
 * deliberately narrow: these endpoints are readable by any authenticated user,
 * so they must never return more than a dropdown needs.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createLookupRepository(db) {
  return {
    /** @returns {Promise<Array<{ id: number, name: string, slug: string }>>} */
    findRoles() {
      return db.role.findMany({
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
      });
    },

    /**
     * Active users only — an inactive account should not be selectable as an
     * assignee anywhere in the UI.
     *
     * @returns {Promise<Array<{ id: number, name: string, email: string }>>}
     */
    findActiveUsers() {
      return db.user.findMany({
        // Exclude soft-deleted users so they never appear in assignee/head
        // dropdowns.
        where: { status: 'ACTIVE', deleted_at: null },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      });
    },

    /** @returns {Promise<object[]>} */
    findPermissions() {
      return db.permission.findMany({
        select: {
          id: true,
          code: true,
          action: true,
          module: { select: { name: true, slug: true } },
        },
        orderBy: [{ module_id: 'asc' }, { action: 'asc' }],
      });
    },

    /** @returns {Promise<Array<{ id: number, name: string, slug: string }>>} */
    findModules() {
      return db.module.findMany({
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
      });
    },

    /**
     * Active departments for select inputs.
     * @returns {Promise<Array<{ id: number, name: string }>>}
     */
    findDepartments() {
      return db.department.findMany({
        where: { deleted_at: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    },
  };
}

const lookupRepository = createLookupRepository(prisma);

module.exports = { lookupRepository, createLookupRepository };
