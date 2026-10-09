const prisma = require('../../lib/prisma');
const { STAGE_AGING_DAYS } = require('./followup.service');

/**
 * Sales dashboard data-access layer.
 *
 * Every query takes the same filter — a period plus optional owner (field
 * initiator) and enquiry type — and returns raw rows or aggregates; the
 * arithmetic (rates, averages, funnel, time-in-stage) lives in the service.
 *
 * The "period" means different things per block, chosen so each number answers
 * a sensible question:
 *   - won / lost / lost analysis — closed *within* the period;
 *   - funnel                     — enquiries *raised* within the period;
 *   - time in stage              — stage exits that happened within the period;
 *   - open pipeline, watch lists — the position *right now* (period ignored).
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createAnalyticsRepository(db) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CLOSED = ['WON', 'LOST'];

  /**
   * @typedef {{ from: Date, to: Date, ownerId?: number, type?: string }} Filter
   * `to` is exclusive (the day after the last included day).
   */

  /** @param {Filter} f */
  const base = (f) => ({
    deleted_at: null,
    ...(f.ownerId ? { owner_id: f.ownerId } : {}),
    ...(f.type ? { enquiry_type: f.type } : {}),
  });

  /** @param {Filter} f */
  const open = (f) => ({ ...base(f), stage: { notIn: CLOSED } });

  const stalledClause = (now) => ({
    OR: Object.entries(STAGE_AGING_DAYS).map(([stage, days]) => ({
      stage, stage_since: { lte: new Date(now - days * DAY_MS) },
    })),
  });

  const person = { select: { id: true, name: true } };

  return {
    /** @param {Filter} f */
    openByOwner(f) {
      return db.enquiry.groupBy({
        by: ['owner_id'], where: open(f), _count: { _all: true }, _sum: { expected_value: true },
      });
    },

    /** @param {Filter} f */
    won(f) {
      return db.enquiry.findMany({
        where: { ...base(f), stage: 'WON', won_at: { gte: f.from, lt: f.to } },
        select: { owner_id: true, order_value: true, created_at: true, won_at: true },
      });
    },

    /** @param {Filter} f */
    lost(f) {
      return db.enquiry.findMany({
        where: { ...base(f), stage: 'LOST', lost_at: { gte: f.from, lt: f.to } },
        select: {
          owner_id: true, lost_reason: true, lost_to: true,
          // The stage it was lost from = the LOST event's from_stage.
          stageEvents: {
            where: { to_stage: 'LOST' }, orderBy: { created_at: 'desc' }, take: 1,
            select: { from_stage: true },
          },
        },
      });
    },

    /** Enquiries raised in the period, with their stage trail (for the funnel). @param {Filter} f */
    raised(f) {
      return db.enquiry.findMany({
        where: { ...base(f), created_at: { gte: f.from, lt: f.to } },
        select: {
          owner_id: true, stage: true,
          stageEvents: { select: { to_stage: true } },
        },
      });
    },

    /**
     * Enquiries that left a stage during the period, with their full trail, so
     * each exit can be paired with the entry before it.
     * @param {Filter} f
     */
    withStageExits(f) {
      return db.enquiry.findMany({
        where: { ...base(f), stageEvents: { some: { created_at: { gte: f.from, lt: f.to } } } },
        select: {
          created_at: true,
          stageEvents: { orderBy: [{ created_at: 'asc' }, { id: 'asc' }], select: { to_stage: true, created_at: true } },
        },
      });
    },

    /** Won / lost closed since `since` (for the monthly trend). @param {Filter} f @param {Date} since */
    closedSince(f, since) {
      return db.enquiry.findMany({
        where: {
          ...base(f),
          OR: [
            { stage: 'WON', won_at: { gte: since, lt: f.to } },
            { stage: 'LOST', lost_at: { gte: since, lt: f.to } },
          ],
        },
        select: { stage: true, won_at: true, lost_at: true, order_value: true },
      });
    },

    /** Open enquiries stuck past their stage threshold, longest-waiting first. @param {Filter} f */
    async stalled(f) {
      const where = { AND: [open(f), stalledClause(Date.now())] };
      const [total, items] = await Promise.all([
        db.enquiry.count({ where }),
        db.enquiry.findMany({
          where, orderBy: { stage_since: 'asc' }, take: 15,
          select: {
            id: true, ref_no: true, title: true, stage: true, stage_since: true,
            customer: { select: { name: true } }, owner: person, handler: person,
          },
        }),
      ]);
      return { total, items };
    },

    /** Open enquiries currently marked Hot, biggest first. @param {Filter} f */
    async hot(f) {
      const where = { ...open(f), current_temperature: 'HOT' };
      const [total, items] = await Promise.all([
        db.enquiry.count({ where }),
        db.enquiry.findMany({
          where, orderBy: [{ expected_value: 'desc' }, { stage_since: 'asc' }], take: 15,
          select: {
            id: true, ref_no: true, title: true, stage: true, expected_value: true, expected_close: true,
            customer: { select: { name: true } }, owner: person,
          },
        }),
      ]);
      return { total, items };
    },

    /**
     * Follow-ups whose date has passed, on open enquiries. Reviews count only
     * while the enquiry is still at Review (a later stage makes the date stale).
     * @param {Filter} f
     */
    async overdueFollowups(f) {
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
      const where = {
        deleted_at: null,
        follow_up_ended: false,
        follow_up_at: { not: null, lt: startOfToday },
        enquiry: open(f),
        OR: [{ is_review: false }, { is_review: true, enquiry: { stage: 'REVIEW' } }],
      };
      const [total, items] = await Promise.all([
        db.enquiryActivity.count({ where }),
        db.enquiryActivity.findMany({
          where, orderBy: { follow_up_at: 'asc' }, take: 15,
          select: {
            id: true, subject: true, follow_up_at: true, is_review: true, next_medium: true,
            enquiry: {
              select: { id: true, ref_no: true, title: true, owner: person, handler: person },
            },
          },
        }),
      ]);
      return { total, items };
    },

    /** Everyone who has ever owned an enquiry — the owner filter's options. */
    async owners() {
      const rows = await db.enquiry.groupBy({ by: ['owner_id'], where: { deleted_at: null } });
      if (!rows.length) return [];
      return db.user.findMany({
        where: { id: { in: rows.map((r) => r.owner_id) } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    },

    /** @param {number[]} ids */
    usersByIds(ids) {
      if (!ids.length) return Promise.resolve([]);
      return db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    },
  };
}

const analyticsRepository = createAnalyticsRepository(prisma);

module.exports = { analyticsRepository, createAnalyticsRepository };
