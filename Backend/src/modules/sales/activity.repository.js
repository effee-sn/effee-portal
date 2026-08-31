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
    activity_at: true,
    duration_min: true,
    subject: true,
    minutes: true,
    outcome: true,
    internal_participants: true,
    customer_participants: true,
    next_action: true,
    follow_up_at: true,
    next_medium: true,
    temperature: true,
    follow_up_ended: true,
    is_review: true,
    created_at: true,
    created_by: true,
  });

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

    findById(id) {
      return db.enquiryActivity.findFirst({ where: active({ id }), select: activitySelect });
    },

    create(data) {
      return db.enquiryActivity.create({ data, select: activitySelect });
    },

    update(id, data) {
      return db.enquiryActivity.update({ where: { id }, data, select: activitySelect });
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
        select: { id: true, owner_id: true, ref_no: true, title: true, stage: true, enquiry_type: true },
      });
    },
  };
}

const activityRepository = createActivityRepository(prisma);

module.exports = { activityRepository, createActivityRepository };
