const prisma = require('../../lib/prisma');

/**
 * Enquiry activity data-access layer.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createActivityRepository(db) {
  const activitySelect = Object.freeze({
    id: true,
    enquiry_id: true,
    type: true,
    stage: true,
    activity_at: true,
    duration_min: true,
    subject: true,
    minutes: true,
    outcome: true,
    internal_participants: true,
    customer_participants: true,
    next_action: true,
    follow_up_at: true,
    follow_up_timed: true,
    next_medium: true,
    temperature: true,
    follow_up_ended: true,
    needs_negotiation: true,
    is_review: true,
    follow_up_done_at: true,
    follow_up_done_by: true,
    follow_up_done_activity_id: true,
    follow_up_done_reason: true,
    follow_up_done_note: true,
    created_at: true,
    created_by: true,
  });

  // A follow-up still waiting to be acted on.
  const openFollowUp = Object.freeze({ deleted_at: null, follow_up_at: { not: null }, follow_up_ended: false, follow_up_done_at: null });

  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    activitySelect,
    active,

    /**
     * Timeline: newest first. `isReview` filters to review entries (true) or
     * customer interactions (false); omit for all.
     * @param {number} enquiryId
     * @param {boolean} [isReview]
     */
    findByEnquiry(enquiryId, isReview) {
      const where = active({ enquiry_id: enquiryId });
      if (isReview !== undefined) where.is_review = isReview;
      return db.enquiryActivity.findMany({
        where,
        select: activitySelect,
        orderBy: [{ activity_at: 'desc' }, { id: 'desc' }],
      });
    },

    /**
     * The last edit of each of these entries, by a person — from the audit
     * log (the row's own updated_at also moves when reminders are sent).
     * @param {number[]} ids
     * @returns {Promise<Map<number, { actor_id: number|null, at: Date }>>}
     */
    async lastEdits(ids) {
      if (!ids.length) return new Map();
      const rows = await db.auditLog.findMany({
        where: { entity: 'EnquiryActivity', action: 'UPDATE', entity_id: { in: ids.map(String) } },
        select: { entity_id: true, actor_id: true, created_at: true },
        orderBy: { created_at: 'desc' },
      });
      const out = new Map();
      for (const r of rows) if (!out.has(Number(r.entity_id))) out.set(Number(r.entity_id), { actor_id: r.actor_id, at: r.created_at });
      return out;
    },

    /** id → name (deleted users included, so old entries keep their author). @param {number[]} ids */
    async userNames(ids) {
      const want = [...new Set(ids.filter(Boolean))];
      if (!want.length) return new Map();
      const rows = await db.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true } });
      return new Map(rows.map((u) => [u.id, u.name]));
    },

    findById(id) {
      return db.enquiryActivity.findFirst({ where: active({ id }), select: activitySelect });
    },

    create(data) {
      return db.enquiryActivity.create({ data, select: activitySelect });
    },

    update(id, data) {
      return db.enquiryActivity.update({ where: { id }, data, select: activitySelect });
    },

    /**
     * A new entry is the follow-up having happened: the earlier open follow-ups
     * of the same person on the enquiry (reviews and customer interactions
     * apart) are done by it, at its time.
     * @param {{ id: number, enquiry_id: number, created_by: number|null, is_review: boolean, activity_at: Date }} activity
     */
    closeEarlierFollowUps(activity) {
      return db.enquiryActivity.updateMany({
        where: {
          ...openFollowUp,
          enquiry_id: activity.enquiry_id,
          created_by: activity.created_by,
          is_review: activity.is_review,
          id: { not: activity.id },
          OR: [{ activity_at: { lt: activity.activity_at } }, { activity_at: activity.activity_at, id: { lt: activity.id } }],
        },
        data: {
          follow_up_done_at: activity.activity_at, follow_up_done_by: activity.created_by,
          follow_up_done_activity_id: activity.id, follow_up_done_reason: 'FOLLOWED_UP',
        },
      });
    },

    /** The follow-ups an entry had done open again (the entry was deleted). @param {number} activityId */
    reopenFollowUpsDoneBy(activityId) {
      return db.enquiryActivity.updateMany({
        where: { follow_up_done_activity_id: activityId, follow_up_done_reason: 'FOLLOWED_UP' },
        data: { follow_up_done_at: null, follow_up_done_by: null, follow_up_done_activity_id: null, follow_up_done_reason: null },
      });
    },

    /** A follow-up marked done by hand. */
    markFollowUpDone(id, actorId, note) {
      return db.enquiryActivity.update({
        where: { id },
        data: { follow_up_done_at: new Date(), follow_up_done_by: actorId, follow_up_done_reason: 'MANUAL', follow_up_done_note: note || null },
        select: activitySelect,
      });
    },

    /** An enquiry won or lost: its open follow-ups close with it. */
    closeFollowUpsOfEnquiry(enquiryId, at = new Date()) {
      return db.enquiryActivity.updateMany({
        where: { ...openFollowUp, enquiry_id: enquiryId },
        data: { follow_up_done_at: at, follow_up_done_reason: 'CLOSED' },
      });
    },

    softDelete(id, actorId = null) {
      return db.enquiryActivity.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    /**
     * Temperature of the newest activity (by activity_at) that carries one —
     * the value that rolls up to Enquiry.current_temperature.
     * @param {number} enquiryId
     * @returns {Promise<string|null>}
     */
    async latestTemperature(enquiryId) {
      const row = await db.enquiryActivity.findFirst({
        where: active({ enquiry_id: enquiryId, temperature: { not: null } }),
        orderBy: [{ activity_at: 'desc' }, { id: 'desc' }],
        select: { temperature: true },
      });
      return row?.temperature ?? null;
    },

    /** Writes the rolled-up temperature onto the enquiry. */
    setEnquiryTemperature(enquiryId, temperature) {
      return db.enquiry.update({
        where: { id: enquiryId },
        data: { current_temperature: temperature },
        select: { id: true },
      });
    },

    /** @param {number} enquiryId owner + existence check for the parent. */
    findEnquiry(enquiryId) {
      return db.enquiry.findFirst({
        where: active({ id: enquiryId }),
        select: { id: true, owner_id: true, handler_id: true, created_by: true, ref_no: true, title: true, stage: true, enquiry_type: true },
      });
    },
  };
}

const activityRepository = createActivityRepository(prisma);

module.exports = { activityRepository, createActivityRepository };
