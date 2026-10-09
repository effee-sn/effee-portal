const { dashboardRepository } = require('./dashboard.repository');
const { NotFoundError } = require('../../core');

/**
 * Dashboard business logic.
 *
 * Assembles a payload shaped by what the caller is permitted to see. The
 * permission check happens here rather than in the controller because "which
 * statistics may this user see" is a business rule, and because the alternative
 * — returning everything and hiding it client-side — is not access control at
 * all. A block the caller can't see is never queried.
 *
 * Blocks:
 *   - `myWork`   — everyone: what is waiting on *this* user (their enquiries,
 *                  follow-ups due, tickets with them, unread notifications).
 *   - `sales`    — SALES_VIEW: pipeline by stage, won/lost this month, win rate.
 *   - `projects` — PROJECT_VIEW: projects by status.
 *   - `orgStats` — USER_VIEW: user and role counts.
 *
 * (The service-ticket snapshot is served by `/service`, which the page calls
 * separately for users with SERVICE_VIEW.)
 *
 * @param {ReturnType<typeof import('./dashboard.repository').createDashboardRepository>} repository
 */
function createDashboardService(repository) {
  return {
    /**
     * @param {{ id: number, department_id?: number|null, role_id?: number|null, is_system: boolean, permissions: string[] }} actor
     * @returns {Promise<object>}
     * @throws {NotFoundError}
     */
    async getOverview(actor) {
      const user = await repository.findUserSummary(actor.id);
      if (!user) throw new NotFoundError('User');

      const can = (code) => actor.is_system || actor.permissions.includes(code);

      const [myWork, sales, projects, org] = await Promise.all([
        repository.myWork(actor),
        can('SALES_VIEW') ? repository.salesSnapshot() : null,
        can('PROJECT_VIEW') ? repository.projectsSnapshot() : null,
        can('USER_VIEW') ? repository.countOrganisation() : null,
      ]);

      /** @type {Record<string, unknown>} */
      const overview = {
        user: { name: user.name, role: user.role.name, is_system: user.role.is_system },
        myWork,
      };
      if (sales) overview.sales = sales;
      if (projects) overview.projects = projects;
      if (org) {
        overview.orgStats = { users: org.activeUsers, total_users: org.users, roles: org.roles };
      }
      return overview;
    },
  };
}

const dashboardService = createDashboardService(dashboardRepository);

module.exports = { dashboardService, createDashboardService };
