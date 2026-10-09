/**
 * Sales business rules — pinned down.
 *
 * Exercises the sales services directly against a real database (no HTTP), so
 * the rules that matter are locked in: stage gates, one-step progression, the
 * Field ⇄ Internal handoff baton, the offer → follow-up ⇄ negotiation loop,
 * Won/Lost/Reopen, reassignment, the reminder sweeps, and the Sales dashboard
 * arithmetic.
 *
 * ── Requirements ──────────────────────────────────────────────────────────────
 * `DATABASE_URL` must point at a migrated **development/test** database. The
 * suite creates its own users, customer and enquiries and removes them after.
 * The reminder sweeps scan the whole database (exactly as the live scheduler
 * does), so never point this at production — it refuses to run there.
 *
 * Email and browser push are switched off before the app loads, so a run never
 * sends anything.
 *
 * Run:  npm run test:sales
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Must happen before any app module loads config. dotenv never overrides a
// variable that is already set, so these win over the local .env.
process.env.EMAIL_NOTIFICATIONS = 'false';
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) {
  env.unavailable = true; env.reason = 'DATABASE_URL is not set';
} else if ((process.env.NODE_ENV || '') === 'production') {
  env.unavailable = true; env.reason = 'refusing to run against a production environment';
}

/** A test that skips (rather than fails) when no database is available. */
const it = (name, fn) => test(name, async (t) => {
  if (env.unavailable) return t.skip(env.reason);
  return fn(t);
});

// ── Lazy app handles (required only once the environment is settled) ────────
let prisma; let enquiryService; let activityService; let attachmentService;
let workflowService; let followup; let analyticsService; let salesConfigService;

const ids = { enquiries: [], users: [], apps: [] };
const fx = {}; // fixtures: users, customer, previous workflow config
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// ── Helpers ──────────────────────────────────────────────────────────────────
const actor = (user) => ({ id: user.id, email: user.email });

async function newEnquiry(type = 'GENERATED', by = fx.field, extra = {}) {
  const e = await enquiryService.create({
    title: `TEST ${type} ${suffix}`, enquiry_type: type, customer_id: fx.customer.id, ...extra,
  }, actor(by));
  ids.enquiries.push(e.id);
  return e;
}

const upload = (enquiryId, kind, by) => attachmentService.record(enquiryId, {
  originalname: `${kind.toLowerCase()}.pdf`,
  filename: `test-${suffix}-${Math.random().toString(36).slice(2)}`,
  mimetype: 'application/pdf',
  size: 1,
}, { kind }, actor(by));

const log = (enquiryId, by, extra = {}) => activityService.create(enquiryId, {
  type: 'CALL', activity_at: new Date(), subject: 'test activity', ...extra,
}, actor(by));

const concludeReview = (enquiryId, by) => log(enquiryId, by, {
  type: 'MEETING', subject: 'internal review', is_review: true, follow_up_ended: true,
});

const move = (enquiryId, stage, by) => enquiryService.update(enquiryId, { stage }, actor(by));

const state = (id) => prisma.enquiry.findUnique({
  where: { id },
  select: { stage: true, handler_id: true, owner_id: true, enquiry_type: true, won_at: true, order_value: true, lost_reason: true },
});

const notified = (userId, type, enquiryId) => prisma.notification.count({
  where: { user_id: userId, type, entity_id: String(enquiryId) },
});

/** Field raises a Generated enquiry and Internal walks it to Offer Released. */
async function toOfferReleased() {
  const e = await newEnquiry('GENERATED');
  await upload(e.id, 'FORMAT_PDF', fx.field);
  await move(e.id, 'REVIEW', fx.field);
  await concludeReview(e.id, fx.internal);
  await move(e.id, 'CONCEPT', fx.internal);
  await upload(e.id, 'CONCEPT', fx.internal);
  await upload(e.id, 'POWER_CALC', fx.internal);
  await move(e.id, 'COSTING', fx.internal);
  await upload(e.id, 'COSTING', fx.internal);
  await move(e.id, 'COSTING_REVIEW', fx.internal);
  await upload(e.id, 'COSTING_REVIEW', fx.internal);
  await move(e.id, 'OFFER_RELEASED', fx.internal);
  return e;
}

