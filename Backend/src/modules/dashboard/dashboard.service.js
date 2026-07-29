const { dashboardRepository } = require('./dashboard.repository');
const { NotFoundError } = require('../../core');

/**
 * Dashboard business logic.
 *
 * Assembles a payload shaped by what the caller is permitted to see. The
 * permission check happens here rather than in the controller because "which
 * statistics may this user see" is a business rule, and because the alternative
 * — returning everything and hiding it client-side — is not access control at
 * all.
 *
 * @param {ReturnType<typeof import('./dashboard.repository').createDashboardRepository>} repository
 */
function createDashboardService(repository) {
  return {
    /**
     * Builds the dashboard payload for a caller.
     *
     * @param {{ id: number, is_system: boolean, permissions: string[] }} actor
     *   The authenticated user, already resolved by `authenticate` — so this
     *   needs no further query to determine what they may see.
     * @returns {Promise<object>}
     * @throws {NotFoundError}
     */
    async getOverview(actor) {
      const user = await repository.findUserSummary(actor.id);
      if (!user) throw new NotFoundError('User');

      const can = (code) => actor.is_system || actor.permissions.includes(code);

      /** @type {Record<string, unknown>} */
      const overview = {
        user: {
          name:      user.name,
          role:      user.role.name,
          is_system: user.role.is_system,
        },
      };

      // Organisation statistics are only assembled when the caller may see
      // them — the query is skipped entirely otherwise, so an unprivileged
      // dashboard costs one lookup rather than four.
      if (can('USER_VIEW')) {
        const counts = await repository.countOrganisation();
        overview.orgStats = {
          users:        counts.activeUsers,
          total_users:  counts.users,
          roles:        counts.roles,
        };
      }

      return overview;
    },
  };
}

const dashboardService = createDashboardService(dashboardRepository);

module.exports = { dashboardService, createDashboardService };
