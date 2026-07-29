const prisma = require('../../lib/prisma');

/**
 * Dashboard data-access layer.
 *
 * Aggregate counts only. Every method here runs on each dashboard load, so each
 * is a `count` against an indexed column rather than a fetch-and-length —
 * pulling rows back to count them is the classic way a dashboard becomes the
 * slowest page in an application.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createDashboardRepository(db) {
  return {
    /**
     * @param {number} userId
     * @returns {Promise<{ name: string, role: { name: string, is_system: boolean } }|null>}
     */
    findUserSummary(userId) {
      return db.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          role: { select: { name: true, is_system: true } },
        },
      });
    },

    /**
     * Organisation-wide counts, issued concurrently.
     *
     * @returns {Promise<{ users: number, activeUsers: number, roles: number }>}
     */
    async countOrganisation() {
      const [users, activeUsers, roles] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { status: 'ACTIVE' } }),
        db.role.count(),
      ]);
      return { users, activeUsers, roles };
    },
  };
}

const dashboardRepository = createDashboardRepository(prisma);

module.exports = { dashboardRepository, createDashboardRepository };
