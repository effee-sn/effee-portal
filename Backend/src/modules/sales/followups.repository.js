const prisma = require('../../lib/prisma');

/**
 * Sales → Follow-ups data access: the follow-ups (an activity's next date)
 * across enquiries, for the follow-ups page.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createFollowupsRepository(db) {
  const select = Object.freeze({
    id: true, enquiry_id: true, type: true, subject: true, outcome: true, next_action: true,
    activity_at: true, follow_up_at: true, follow_up_timed: true, next_medium: true, temperature: true,
    follow_up_done_at: true, follow_up_done_by: true, follow_up_done_reason: true, follow_up_done_note: true,
    follow_up_done_activity_id: true, created_by: true,
    enquiry: {
      select: {
        id: true, ref_no: true, title: true, stage: true, owner_id: true, handler_id: true,
        customer: { select: { name: true } },
      },
    },
  });

  return {
    /** One page of follow-ups, and how many match. */
    async findPage({ where, orderBy, skip, take }) {
      const [items, total] = await Promise.all([
        db.enquiryActivity.findMany({ where, select, orderBy, skip, take }),
        db.enquiryActivity.count({ where }),
      ]);
      return { items, total };
    },

    count(where) {
      return db.enquiryActivity.count({ where });
    },

    /** Marks these follow-ups done by hand — only the ones still open. Returns how many. */
    async markDone(ids, actorId, note) {
      const r = await db.enquiryActivity.updateMany({
        where: { id: { in: ids }, deleted_at: null, follow_up_at: { not: null }, follow_up_ended: false, follow_up_done_at: null },
        data: { follow_up_done_at: new Date(), follow_up_done_by: actorId, follow_up_done_reason: 'MANUAL', follow_up_done_note: note || null },
      });
      return r.count;
    },

    /** What the entries that did these follow-ups said (subject, outcome, when). @param {number[]} ids */
    async doneBy(ids) {
      if (!ids.length) return new Map();
      const rows = await db.enquiryActivity.findMany({
        where: { id: { in: ids } }, select: { id: true, subject: true, outcome: true, type: true, activity_at: true },
      });
      return new Map(rows.map((r) => [r.id, r]));
    },

    /** id → name (deleted users included). @param {number[]} ids */
    async userNames(ids) {
      const want = [...new Set(ids.filter(Boolean))];
      if (!want.length) return new Map();
      const rows = await db.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true } });
      return new Map(rows.map((u) => [u.id, u.name]));
    },
  };
}

const followupsRepository = createFollowupsRepository(prisma);

module.exports = { followupsRepository, createFollowupsRepository };
