const prisma = require('../../lib/prisma');
const { notificationService } = require('../notification/notification.service');
const { logger } = require('../../core');

/**
 * Follow-up due reminders.
 *
 * Sweeps enquiry activities whose follow-up date has arrived and notifies the
 * assigned owner once. Each row is *claimed* with a conditional update
 * (`reminded_at IS NULL`) before notifying, so even under a PM2 cluster only
 * one worker sends a given reminder — the same idempotency the notifications
 * table relies on elsewhere.
 */

const BATCH = 200;

/**
 * @returns {Promise<{ checked: number, sent: number }>}
 */
async function runDueFollowupReminders() {
  const now = new Date();
  const due = await prisma.enquiryActivity.findMany({
    where: {
      deleted_at: null,
      follow_up_ended: false,
      reminded_at: null,
      follow_up_at: { not: null, lte: now },
      enquiry: { deleted_at: null, stage: { notIn: ['WON', 'LOST'] } },
    },
    select: {
      id: true,
      subject: true,
      next_medium: true,
      enquiry: { select: { id: true, ref_no: true, title: true, owner_id: true } },
    },
    orderBy: { follow_up_at: 'asc' },
    take: BATCH,
  });

  let sent = 0;
  for (const a of due) {
    // Claim the row; only one worker's update matches while reminded_at is null.
    const claim = await prisma.enquiryActivity.updateMany({
      where: { id: a.id, reminded_at: null },
      data: { reminded_at: new Date() },
    });
    if (claim.count !== 1) continue;

    await notificationService.notify({
      userIds: [a.enquiry.owner_id],
      type: notificationService.Type.FOLLOWUP_DUE,
      title: `Follow-up due: ${a.enquiry.ref_no}`,
      body: `${a.subject}${a.next_medium ? ` · ${a.next_medium}` : ''} — ${a.enquiry.title}`,
      entityType: 'Enquiry',
      entityId: String(a.enquiry.id),
      link: `/dashboard/sales/enquiries/${a.enquiry.id}`,
      actorId: null,
    });
    sent += 1;
  }

  return { checked: due.length, sent };
}

module.exports = { runDueFollowupReminders };
