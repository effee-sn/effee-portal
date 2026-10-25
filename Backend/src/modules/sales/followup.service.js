const prisma = require('../../lib/prisma');
const { notificationService } = require('../notification/notification.service');
const { stageLabel } = require('./enquiry.service');
const config = require('../../config/env');
const { formatTime, localDay } = require('../../lib/timezone');
const { enquiryRows, NEXT_STEP } = require('./emailDetails');
const { salesConfigService } = require('./config.service');
const { dueReminder, lookahead } = require('./reminderPlan');

const MEDIUM = Object.freeze({ CALL: 'Call', MEETING: 'Meeting', TEAMS: 'Teams', SITE_VISIT: 'Site visit', EMAIL: 'Email' });

/**
 * Sales reminders, run by the periodic sweep (see followup.scheduler):
 *
 *   - **Follow-up / review coming up** — a timed follow-up (a call at 3 PM,
 *     a review at 5:30) is reminded at its kind's times before it, set in
 *     Administrator → Configuration → Sales (a site visit: 1 day, 3 hours and 15 minutes
 *     before; others 15 minutes before). A date-only follow-up is reminded at
 *     its morning time (9:00 local) that day, plus the morning of any whole
 *     day set before it. Which reminder is due is decided in reminderPlan.
 *   - **Stage aging** — an enquiry has sat in one stage past its threshold.
 *
 * Both go to the enquiry's *current handler* (the person who must act now),
 * falling back to the owner. Each reminder is *claimed* with a conditional
 * update before notifying, so even under a PM2 cluster only one worker sends a
 * given reminder. Notifications also go out by email via `notify()`.
 */

const BATCH = 500;
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

/** Reminder kind of a follow-up: REVIEW, or its medium (none → CALL's timing). */
const kindOf = (a) => (a.is_review ? 'REVIEW' : a.next_medium || 'CALL');

/**
 * "at 5:30 pm" (today), "tomorrow at 10:00 am", "on 16 Oct at 10:00 am" —
 * or for a date-only follow-up "today" / "tomorrow" / "on 16 Oct".
 */
function whenText(at, timed, now) {
  const tz = config.APP_TIMEZONE;
  const day = localDay(at, tz);
  const today = localDay(now, tz);
  const tomorrow = localDay(new Date(now.getTime() + DAY_MS), tz);
  const time = formatTime(at, tz);
  const date = at.toLocaleDateString('en-IN', { timeZone: tz, day: 'numeric', month: 'short' });
  if (!timed) return day === today ? 'today' : day === tomorrow ? 'tomorrow' : `on ${date}`;
  if (day === today) return `at ${time}`;
  return day === tomorrow ? `tomorrow at ${time}` : `on ${date} at ${time}`;
}

/** "in about 3 hours" / "in 15 minutes" — empty once it's due or past. */
function inText(at, now) {
  const min = Math.round((at.getTime() - now.getTime()) / 60000);
  if (min <= 0) return '';
  if (min < 60) return `in ${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.round(min / 60);
  if (h < 48) return h === 1 ? 'in about an hour' : `in about ${h} hours`;
  return `in ${Math.round(min / 1440)} days`;
}

/**
 * Sends every follow-up / review reminder that is due now — at most one per
 * follow-up per sweep.
 * @returns {Promise<{ checked: number, sent: number }>}
 */
async function runDueFollowupReminders(now = new Date()) {
  const offsetsByKind = await salesConfigService.reminderOffsetMap();
  const { timedMin, dayMin } = lookahead(Object.values(offsetsByKind));
  const ahead = (min) => new Date(now.getTime() + min * 60 * 1000);

  const candidates = await prisma.enquiryActivity.findMany({
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
        // Within reach of its earliest possible reminder (or already past).
        { OR: [{ follow_up_timed: true, follow_up_at: { lte: ahead(timedMin) } }, { follow_up_timed: false, follow_up_at: { lte: ahead(dayMin) } }] },
      ],
    },
    select: {
      id: true,
      subject: true,
      next_medium: true,
      is_review: true,
      follow_up_at: true,
      follow_up_timed: true,
      reminder_offset_sent: true,
      reminders_armed_at: true,
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
  for (const a of candidates) {
    const due = dueReminder({
      at: a.follow_up_at,
      timed: a.follow_up_timed,
      offsets: offsetsByKind[kindOf(a)],
      sentOffset: a.reminder_offset_sent,
      armedAt: a.reminders_armed_at,
      now,
    });
    if (!due) continue;

    // Claim by the state we read: only one worker's update matches, so each
    // reminder goes once even under a PM2 cluster. The final one closes it.
    const claim = await prisma.enquiryActivity.updateMany({
      where: { id: a.id, reminded_at: null, reminder_offset_sent: a.reminder_offset_sent },
      data: due.final ? { reminded_at: new Date() } : { reminder_offset_sent: due.offset },
    });
    if (claim.count !== 1) continue;

    const siteVisit = !a.is_review && a.next_medium === 'SITE_VISIT';
    const label = a.is_review ? 'Review' : siteVisit ? 'Site visit' : 'Follow-up';
    const noun = a.is_review ? 'review meeting' : siteVisit ? 'site visit' : 'follow-up';
    const when = whenText(a.follow_up_at, a.follow_up_timed, now);
    const soon = a.follow_up_timed ? inText(a.follow_up_at, now) : '';

    await notificationService.notify({
      // A review is Internal's job, a follow-up is Field's — the current
      // handler is whoever holds the enquiry now.
      userIds: [a.enquiry.handler_id ?? a.enquiry.owner_id],
      type: notificationService.Type.FOLLOWUP_DUE,
      // "Site visit tomorrow at 10:00 am: ENQ-…", "Review at 5:30 pm: ENQ-…",
      // "Follow-up today: ENQ-…".
      title: `${label} ${when}: ${a.enquiry.ref_no}`,
      body: `${a.subject}${!a.is_review && a.next_medium ? ` · ${a.next_medium}` : ''} — ${a.enquiry.title}`,
      entityType: 'Enquiry',
      entityId: String(a.enquiry.id),
      link: `/dashboard/sales/enquiries/${a.enquiry.id}`,
      actorId: null,
      email: {
        eyebrow: `Sales · ${label} reminder`,
        intro: a.follow_up_timed
          ? `Your ${noun} is ${when.startsWith('at ') ? `today ${when}` : when}${soon ? ` — ${soon}` : ''}.`
          : `You have a ${noun} due ${when}.`,
        details: enquiryRows(a.enquiry, [
          [a.is_review ? 'Review' : 'Follow-up', a.subject],
          ['Medium', !a.is_review && a.next_medium ? MEDIUM[a.next_medium] : null],
          ['When', a.follow_up_at.toLocaleString('en-IN', a.follow_up_timed
            ? { timeZone: config.APP_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }
            : { timeZone: config.APP_TIMEZONE, dateStyle: 'medium' })],
        ]),
      },
    });
    sent += 1;
  }

  return { checked: candidates.length, sent };
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
