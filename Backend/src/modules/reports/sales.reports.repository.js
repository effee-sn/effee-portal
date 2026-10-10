const prisma = require('../../lib/prisma');

/**
 * Data access for the Sales MIS reports. Every query takes the same filter
 * (period + optional owner / type / application / customer / stage) and
 * returns raw rows; shaping, currency conversion and totals happen in
 * `sales.reports.js`.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createSalesReportsRepository(db) {
  /**
   * @typedef {{ from: Date, to: Date, ownerId?: number, type?: string, applicationId?: number,
   *   customerId?: number, stage?: string }} Filter  `to` is exclusive.
   */

  /** @param {Filter} f */
  const base = (f) => ({
    deleted_at: null,
    ...(f.ownerId ? { owner_id: f.ownerId } : {}),
    ...(f.type ? { enquiry_type: f.type } : {}),
    ...(f.applicationId ? { application_id: f.applicationId } : {}),
    ...(f.customerId ? { customer_id: f.customerId } : {}),
  });

  const inPeriod = (f) => ({ gte: f.from, lt: f.to });
  const person = { select: { id: true, name: true } };

  return {
    /** @param {Filter} f */
    raisedDates(f) {
      return db.enquiry.findMany({ where: { ...base(f), created_at: inPeriod(f) }, select: { created_at: true } });
    },

    /** Won orders closed in the period. @param {Filter} f */
    won(f) {
      return db.enquiry.findMany({
        where: { ...base(f), stage: 'WON', won_at: inPeriod(f) },
        select: {
          id: true, ref_no: true, title: true, won_at: true, created_at: true, order_no: true, order_date: true,
          order_value: true, order_fx_rate: true, currency_code: true, owner_id: true, customer_id: true, application_id: true,
          customer: { select: { name: true } }, application: { select: { name: true } }, owner: person,
        },
        orderBy: { won_at: 'asc' },
      });
    },

    /** Enquiries lost in the period, with the stage they were lost from. @param {Filter} f */
    lost(f) {
      return db.enquiry.findMany({
        where: { ...base(f), stage: 'LOST', lost_at: inPeriod(f) },
        select: {
          id: true, ref_no: true, title: true, lost_at: true, lost_reason: true, lost_to: true, owner_id: true,
          customer_id: true, application_id: true,
          expected_value: true, currency_code: true,
          customer: { select: { name: true } }, application: { select: { name: true } }, owner: person,
          stageEvents: { where: { to_stage: 'LOST' }, orderBy: { created_at: 'desc' }, take: 1, select: { from_stage: true } },
        },
        orderBy: { lost_at: 'asc' },
      });
    },

    /** Priced offers sent in the period. @param {Filter} f */
    offersSent(f) {
      return db.enquiryAttachment.findMany({
        where: {
          kind: 'OFFER', deleted_at: null, offer_value: { not: null }, sent_at: inPeriod(f),
          enquiry: base(f),
        },
        select: {
          enquiry_id: true, sent_at: true, offer_value: true, offer_fx_rate: true,
          enquiry: { select: { currency_code: true, owner_id: true, customer_id: true, application_id: true } },
        },
        orderBy: [{ sent_at: 'asc' }, { id: 'asc' }],
      });
    },

    /** Enquiries raised in the period (optionally at one stage), full register detail. @param {Filter} f */
    register(f) {
      return db.enquiry.findMany({
        where: { ...base(f), created_at: inPeriod(f), ...(f.stage ? { stage: f.stage } : {}) },
        select: {
          id: true, ref_no: true, title: true, created_at: true, enquiry_type: true, stage: true, stage_since: true,
          expected_value: true, expected_close: true, currency_code: true, current_temperature: true,
          order_value: true, order_fx_rate: true,
          customer: { select: { name: true } }, application: { select: { name: true } },
          owner: person, handler: person,
        },
        orderBy: { created_at: 'asc' },
      });
    },

    /** Offer revisions uploaded in the period. @param {Filter} f */
    offers(f) {
      return db.enquiryAttachment.findMany({
        where: { kind: 'OFFER', deleted_at: null, created_at: inPeriod(f), enquiry: base(f) },
        select: {
          id: true, version: true, file_name: true, created_at: true, stage: true,
          offer_value: true, offer_fx_rate: true, sent_at: true, sent_by: true,
          enquiry: {
            select: {
              id: true, ref_no: true, title: true, stage: true, currency_code: true,
              customer: { select: { name: true } }, owner: person,
            },
          },
        },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
    },

    /**
     * Last priced offer sent on each enquiry (any date) — for the discount from
     * final offer to order.
     * @param {number[]} enquiryIds
     */
    async finalOffers(enquiryIds) {
      if (!enquiryIds.length) return [];
      const rows = await db.enquiryAttachment.findMany({
        where: { kind: 'OFFER', deleted_at: null, offer_value: { not: null }, sent_at: { not: null }, enquiry_id: { in: enquiryIds } },
        select: { enquiry_id: true, offer_value: true },
        orderBy: [{ sent_at: 'desc' }, { id: 'desc' }],
      });
      const seen = new Set();
      return rows.filter((r) => (seen.has(r.enquiry_id) ? false : seen.add(r.enquiry_id)));
    },

    /** Open enquiries right now, per owner and currency. @param {Filter} f */
    openByOwner(f) {
      return db.enquiry.groupBy({
        by: ['owner_id', 'currency_code'],
        where: { ...base(f), stage: { notIn: ['WON', 'LOST'] } },
        _count: { _all: true },
        _sum: { expected_value: true },
      });
    },

    /** Raised in the period, per owner. @param {Filter} f */
    raisedByOwner(f) {
      return db.enquiry.groupBy({
        by: ['owner_id'], where: { ...base(f), created_at: inPeriod(f) }, _count: { _all: true },
      });
    },

    /**
     * Customer interactions (not internal reviews) logged in the period, per
     * person who logged them, on enquiries matching the filter.
     * @param {Filter} f
     */
    activitiesByLogger(f) {
      return db.enquiryActivity.groupBy({
        by: ['created_by'],
        where: { deleted_at: null, is_review: false, activity_at: inPeriod(f), enquiry: base(f) },
        _count: { _all: true },
      });
    },

    /**
     * Enquiries raised in the period, grouped by a dimension.
     * @param {Filter} f @param {'customer_id'|'application_id'} dim
     */
    raisedBy(f, dim) {
      return db.enquiry.groupBy({
        by: [dim], where: { ...base(f), created_at: inPeriod(f) }, _count: { _all: true }, _max: { created_at: true },
      });
    },

    /**
     * Open enquiries right now, grouped by a dimension and currency.
     * @param {Filter} f @param {'customer_id'|'application_id'} dim
     */
    openBy(f, dim) {
      return db.enquiry.groupBy({
        by: [dim, 'currency_code'],
        where: { ...base(f), stage: { notIn: ['WON', 'LOST'] } },
        _count: { _all: true },
        _sum: { expected_value: true },
      });
    },

    /** @param {number[]} ids */
    async customerNames(ids) {
      const unique = [...new Set(ids.filter(Boolean))];
      if (!unique.length) return {};
      const rows = await db.customer.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
      return Object.fromEntries(rows.map((r) => [r.id, r.name]));
    },

    /** @param {number[]} ids */
    async applicationNames(ids) {
      const unique = [...new Set(ids.filter(Boolean))];
      if (!unique.length) return {};
      const rows = await db.salesApplication.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
      return Object.fromEntries(rows.map((r) => [r.id, r.name]));
    },

    /**
     * Activities logged in the period, per person, kind and review flag, on
     * enquiries matching the filter.
     * @param {Filter} f
     */
    activityCounts(f) {
      return db.enquiryActivity.groupBy({
        by: ['created_by', 'type', 'is_review'],
        where: { deleted_at: null, activity_at: inPeriod(f), enquiry: base(f) },
        _count: { _all: true },
      });
    },

    /** Follow-ups scheduled in the period (a next date was set), per person. @param {Filter} f */
    followupsScheduled(f) {
      return db.enquiryActivity.groupBy({
        by: ['created_by'],
        where: { deleted_at: null, is_review: false, follow_up_at: { not: null }, activity_at: inPeriod(f), enquiry: base(f) },
        _count: { _all: true },
      });
    },

    /**
     * Follow-ups past their date right now, on open enquiries — with who holds
     * the enquiry (the person who must act). A review date only counts while
     * the enquiry is still at Review.
     * @param {Filter} f
     */
    overdueFollowups(f) {
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
      return db.enquiryActivity.findMany({
        where: {
          deleted_at: null, follow_up_ended: false, follow_up_at: { not: null, lt: startOfToday },
          enquiry: { ...base(f), stage: { notIn: ['WON', 'LOST'] } },
          OR: [{ is_review: false }, { is_review: true, enquiry: { stage: 'REVIEW' } }],
        },
        select: { enquiry: { select: { handler_id: true, owner_id: true } } },
      });
    },

    /** Open enquiries right now (for aging), optionally at one stage. @param {Filter} f */
    openEnquiries(f) {
      return db.enquiry.findMany({
        where: { ...base(f), stage: f.stage ? f.stage : { notIn: ['WON', 'LOST'] } },
        select: {
          id: true, ref_no: true, title: true, stage: true, stage_since: true, created_at: true,
          expected_value: true, currency_code: true, current_temperature: true,
          customer: { select: { name: true } }, owner: person, handler: person,
        },
      });
    },

    /** Latest logged activity per enquiry. @param {number[]} enquiryIds */
    async lastActivity(enquiryIds) {
      if (!enquiryIds.length) return {};
      const rows = await db.enquiryActivity.groupBy({
        by: ['enquiry_id'], where: { deleted_at: null, enquiry_id: { in: enquiryIds } }, _max: { activity_at: true },
      });
      return Object.fromEntries(rows.map((r) => [r.enquiry_id, r._max.activity_at]));
    },

    /** @param {number[]} ids */
    async userNames(ids) {
      const unique = [...new Set(ids.filter(Boolean))];
      if (!unique.length) return {};
      const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
      return Object.fromEntries(users.map((u) => [u.id, u.name]));
    },
  };
}

const salesReportsRepository = createSalesReportsRepository(prisma);

module.exports = { salesReportsRepository, createSalesReportsRepository };