async function sendOffer(enquiryId, by) {
  const offer = await upload(enquiryId, 'OFFER', by);
  await attachmentService.markSent(offer.id, true, actor(by));
  return offer;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
before(async () => {
  if (env.unavailable) {
    console.warn(`\n  ⚠ Sales rule tests skipped — ${env.reason}\n`);
    return;
  }
  prisma = require('../../src/lib/prisma');
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    env.unavailable = true;
    env.reason = `database unreachable (${err.message.split('\n')[0]})`;
    console.warn(`\n  ⚠ Sales rule tests skipped — ${env.reason}\n`);
    return;
  }

  ({ enquiryService } = require('../../src/modules/sales/enquiry.service'));
  ({ activityService } = require('../../src/modules/sales/activity.service'));
  ({ attachmentService } = require('../../src/modules/sales/attachment.service'));
  ({ workflowService } = require('../../src/modules/sales/workflow.service'));
  followup = require('../../src/modules/sales/followup.service');
  ({ analyticsService } = require('../../src/modules/sales/analytics.service'));
  ({ salesConfigService } = require('../../src/modules/sales/config.service'));
  fx.previousProbabilities = await salesConfigService.listProbabilities();

  const role = await prisma.role.findFirst({ where: { deleted_at: null }, select: { id: true } });
  const mkUser = async (name) => {
    const u = await prisma.user.create({
      data: { name: `${name} ${suffix}`, email: `${name.toLowerCase()}-${suffix}@sales.test`, password: 'x', role_id: role.id },
      select: { id: true, email: true, name: true },
    });
    ids.users.push(u.id);
    return u;
  };
  fx.field = await mkUser('Field');
  fx.field2 = await mkUser('FieldTwo');
  fx.internal = await mkUser('Internal');
  fx.analyst = await mkUser('Analyst'); // owns only the dashboard-analytics enquiries
  fx.customer = await prisma.customer.create({ data: { name: `TEST CUSTOMER ${suffix}` }, select: { id: true } });

  fx.previousInternal = (await workflowService.get()).internal_user_id ?? null;
  await workflowService.update({ internal_user_id: fx.internal.id }, actor(fx.field));
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await workflowService.update({ internal_user_id: fx.previousInternal }, actor(fx.field));
    const enquiryIds = ids.enquiries;
    await prisma.notification.deleteMany({
      where: { OR: [{ user_id: { in: ids.users } }, { entity_type: 'Enquiry', entity_id: { in: enquiryIds.map(String) } }] },
    });
    await prisma.auditLog.deleteMany({ where: { actor_id: { in: ids.users } } });
    await prisma.enquiryActivity.deleteMany({ where: { enquiry_id: { in: enquiryIds } } });
    await prisma.enquiryAttachment.deleteMany({ where: { enquiry_id: { in: enquiryIds } } });
    await prisma.enquiryStageEvent.deleteMany({ where: { enquiry_id: { in: enquiryIds } } });
    await prisma.enquiry.deleteMany({ where: { id: { in: enquiryIds } } });
    if (ids.apps.length) await prisma.salesApplication.deleteMany({ where: { id: { in: ids.apps } } });
    if (fx.previousProbabilities) {
      await salesConfigService.saveProbabilities({ items: fx.previousProbabilities }, actor(fx.field));
    }
    if (fx.customer) await prisma.customer.delete({ where: { id: fx.customer.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  } finally {
    await prisma.$disconnect();
  }
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Sales rules: creation', () => {
  it('a new enquiry always starts at NEW, held by the raiser — a passed stage is ignored', async () => {
    const e = await newEnquiry('GENERATED', fx.field, { stage: 'NEGOTIATION' });
    const s = await state(e.id);
    assert.equal(s.stage, 'NEW');
    assert.equal(s.owner_id, fx.field.id);
    assert.equal(s.handler_id, fx.field.id);
  });
});

describe('Sales rules: progression and gates', () => {
  let id;

  it('Generated: New → Review needs the enquiry format', async () => {
    id = (await newEnquiry('GENERATED')).id;
    await assert.rejects(move(id, 'REVIEW', fx.field), { name: 'ConflictError' });
    await upload(id, 'FORMAT_PDF', fx.field);
    await move(id, 'REVIEW', fx.field);
    const s = await state(id);
    assert.equal(s.stage, 'REVIEW');
    assert.equal(s.handler_id, fx.internal.id, 'Review hands the baton to Internal');
  });

  it('a Generated enquiry cannot use the Contacted stage', async () => {
    const other = (await newEnquiry('GENERATED')).id;
    await assert.rejects(move(other, 'CONTACTED', fx.field), { name: 'ValidationError' });
  });

  it('only the current holder can act — Field is locked out while Internal holds it', async () => {
    await assert.rejects(log(id, fx.field), { name: 'ForbiddenError' });
    await assert.rejects(upload(id, 'CONCEPT', fx.field), { name: 'ForbiddenError' });
    await assert.rejects(move(id, 'CONCEPT', fx.field), { name: 'ForbiddenError' });
  });

  it('stages move one step at a time — no skipping ahead', async () => {
    await assert.rejects(move(id, 'COSTING', fx.internal), { name: 'ConflictError' });
  });

  it('Review → Concept needs a review marked "no future review"', async () => {
    await log(id, fx.internal, {
      type: 'MEETING', subject: 'first review', is_review: true,
      follow_up_at: new Date(Date.now() + 7 * 864e5),
    });
    await assert.rejects(move(id, 'CONCEPT', fx.internal), { name: 'ConflictError' },
      'a review with a next date does not conclude the stage');
    await concludeReview(id, fx.internal);
    await move(id, 'CONCEPT', fx.internal);
    assert.equal((await state(id)).stage, 'CONCEPT');
  });

  it('Concept → Costing needs both the concept document and the power-source calculation', async () => {
    await upload(id, 'CONCEPT', fx.internal);
    await assert.rejects(move(id, 'COSTING', fx.internal), { name: 'ConflictError' });
    await upload(id, 'POWER_CALC', fx.internal);
    await move(id, 'COSTING', fx.internal);
    assert.equal((await state(id)).stage, 'COSTING');
  });

  it('no stepping back', async () => {
    await assert.rejects(move(id, 'CONCEPT', fx.internal), { name: 'ConflictError' });
  });

  it('Costing → Costing Review needs the costing; Costing Review → Offer Released needs the costing review', async () => {
    await assert.rejects(move(id, 'COSTING_REVIEW', fx.internal), { name: 'ConflictError' });
    await upload(id, 'COSTING', fx.internal);
    await move(id, 'COSTING_REVIEW', fx.internal);
    await assert.rejects(move(id, 'OFFER_RELEASED', fx.internal), { name: 'ConflictError' });
    await upload(id, 'COSTING_REVIEW', fx.internal);
    await move(id, 'OFFER_RELEASED', fx.internal);
    const s = await state(id);
    assert.equal(s.stage, 'OFFER_RELEASED');
    assert.equal(s.handler_id, fx.internal.id);
  });

  it('the manual flow ends at Offer Released — Follow-up is reached only by sending the offer', async () => {
    await assert.rejects(move(id, 'FOLLOW_UP', fx.internal), { name: 'ConflictError' });
  });
});

describe('Sales rules: Incoming enquiries', () => {
  it('the first logged activity moves New → Contacted, still held by Field', async () => {
    const id = (await newEnquiry('INCOMING')).id;
    await log(id, fx.field);
    const s = await state(id);
    assert.equal(s.stage, 'CONTACTED');
    assert.equal(s.handler_id, fx.field.id);
  });

  it('Contacted → Review needs the enquiry format, then hands to Internal', async () => {
    const id = (await newEnquiry('INCOMING')).id;
    await log(id, fx.field);
    await assert.rejects(move(id, 'REVIEW', fx.field), { name: 'ConflictError' });
    await upload(id, 'FORMAT_EXCEL', fx.field);
    await move(id, 'REVIEW', fx.field);
    const s = await state(id);
    assert.equal(s.stage, 'REVIEW');
    assert.equal(s.handler_id, fx.internal.id);
  });
});

describe('Sales rules: offer → follow-up ⇄ negotiation loop', () => {
  let id;

  it('sending the first offer moves Offer Released → Follow-up and hands to Field', async () => {
    id = (await toOfferReleased()).id;
    const offer = await sendOffer(id, fx.internal);
    assert.equal(offer.stage, 'OFFER_RELEASED', 'v1 is stamped with the stage it was added in');
    const s = await state(id);
    assert.equal(s.stage, 'FOLLOW_UP');
    assert.equal(s.handler_id, fx.field.id);
  });

  it('Internal cannot act during Field follow-up', async () => {
    await assert.rejects(log(id, fx.internal), { name: 'ForbiddenError' });
  });

  it('a follow-up flagged "needs negotiation" moves to Negotiation and hands to Internal', async () => {
    await log(id, fx.field, { needs_negotiation: true });
    const s = await state(id);
    assert.equal(s.stage, 'NEGOTIATION');
    assert.equal(s.handler_id, fx.internal.id);
  });

  it('sending a revised offer moves Negotiation → Negotiation Follow-up and hands back to Field', async () => {
    const offer = await sendOffer(id, fx.internal);
    assert.equal(offer.stage, 'NEGOTIATION', 'revisions are stamped Negotiation');
    const s = await state(id);
    assert.equal(s.stage, 'NEGOTIATION_FOLLOW_UP');
    assert.equal(s.handler_id, fx.field.id);
  });

  it('the loop repeats: negotiate again → revised offer → follow-up again', async () => {
    await log(id, fx.field, { needs_negotiation: true });
    assert.equal((await state(id)).stage, 'NEGOTIATION');
    await sendOffer(id, fx.internal);
    const s = await state(id);
    assert.equal(s.stage, 'NEGOTIATION_FOLLOW_UP');
    assert.equal(s.handler_id, fx.field.id);
  });

  it('every move is recorded in the stage history', async () => {
    const events = await prisma.enquiryStageEvent.findMany({
      where: { enquiry_id: id }, orderBy: { id: 'asc' }, select: { to_stage: true },
    });
    assert.deepEqual(events.map((ev) => ev.to_stage), [
      'NEW', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED',
      'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP',
    ]);
  });
});

describe('Sales rules: closing and reopening', () => {
  let id;

  it('Won needs an offer sent to the customer', async () => {
    id = (await newEnquiry('GENERATED')).id;
    await assert.rejects(
      enquiryService.win(id, { order_value: 1000 }, actor(fx.field)),
      { name: 'ConflictError' },
    );
  });

  it('during follow-up, Internal cannot close it — the field owner closes it Won', async () => {
    id = (await toOfferReleased()).id;
    await sendOffer(id, fx.internal); // → FOLLOW_UP, held by Field
    await assert.rejects(
      enquiryService.win(id, { order_value: 250000 }, actor(fx.internal)),
      { name: 'ForbiddenError' },
    );
    await enquiryService.win(id, { order_value: 250000, order_no: 'PO-TEST' }, actor(fx.field));
    const s = await state(id);
    assert.equal(s.stage, 'WON');
    assert.equal(Number(s.order_value), 250000);
    assert.equal(s.handler_id, fx.field.id, 'the close stays with the field owner');
  });

  it('Won notifies the internal handler, never the person who closed it', async () => {
    assert.equal(await notified(fx.internal.id, 'ENQUIRY_WON', id), 1);
    assert.equal(await notified(fx.field.id, 'ENQUIRY_WON', id), 0);
  });

  it('Reopen returns it to Follow-up with the field owner and clears the close-out', async () => {
    await enquiryService.reopen(id, actor(fx.field));
    const s = await state(id);
    assert.equal(s.stage, 'FOLLOW_UP');
    assert.equal(s.handler_id, fx.field.id);
    assert.equal(s.won_at, null);
    assert.equal(s.order_value, null);
  });

  it('Lost records the reason and notifies the internal handler', async () => {
    await enquiryService.lose(id, { lost_reason: 'Price too high', lost_to: 'Rival Co' }, actor(fx.field));
    const s = await state(id);
    assert.equal(s.stage, 'LOST');
    assert.equal(s.lost_reason, 'Price too high');
    assert.equal(await notified(fx.internal.id, 'ENQUIRY_LOST', id), 1);
  });
});

describe('Sales rules: ownership, type and reassignment', () => {
  it('changing the owner while Field holds it moves the baton with them', async () => {
    const id = (await newEnquiry('GENERATED')).id;
    await enquiryService.update(id, { owner_id: fx.field2.id }, actor(fx.field));
    const s = await state(id);
    assert.equal(s.owner_id, fx.field2.id);
    assert.equal(s.handler_id, fx.field2.id);
  });

  it('the type can change at New, and is fixed after that', async () => {
    const id = (await newEnquiry('GENERATED')).id;
    await enquiryService.update(id, { enquiry_type: 'INCOMING' }, actor(fx.field));
    assert.equal((await state(id)).enquiry_type, 'INCOMING');

    await upload(id, 'FORMAT_PDF', fx.field);
    await log(id, fx.field); // Incoming → Contacted
    await assert.rejects(
      enquiryService.update(id, { enquiry_type: 'GENERATED' }, actor(fx.field)),
      { name: 'ValidationError' },
    );
  });

  it('Reassign: a new owner takes the baton only if Field holds it; a handler override sticks', async () => {
    const id = (await newEnquiry('GENERATED')).id;
    await upload(id, 'FORMAT_PDF', fx.field);
    await move(id, 'REVIEW', fx.field); // Internal holds

    await enquiryService.reassign(id, { owner_id: fx.field2.id }, actor(fx.field));
    let s = await state(id);
    assert.equal(s.owner_id, fx.field2.id);
    assert.equal(s.handler_id, fx.internal.id, 'Internal keeps the baton while it holds it');

    await enquiryService.reassign(id, { handler_id: fx.field.id }, actor(fx.field));
    s = await state(id);
    assert.equal(s.handler_id, fx.field.id);
  });

  it('with no Internal handler configured, the baton stays with the owner', async () => {
    await workflowService.update({ internal_user_id: null }, actor(fx.field));
    try {
      const id = (await newEnquiry('GENERATED')).id;
      await upload(id, 'FORMAT_PDF', fx.field);
      await move(id, 'REVIEW', fx.field);
      assert.equal((await state(id)).handler_id, fx.field.id);
    } finally {
      await workflowService.update({ internal_user_id: fx.internal.id }, actor(fx.field));
    }
  });
});

describe('Sales rules: reminders', () => {
  it('a follow-up due reminds the current holder once', async () => {
    const id = (await toOfferReleased()).id;
    await sendOffer(id, fx.internal); // Field holds
    await log(id, fx.field, { follow_up_at: new Date(Date.now() - 864e5) });

    await followup.runDueFollowupReminders();
    assert.equal(await notified(fx.field.id, 'FOLLOWUP_DUE', id), 1);
    await followup.runDueFollowupReminders();
    assert.equal(await notified(fx.field.id, 'FOLLOWUP_DUE', id), 1, 'not reminded twice');
  });

  it('a past next-review date stops reminding once the enquiry has left Review', async () => {
    const id = (await newEnquiry('GENERATED')).id;
    await upload(id, 'FORMAT_PDF', fx.field);
    await move(id, 'REVIEW', fx.field);
    await log(id, fx.internal, {
      type: 'MEETING', subject: 'first review', is_review: true,
      follow_up_at: new Date(Date.now() - 864e5), // next review was yesterday
    });
    await concludeReview(id, fx.internal);
    await move(id, 'CONCEPT', fx.internal); // left Review

    await followup.runDueFollowupReminders();
    assert.equal(await notified(fx.internal.id, 'FOLLOWUP_DUE', id), 0);
  });

  it('a stalled stage reminds the holder once per stage, and re-arms after a stage change', async () => {
    const id = (await newEnquiry('GENERATED')).id;
    await upload(id, 'FORMAT_PDF', fx.field);
    await move(id, 'REVIEW', fx.field); // Internal holds; Review threshold is 4 days
    await prisma.enquiry.update({ where: { id }, data: { stage_since: new Date(Date.now() - 10 * 864e5) } });

    await followup.runStageAgingReminders();
    assert.equal(await notified(fx.internal.id, 'STAGE_AGING', id), 1);
    await followup.runStageAgingReminders();
    assert.equal(await notified(fx.internal.id, 'STAGE_AGING', id), 1, 'once per stage');

    // Reminded 12 days ago in an earlier stage; moved stage 10 days ago and
    // stalled again (Concept threshold is 5 days) → reminded again.
    await prisma.enquiry.update({
      where: { id },
      data: {
        stage: 'CONCEPT',
        stage_since: new Date(Date.now() - 10 * 864e5),
        aging_reminded_at: new Date(Date.now() - 12 * 864e5),
      },
    });
    await followup.runStageAgingReminders();
    assert.equal(await notified(fx.internal.id, 'STAGE_AGING', id), 2);
  });
});

describe('Sales dashboard analytics', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const ago = (days) => new Date(Date.now() - days * DAY);

  /**
   * Seeds an enquiry owned by the analyst with a hand-written stage trail
   * ([stage, daysAgo] pairs) — analytics only reads, so the trail is written
   * directly rather than walked through the gates.
   */
  async function seed(trail, data = {}) {
    const e = await newEnquiry('GENERATED', fx.analyst);
    await prisma.enquiryStageEvent.deleteMany({ where: { enquiry_id: e.id } });
    let from = null;
    for (const [stage, days] of trail) {
      await prisma.enquiryStageEvent.create({
        data: { enquiry_id: e.id, from_stage: from, to_stage: stage, created_at: ago(days) },
      });
      from = stage;
    }
    const [last, lastDays] = trail[trail.length - 1];
    await prisma.enquiry.update({
      where: { id: e.id },
      data: { stage: last, stage_since: ago(lastDays), created_at: ago(trail[0][1]), ...data },
    });
    return e;
  }

  let r;
  before(async () => {
    if (env.unavailable) return;
    await seed([['NEW', 10], ['REVIEW', 8], ['CONCEPT', 7], ['COSTING', 6], ['COSTING_REVIEW', 5],
      ['OFFER_RELEASED', 4], ['FOLLOW_UP', 3], ['WON', 2]], { won_at: ago(2), order_value: 100000 });
    await seed([['NEW', 6], ['REVIEW', 4], ['CONCEPT', 3], ['COSTING', 3], ['COSTING_REVIEW', 2],
      ['OFFER_RELEASED', 2], ['FOLLOW_UP', 1], ['WON', 1]], { won_at: ago(1), order_value: 50000 });
    await seed([['NEW', 5], ['REVIEW', 4], ['CONCEPT', 4], ['COSTING', 3], ['COSTING_REVIEW', 3],
      ['OFFER_RELEASED', 2], ['FOLLOW_UP', 2], ['LOST', 1]],
    { lost_at: ago(1), lost_reason: 'Price too high', lost_to: 'Rival Co' });
    await seed([['NEW', 4], ['LOST', 3]], { lost_at: ago(3), lost_reason: ' price TOO high ' });
    await seed([['NEW', 1]], { expected_value: 20000 });
    r = await analyticsService.overview({ owner_id: fx.analyst.id });
  });

  it('headline: won, lost, win rate, average deal and days to close', () => {
    assert.equal(r.headline.raised, 5);
    assert.equal(r.headline.won, 2);
    assert.equal(r.headline.won_value, 150000);
    assert.equal(r.headline.lost, 2);
    assert.equal(r.headline.win_rate, 50);
    assert.equal(r.headline.avg_deal, 75000);
    assert.equal(r.headline.avg_days_to_close, 6.5); // (8 + 5) / 2
    assert.equal(r.headline.open_count, 1);
    assert.equal(r.headline.open_value, 20000);
  });

  it('funnel counts how far each raised enquiry got (a loss keeps its furthest stage)', () => {
    const f = Object.fromEntries(r.funnel.map((s) => [s.key, s.count]));
    assert.deepEqual(f, { RAISED: 5, REVIEW: 3, CONCEPT: 3, COSTING: 3, OFFER_RELEASED: 3, WON: 2 });
  });

  it('time in stage averages each completed stay', () => {
    const t = Object.fromEntries(r.time_in_stage.map((s) => [s.stage, s.avg_days]));
    assert.equal(t.NEW, 1.5);    // (2 + 2 + 1 + 1) / 4 — the still-open NEW is not counted
    assert.equal(t.REVIEW, 0.7); // (1 + 1 + 0) / 3
    assert.equal(t.WON, undefined, 'Won is an end state, never "waited in"');
  });

  it('lost analysis groups reasons case-insensitively and records the stage lost from', () => {
    assert.deepEqual(r.lost.reasons, [{ label: 'Price too high', count: 2 }]);
    assert.deepEqual(r.lost.competitors.map((c) => c.label).sort(), ['Not known', 'Rival Co']);
    assert.deepEqual(r.lost.by_stage.map((s) => s.label).sort(), ['FOLLOW_UP', 'NEW']);
  });

  it('team row and monthly trend reflect the same closes', () => {
    assert.equal(r.team.length, 1);
    assert.equal(r.team[0].owner_id, fx.analyst.id);
    assert.equal(r.team[0].won_value, 150000);
    assert.equal(r.team[0].win_rate, 50);
    const total = r.monthly.reduce((n, m) => ({ won: n.won + m.won, lost: n.lost + m.lost }), { won: 0, lost: 0 });
    assert.deepEqual(total, { won: 2, lost: 2 });
    assert.equal(r.monthly.length, 12);
  });

  it('the type filter narrows every block', async () => {
    const none = await analyticsService.overview({ owner_id: fx.analyst.id, enquiry_type: 'INCOMING' });
    assert.equal(none.headline.raised, 0);
    assert.equal(none.headline.won, 0);
    assert.equal(none.team.length, 0);
  });
});

describe('Sales configuration: applications and stage probabilities', () => {
  let app;

  it('an application is created, and names are unique regardless of case', async () => {
    app = await salesConfigService.createApplication({ name: `Induction Brazing ${suffix}` }, actor(fx.field));
    ids.apps.push(app.id);
    assert.equal(app.is_active, true);
    await assert.rejects(
      salesConfigService.createApplication({ name: `induction brazing ${suffix}` }, actor(fx.field)),
      { name: 'ConflictError' },
    );
  });

  it('an enquiry records its application; an inactive one cannot be picked for a new enquiry', async () => {
    const e = await newEnquiry('GENERATED', fx.field, { application_id: app.id });
    assert.equal((await enquiryService.getById(e.id)).application.id, app.id);

    await salesConfigService.updateApplication(app.id, { is_active: false }, actor(fx.field));
    await assert.rejects(newEnquiry('GENERATED', fx.field, { application_id: app.id }), { name: 'ValidationError' });
    // ...but the enquiry that already has it can still be edited.
    await enquiryService.update(e.id, { title: `TEST renamed ${suffix}` }, actor(fx.field));
    assert.equal((await enquiryService.getById(e.id)).application.id, app.id);
  });

  it('an application in use cannot be deleted; an unused one can', async () => {
    await assert.rejects(salesConfigService.deleteApplication(app.id, actor(fx.field)), { name: 'ConflictError' });
    const spare = await salesConfigService.createApplication({ name: `Spare ${suffix}` }, actor(fx.field));
    await salesConfigService.deleteApplication(spare.id, actor(fx.field));
    assert.equal(await prisma.salesApplication.count({ where: { id: spare.id } }), 0);
  });

  it('stage probabilities save; Won stays 100 and Lost stays 0', async () => {
    const rows = await salesConfigService.saveProbabilities({
      items: [{ stage: 'NEW', probability: 25 }, { stage: 'WON', probability: 40 }, { stage: 'LOST', probability: 90 }],
    }, actor(fx.field));
    const p = Object.fromEntries(rows.map((r) => [r.stage, r.probability]));
    assert.equal(p.NEW, 25);
    assert.equal(p.WON, 100);
    assert.equal(p.LOST, 0);
    assert.equal(rows.length, 12);
  });

  it('the dashboard weights the open pipeline by stage probability', async () => {
    // The analyst's only open enquiry: ₹20,000 at New (now 25%).
    const r = await analyticsService.overview({ owner_id: fx.analyst.id });
    assert.equal(r.headline.open_value, 20000);
    assert.equal(r.headline.weighted_value, 5000);
  });
});

describe('Sales documents: versioning', () => {
  let id;
  const docs = async (kind) => (await attachmentService.listForEnquiry(id)).filter((d) => d.kind === kind);

  it('replacing a document keeps the old one as a superseded version', async () => {
    id = (await newEnquiry('GENERATED')).id;
    const v1 = await upload(id, 'FORMAT_PDF', fx.field);
    const v2 = await upload(id, 'FORMAT_PDF', fx.field);
    assert.equal(v1.version, 1);
    assert.equal(v2.version, 2);

    const list = await docs('FORMAT_PDF');
    assert.equal(list.length, 2, 'both versions are listed');
    assert.equal(list[0].id, v2.id, 'newest first');
    assert.equal(list[0].superseded_at, null, 'v2 is current');
    assert.notEqual(list[1].superseded_at, null, 'v1 is history');
    assert.equal(list[0].uploaded_by, fx.field.name);
  });

  it('a superseded version stays downloadable but cannot be deleted', async () => {
    const [, v1] = await docs('FORMAT_PDF');
    await assert.rejects(attachmentService.remove(v1.id, actor(fx.field)), { name: 'ConflictError' });
    await assert.rejects(attachmentService.fileFor(v1.id), { name: 'NotFoundError', message: /File/ },
      'the row resolves (only the test file itself is missing on disk)');
  });

  it('deleting the current version restores the previous one as current', async () => {
    const [v2, v1] = await docs('FORMAT_PDF');
    await attachmentService.remove(v2.id, actor(fx.field));
    const list = await docs('FORMAT_PDF');
    assert.equal(list.length, 1);
    assert.equal(list[0].id, v1.id);
    assert.equal(list[0].superseded_at, null);
    // The gate sees a current format document again.
    await move(id, 'REVIEW', fx.field);
    assert.equal((await state(id)).stage, 'REVIEW');
  });

  it('the next upload after a delete continues the numbering from what is kept', async () => {
    const v = await upload(id, 'FORMAT_PDF', fx.internal); // at Review, Internal holds it
    assert.equal(v.version, 2);
  });

  it('offer revisions are numbered and all stay current', async () => {
    const e = await toOfferReleased();
    const r1 = await upload(e.id, 'OFFER', fx.internal);
    const r2 = await upload(e.id, 'OFFER', fx.internal);
    assert.deepEqual([r1.version, r2.version], [1, 2]);
    const offers = (await attachmentService.listForEnquiry(e.id)).filter((d) => d.kind === 'OFFER');
    assert.ok(offers.every((o) => o.superseded_at === null));
  });
});
