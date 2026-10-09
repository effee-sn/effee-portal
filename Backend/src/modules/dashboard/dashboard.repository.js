const prisma = require('../../lib/prisma');
const { STAGE_AGING_DAYS } = require('../sales/followup.service');

/**
 * Dashboard data-access layer.
 *
 * Aggregate counts and short "top N" lists only. Everything here runs on each
 * dashboard load, so each block is a set of `count` / `groupBy` / small
 * `findMany` queries against indexed columns, issued concurrently — never a
 * fetch-everything-and-count.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createDashboardRepository(db) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CLOSED_STAGES = ['WON', 'LOST'];

  /** Enquiries the user currently holds (the handler baton; owner for legacy rows). */
  const heldBy = (userId) => ({
    deleted_at: null,
    stage: { notIn: CLOSED_STAGES },
    OR: [{ handler_id: userId }, { handler_id: null, owner_id: userId }],
  });

  /** "Stuck past its threshold" for each stage, as one OR clause. */
  const stalledClause = (now) => ({
    OR: Object.entries(STAGE_AGING_DAYS).map(([stage, days]) => ({
      stage, stage_since: { lte: new Date(now - days * DAY_MS) },
    })),
  });

  const num = (decimal) => (decimal === null || decimal === undefined ? 0 : Number(decimal));

  return {
    /** @param {number} userId */
    findUserSummary(userId) {
      return db.user.findUnique({
        where: { id: userId },
        select: { name: true, role: { select: { name: true, is_system: true } } },
      });
    },

    /**
     * What is waiting on this user, across modules.
     *
     * @param {{ id: number, department_id?: number|null, role_id?: number|null }} user
     */
    async myWork(user) {
      const now = Date.now();
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday.getTime() + DAY_MS);

      // Follow-ups/reviews due by end of today on enquiries this user holds. A
      // review's next date only matters while the enquiry is still at Review.
      const dueWhere = {
        deleted_at: null,
        follow_up_ended: false,
        follow_up_at: { not: null, lt: endOfToday },
        enquiry: heldBy(user.id),
        OR: [{ is_review: false }, { is_review: true, enquiry: { stage: 'REVIEW' } }],
      };

      const ticketScope = [{ assigned_user_id: user.id }];
      if (user.department_id) ticketScope.push({ assigned_department_id: user.department_id });
      if (user.role_id) ticketScope.push({ assigned_role_id: user.role_id });

      const [
        enquiriesWithMe, stalled, overdue, dueToday, enquiries, followups,
        ticketsWithMe, tasksWithMe, unread, projects,
      ] = await Promise.all([
        db.enquiry.count({ where: heldBy(user.id) }),
        db.enquiry.count({ where: { AND: [heldBy(user.id), stalledClause(now)] } }),
        db.enquiryActivity.count({ where: { ...dueWhere, follow_up_at: { not: null, lt: startOfToday } } }),
        db.enquiryActivity.count({ where: { ...dueWhere, follow_up_at: { gte: startOfToday, lt: endOfToday } } }),
        db.enquiry.findMany({
          where: heldBy(user.id),
          orderBy: { stage_since: 'asc' }, // longest-waiting first
          take: 6,
          select: {
            id: true, ref_no: true, title: true, stage: true, stage_since: true,
            current_temperature: true, customer: { select: { name: true } },
          },
        }),
        db.enquiryActivity.findMany({
          where: dueWhere,
          orderBy: { follow_up_at: 'asc' },
          take: 6,
          select: {
            id: true, subject: true, follow_up_at: true, is_review: true, next_medium: true,
            enquiry: { select: { id: true, ref_no: true, title: true } },
          },
        }),
        db.serviceTicket.count({ where: { deleted_at: null, status: { not: 'CLOSED' }, OR: ticketScope } }),
        db.ticketDepartmentTask.count({ where: { deleted_at: null, status: 'OPEN', assigned_user_id: user.id } }),
        db.notification.count({ where: { user_id: user.id, read_at: null } }),
        db.project.count({ where: { deleted_at: null, owner_id: user.id, status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } } }),
      ]);

      return {
        enquiries_with_me: enquiriesWithMe,
        stalled,
        followups_overdue: overdue,
        followups_today: dueToday,
        tickets_with_me: ticketsWithMe + tasksWithMe,
        unread_notifications: unread,
        active_projects: projects,
        enquiries,
        followups,
      };
    },

    /** Organisation-wide sales picture. */
    async salesSnapshot() {
      const now = Date.now();
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const ninetyDaysAgo = new Date(now - 90 * DAY_MS);
      const open = { deleted_at: null, stage: { notIn: CLOSED_STAGES } };

      const [byStage, wonMonth, lostMonth, won90, lost90, stalled, hot] = await Promise.all([
        db.enquiry.groupBy({ by: ['stage'], where: open, _count: { _all: true }, _sum: { expected_value: true } }),
        db.enquiry.aggregate({
          where: { deleted_at: null, stage: 'WON', won_at: { gte: monthStart } },
          _count: { _all: true }, _sum: { order_value: true },
        }),
        db.enquiry.count({ where: { deleted_at: null, stage: 'LOST', lost_at: { gte: monthStart } } }),
        db.enquiry.count({ where: { deleted_at: null, stage: 'WON', won_at: { gte: ninetyDaysAgo } } }),
        db.enquiry.count({ where: { deleted_at: null, stage: 'LOST', lost_at: { gte: ninetyDaysAgo } } }),
        db.enquiry.count({ where: { AND: [open, stalledClause(now)] } }),
        db.enquiry.count({ where: { ...open, current_temperature: 'HOT' } }),
      ]);

      const pipeline = byStage.map((row) => ({
        stage: row.stage, count: row._count._all, value: num(row._sum.expected_value),
      }));

      return {
        pipeline,
        open_count: pipeline.reduce((n, r) => n + r.count, 0),
        open_value: pipeline.reduce((n, r) => n + r.value, 0),
        won_this_month: { count: wonMonth._count._all, value: num(wonMonth._sum.order_value) },
        lost_this_month: lostMonth,
        win_rate_90d: won90 + lost90 > 0 ? Math.round((won90 / (won90 + lost90)) * 100) : null,
        decided_90d: won90 + lost90,
        stalled,
        hot,
      };
    },

    /** Projects by status. */
    async projectsSnapshot() {
      const rows = await db.project.groupBy({
        by: ['status'], where: { deleted_at: null }, _count: { _all: true },
      });
      return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    },

    /** Organisation-wide user/role counts, for administrators. */
    async countOrganisation() {
      const [users, activeUsers, roles] = await Promise.all([
        db.user.count({ where: { deleted_at: null } }),
        db.user.count({ where: { deleted_at: null, status: 'ACTIVE' } }),
        db.role.count({ where: { deleted_at: null } }),
      ]);
      return { users, activeUsers, roles };
    },
  };
}

const dashboardRepository = createDashboardRepository(prisma);

module.exports = { dashboardRepository, createDashboardRepository };
