const prisma = require('../../lib/prisma');
const { notificationService } = require('../notification/notification.service');
const { stageLabel } = require('./enquiry.service');
const config = require('../../config/env');
const { formatTime } = require('../../lib/timezone');
const { enquiryRows, NEXT_STEP } = require('./emailDetails');

const MEDIUM = Object.freeze({ CALL: 'Call', MEETING: 'Meeting', TEAMS: 'Teams', SITE_VISIT: 'Site visit', EMAIL: 'Email' });

/**
 * Sales reminders, run by the periodic sweep (see followup.scheduler):
 *
 *   - **Follow-up / review coming up** — a timed follow-up (a call at 3 PM,
 *     a review at 5:30) is reminded LEAD minutes before (15 by default); a
 *     date-only follow-up at its morning time (9:00 local) that day.
 *   - **Stage aging** — an enquiry has sat in one stage past its threshold.
 *
 * Both go to the enquiry's *current handler* (the person who must act now),
 * falling back to the owner. Each reminder is *claimed* with a conditional
 * update before notifying, so even under a PM2 cluster only one worker sends a
 * given reminder. Notifications also go out by email via `notify()`.
 */

const BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days an enquiry may sit in a stage before it counts as stalled.
 * Keep in sync with STAGE_AGING_DAYS in Frontend/lib/salesOptions.js, which
 * drives the "aging" badge in the UI. WON / LOST never age.
 */
const STAGE_AGING_DAYS = Object.freeze({
  NEW: 3, CONTACTED: 3, REVIEW: 4, CONCEPT: 5, COSTING: 5, COSTING_REVIEW: 4,
  OFFER_RELEASED: 7, FOLLOW_UP: 7, NEGOTIATION: 10, NEGOTIATION_FOLLOW_UP: 7,
});

/**
 * @returns {Promise<{ checked: number, sent: number }>}
 */
async function runDueFollowupReminders(now = new Date()) {
  const lead = new Date(now.getTime() + config.FOLLOWUP_REMINDER.LEAD_MINUTES * 60 * 1000);
  const due = await prisma.enquiryActivity.findMany({
    where: {
      deleted_at: null,
      follow_up_ended: false,
      reminded_at: null,
      follow_up_at: { not: null },
      enquiry: { deleted_at: null, stage: { notIn: ['WON', 'LOST'] } },
      AND: [
        // A review's next date only matters while the enquiry is still at Review;
        // once it has moved on, the old date is stale and must not nag anyone.
        { OR: [{ is_review: false }, { is_review: true, enquiry: { stage: 'REVIEW' } }] },
        // Timed: within the lead window (or already past, if a sweep was missed).
        // Date-only: once its morning reminder time has come.
        { OR: [{ follow_up_timed: true, follow_up_at: { lte: lead } }, { follow_up_timed: false, follow_up_at: { lte: now } }] },
      ],
    },
    select: {
      id: true,
      subject: true,
      next_medium: true,
      is_review: true,
      follow_up_at: true,
      follow_up_timed: true,
      enquiry: { select: {
        id: true, ref_no: true, title: true, owner_id: true, handler_id: true, stage: true,
        expected_value: true, currency_code: true,
        customer: { select: { name: true } }, owner: { select: { name: true } }, currency: { select: { symbol: true } },
      } },
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
      // A review is Internal's job, a follow-up is Field's — the current
      // handler is whoever holds the enquiry now.
      userIds: [a.enquiry.handler_id ?? a.enquiry.owner_id],
      type: notificationService.Type.FOLLOWUP_DUE,
      // "Review at 5:30 pm: ENQ-…" for a timed one; "Follow-up today: ENQ-…" for a day.
      title: `${a.is_review ? 'Review' : 'Follow-up'} ${a.follow_up_timed
        ? `at ${formatTime(a.follow_up_at, config.APP_TIMEZONE)}` : 'today'}: ${a.enquiry.ref_no}`,
      body: `${a.subject}${!a.is_review && a.next_medium ? ` · ${a.next_medium}` : ''} — ${a.enquiry.title}`,
      entityType: 'Enquiry',
      entityId: String(a.enquiry.id),
      link: `/dashboard/sales/enquiries/${a.enquiry.id}`,
      actorId: null,
      email: {
        eyebrow: a.is_review ? 'Sales · Review reminder' : 'Sales · Follow-up reminder',
        intro: a.follow_up_timed
          ? `Your ${a.is_review ? 'review meeting' : 'follow-up'} is at ${formatTime(a.follow_up_at, config.APP_TIMEZONE)} today.`
          : `You have a ${a.is_review ? 'review' : 'follow-up'} due today.`,
        details: enquiryRows(a.enquiry, [
          [a.is_review ? 'Review' : 'Follow-up', a.subject],
          ['Medium', !a.is_review && a.next_medium ? MEDIUM[a.next_medium] : null],
        ]),
      },
    });
    sent += 1;
  }

  return { checked: due.length, sent };
}

/**
 * Nudges the current handler once when an enquiry has been stuck in a stage
 * past its threshold. Fires once per stage: the marker re-arms when the
 * enquiry moves on (its stage_since becomes later than the marker).
 *
 * @returns {Promise<{ checked: number, sent: number }>}
 */
async function runStageAgingReminders() {
  const now = Date.now();
  const candidates = await prisma.enquiry.findMany({
    where: {
      deleted_at: null,
      OR: Object.entries(STAGE_AGING_DAYS).map(([stage, days]) => ({
        stage,
        stage_since: { lte: new Date(now - days * DAY_MS) },
      })),
    },
    select: {
      id: true, ref_no: true, title: true, stage: true, stage_since: true,
      aging_reminded_at: true, owner_id: true, handler_id: true,
      expected_value: true, currency_code: true,
      customer: { select: { name: true } }, owner: { select: { name: true } }, currency: { select: { symbol: true } },
    },
    orderBy: { stage_since: 'asc' },
    take: 1000,
  });

  // Prisma can't compare two columns, so "not yet reminded in this stage" is
  // checked here: no marker, or a marker from before the current stage began.
  const due = candidates.filter((e) => !e.aging_reminded_at || e.aging_reminded_at < e.stage_since);

  let sent = 0;
  for (const e of due) {
    // Claim by the marker value we read, so a concurrent worker can't double-send.
    const claim = await prisma.enquiry.updateMany({
      where: { id: e.id, aging_reminded_at: e.aging_reminded_at },
      data: { aging_reminded_at: new Date() },
    });
    if (claim.count !== 1) continue;

    const days = Math.floor((now - e.stage_since.getTime()) / DAY_MS);
    await notificationService.notify({
      userIds: [e.handler_id ?? e.owner_id],
      type: notificationService.Type.STAGE_AGING,
      title: `Enquiry stalled: ${e.ref_no}`,
      body: `${e.title} — ${days} days in ${stageLabel(e.stage)}. Please move it forward.`,
      entityType: 'Enquiry',
      entityId: String(e.id),
      link: `/dashboard/sales/enquiries/${e.id}`,
      actorId: null,
      email: {
        eyebrow: 'Sales · Stalled',
        intro: `This enquiry has been in ${stageLabel(e.stage)} for ${days} days, past the stage's time limit. Please move it forward.`,
        details: enquiryRows(e, [['Days in stage', String(days)], ['Next step', NEXT_STEP[e.stage]]]),
      },
    });
    sent += 1;
  }

  return { checked: due.length, sent };
}

module.exports = { runDueFollowupReminders, runStageAgingReminders, STAGE_AGING_DAYS };
