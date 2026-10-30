/**
 * Flow engine (part 1: the core) — pinned down against a real database.
 *
 * Sales reports its events to the outbox; publishing freezes a flow as a
 * numbered version; the dispatcher starts each live flow once per event (even
 * with two workers at once), only for the stages it listens to, never while
 * paused, never for an event the flow caused itself, and logs every step.
 *
 * ── Requirements ──────────────────────────────────────────────────────────────
 * `DATABASE_URL` must point at a migrated development/test database. The suite
 * creates its own flows, events, users and enquiries and removes them after.
 * The dispatcher handles every pending event in the database (as the live
 * engine does), so never point this at production — it refuses to run there.
 *
 * Run:  npm run test:flow
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

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

const it = (name, fn) => test(name, async (t) => {
  if (env.unavailable) return t.skip(env.reason);
  return fn(t);
});

let prisma; let flowEngineService; let flowEngineRepository; let processPendingEvents; let emitFlowEvent; let enquiryService;
let attachmentService; let activityService; let workflowService;
let MAX_DEPTH;

const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ENTITY = `FlowTest${suffix}`.slice(0, 40); // our own entity type, so cleanup touches nothing else
const ids = { flows: [], users: [], enquiries: [] };
const fx = {};

const admin = (user) => ({ id: user.id, email: user.email, is_system: true, permissions: [] });
const when = (data) => ({ id: 'start', type: 'trigger', data, position: { x: 0, y: 0 } });
const end = { id: 'end', type: 'end', data: {}, position: { x: 0, y: 100 } };
const simple = (data) => ({ nodes: [when(data), end], edges: [{ id: 'e1', source: 'start', target: 'end' }] });

async function newFlow(graph, name = 'test flow') {
  const f = await flowEngineService.create({ module: 'SALES', name: `${name} ${suffix}`, graph }, admin(fx.admin));
  ids.flows.push(f.id);
  return f;
}

let seq = 0;
/** Reports an event on our test entity; returns its entity id. */
async function fire(type, payload = {}, extra = {}) {
  const entityId = `${suffix}-${++seq}`;
  await emitFlowEvent({ module: 'SALES', type, entityType: ENTITY, entityId, payload, ...extra });
  return entityId;
}

/** Sweeps until the outbox is empty (one sweep takes a batch; the live engine sweeps every few seconds). */
async function drain() {
  for (let i = 0; i < 50; i += 1) if ((await processPendingEvents()).events === 0) return;
}

const runsFor = (flowId, entityId) => prisma.flowRun.findMany({
  where: { flow_id: flowId, ...(entityId ? { entity_id: entityId } : {}) }, include: { steps: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' },
});

before(async () => {
  if (env.unavailable) { console.warn(`\n  ⚠ Flow engine tests skipped — ${env.reason}\n`); return; }
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) {
    env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`;
    console.warn(`\n  ⚠ Flow engine tests skipped — ${env.reason}\n`); return;
  }
  ({ flowEngineService } = require('../../src/modules/flowengine/flowengine.service'));
  ({ flowEngineRepository } = require('../../src/modules/flowengine/flowengine.repository'));
  ({ processPendingEvents, MAX_DEPTH } = require('../../src/modules/flowengine/dispatcher'));
  ({ emitFlowEvent } = require('../../src/modules/flowengine/events'));
  ({ enquiryService } = require('../../src/modules/sales/enquiry.service'));
  ({ attachmentService } = require('../../src/modules/sales/attachment.service'));
  ({ activityService } = require('../../src/modules/sales/activity.service'));
  ({ workflowService } = require('../../src/modules/sales/workflow.service'));

  const role = await prisma.role.findFirst({ where: { deleted_at: null }, select: { id: true } });
  fx.role = role;
  const mkUser = async (name, extra = {}) => {
    const u = await prisma.user.create({
      data: { name: `${name} ${suffix}`, email: `${name.toLowerCase()}-${suffix}@flow.test`, password: 'x', role_id: role.id, ...extra },
      select: { id: true, email: true },
    });
    ids.users.push(u.id);
    return u;
  };
  fx.admin = await mkUser('FlowAdmin');
  fx.customer = await prisma.customer.create({ data: { name: `FLOW CUSTOMER ${suffix}` }, select: { id: true } });

  // Part 2: people for Assign / Notify, a department with a head, a role of our own.
  fx.field = await mkUser('FlowField');
  fx.internal = await mkUser('FlowInternal'); // the built-in rule's Internal Sales person
  fx.rev = await mkUser('FlowReviewer');
  fx.other = await mkUser('FlowOther');
  fx.head = await mkUser('FlowHead');
  fx.dept = await prisma.department.create({ data: { name: `FLOW DEPT ${suffix}`, head_user_id: fx.head.id }, select: { id: true } });
  fx.d1 = await mkUser('FlowMemberOne', { department_id: fx.dept.id });
  fx.d2 = await mkUser('FlowMemberTwo', { department_id: fx.dept.id });
  fx.ownRole = await prisma.role.create({ data: { name: `FLOW ROLE ${suffix}`, slug: `flow-role-${suffix}` }, select: { id: true } });
  fx.roleUser = await mkUser('FlowRoleUser', { role_id: fx.ownRole.id });
  fx.previousInternal = (await workflowService.get()).internal_user_id ?? null;
  await workflowService.update({ internal_user_id: fx.internal.id }, admin(fx.admin));
  // Start from a clean outbox for this run's purposes: handle anything already pending.
  await drain();
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    if (fx.admin) await workflowService.update({ internal_user_id: fx.previousInternal }, admin(fx.admin));
    await prisma.flowAssignState.deleteMany({ where: { flow_id: { in: ids.flows } } });
    await prisma.approvalRequest.deleteMany({ where: { flow_id: { in: ids.flows } } }); // approvers cascade
    await prisma.flowDefinition.deleteMany({ where: { id: { in: ids.flows } } }); // versions, runs, steps cascade
    await prisma.flowEvent.deleteMany({ where: { entity_type: ENTITY } });
    const enquiryIds = ids.enquiries;
    await prisma.flowEvent.deleteMany({ where: { entity_type: 'Enquiry', entity_id: { in: enquiryIds.map(String) } } });
    await prisma.notification.deleteMany({ where: { OR: [{ user_id: { in: ids.users } }, { entity_type: 'Enquiry', entity_id: { in: enquiryIds.map(String) } }] } });
    await prisma.auditLog.deleteMany({ where: { actor_id: { in: ids.users } } });
    await prisma.enquiryActivity.deleteMany({ where: { enquiry_id: { in: enquiryIds } } });
    await prisma.enquiryAttachment.deleteMany({ where: { enquiry_id: { in: enquiryIds } } });
    await prisma.enquiryStageEvent.deleteMany({ where: { enquiry_id: { in: enquiryIds } } });
    await prisma.enquiry.deleteMany({ where: { id: { in: enquiryIds } } });
    if (fx.customer) await prisma.customer.delete({ where: { id: fx.customer.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    if (fx.dept) await prisma.department.delete({ where: { id: fx.dept.id } });
    if (fx.ownRole) await prisma.role.delete({ where: { id: fx.ownRole.id } });
  } finally {
    await prisma.$disconnect();
  }
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Flow engine: Sales reports what happens', () => {
  it('a new enquiry records "created" and "enters New" in the outbox', async () => {
    const e = await enquiryService.create({ title: `FLOW ${suffix}`, enquiry_type: 'GENERATED', customer_id: fx.customer.id }, admin(fx.admin));
    ids.enquiries.push(e.id);
    const events = await prisma.flowEvent.findMany({ where: { entity_type: 'Enquiry', entity_id: String(e.id) }, orderBy: { id: 'asc' } });
    assert.deepEqual(events.map((x) => x.type), ['ENQUIRY_CREATED', 'STAGE_ENTERED']);
    assert.deepEqual(JSON.parse(events[1].payload), { from: null, to: 'NEW' });
    assert.equal(events[0].actor_id, fx.admin.id);
    assert.equal(e.handler_id, fx.admin.id, 'still held by the raiser, as before');
  });
});

describe('Flow engine: publishing', () => {
  it('a flow with problems cannot be published; the check says why', async () => {
    const f = await newFlow({ nodes: [end], edges: [] }, 'broken');
    const c = await flowEngineService.check(f.id);
    assert.equal(c.ok, false);
    assert.ok(c.errors.some((x) => /When/.test(x.message)));
    await assert.rejects(flowEngineService.publish(f.id, admin(fx.admin)), { name: 'ValidationError' });
    assert.equal((await flowEngineService.getById(f.id)).status, 'DRAFT');
  });

  it('each publish is the next version and becomes the live one', async () => {
    const f = await newFlow(simple({ event: 'ENQUIRY_WON' }), 'versions');
    const p1 = await flowEngineService.publish(f.id, admin(fx.admin));
    assert.equal(p1.published.version, 1);
    assert.equal(p1.status, 'ACTIVE');
    assert.equal(p1.published.trigger, 'ENQUIRY_WON');
    await flowEngineService.update(f.id, { graph: simple({ event: 'ENQUIRY_LOST' }) }, admin(fx.admin));
    const p2 = await flowEngineService.publish(f.id, admin(fx.admin));
    assert.equal(p2.published.version, 2);
    assert.equal(p2.live_version_id, p2.published.id);
    const full = await flowEngineService.getById(f.id);
    assert.deepEqual(full.versions.map((v) => v.version), [2, 1]);
    assert.equal(full.draft_graph.nodes[0].data.event, 'ENQUIRY_LOST');
  });

  it('pause and resume; an active flow cannot be deleted', async () => {
    const f = await newFlow(simple({ event: 'ENQUIRY_REOPENED' }), 'pausing');
    await flowEngineService.publish(f.id, admin(fx.admin));
    await assert.rejects(flowEngineService.remove(f.id, admin(fx.admin)), { name: 'ConflictError' });
    assert.equal((await flowEngineService.pause(f.id, admin(fx.admin))).status, 'PAUSED');
    assert.equal((await flowEngineService.resume(f.id, admin(fx.admin))).status, 'ACTIVE');
    await flowEngineService.pause(f.id, admin(fx.admin));
    await flowEngineService.remove(f.id, admin(fx.admin));
    await assert.rejects(flowEngineService.getById(f.id), { name: 'NotFoundError' });
  });
});

describe('Flow engine: running flows', () => {
  it('an event starts the live flow once; every step is logged', async () => {
    const f = await newFlow(simple({ event: 'STAGE_ENTERED', stages: ['REVIEW'] }), 'review');
    await flowEngineService.publish(f.id, admin(fx.admin));
    const entity = await fire('STAGE_ENTERED', { from: 'NEW', to: 'REVIEW' });
    await drain();
    const runs = await runsFor(f.id, entity);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'DONE');
    assert.equal(runs[0].trigger, 'STAGE_ENTERED');
    assert.deepEqual(runs[0].steps.map((s) => [s.node_id, s.status]), [['start', 'DONE'], ['end', 'DONE']]);
    assert.deepEqual(JSON.parse(runs[0].steps[0].output), { handle: 'next' });
    // The event is done: a second sweep does nothing more.
    await drain();
    assert.equal((await runsFor(f.id, entity)).length, 1);
  });

  it('only for the stages it listens to', async () => {
    const f = await newFlow(simple({ event: 'STAGE_ENTERED', stages: ['COSTING_REVIEW'] }), 'costing review');
    await flowEngineService.publish(f.id, admin(fx.admin));
    const other = await fire('STAGE_ENTERED', { from: 'COSTING', to: 'OFFER_RELEASED' });
    const mine = await fire('STAGE_ENTERED', { from: 'COSTING', to: 'COSTING_REVIEW' });
    await drain();
    assert.equal((await runsFor(f.id, other)).length, 0);
    assert.equal((await runsFor(f.id, mine)).length, 1);
  });

  it('two workers at once still run it once', async () => {
    const f = await newFlow(simple({ event: 'OFFER_SENT' }), 'two workers');
    await flowEngineService.publish(f.id, admin(fx.admin));
    const entity = await fire('OFFER_SENT', { offer_value: 7200000 });
    await Promise.all([processPendingEvents(), processPendingEvents(), processPendingEvents()]);
    assert.equal((await runsFor(f.id, entity)).length, 1);
  });

  it('a paused flow does not start; resumed, it does (from then on)', async () => {
    const f = await newFlow(simple({ event: 'ENQUIRY_LOST' }), 'paused');
    await flowEngineService.publish(f.id, admin(fx.admin));
    await flowEngineService.pause(f.id, admin(fx.admin));
    const whilePaused = await fire('ENQUIRY_LOST', { from: 'NEGOTIATION' });
    await drain();
    assert.equal((await runsFor(f.id, whilePaused)).length, 0);
    await flowEngineService.resume(f.id, admin(fx.admin));
    const after = await fire('ENQUIRY_LOST', { from: 'NEGOTIATION' });
    await drain();
    assert.equal((await runsFor(f.id, after)).length, 1);
  });

  it('a run keeps the version it started with; new events use the new version', async () => {
    const f = await newFlow(simple({ event: 'ACTIVITY_LOGGED' }), 'pinned');
    const v1 = (await flowEngineService.publish(f.id, admin(fx.admin))).published;
    const first = await fire('ACTIVITY_LOGGED', { type: 'CALL' });
    await drain();
    const v2 = (await flowEngineService.publish(f.id, admin(fx.admin))).published;
    const second = await fire('ACTIVITY_LOGGED', { type: 'CALL' });
    await drain();
    assert.equal((await runsFor(f.id, first))[0].version_id, v1.id);
    assert.equal((await runsFor(f.id, second))[0].version_id, v2.id);
  });

  it('a flow never starts itself, and deep chains stop (loop guard)', async () => {
    const f = await newFlow(simple({ event: 'DOCUMENT_UPLOADED' }), 'loop guard');
    await flowEngineService.publish(f.id, admin(fx.admin));
    const own = await fire('DOCUMENT_UPLOADED', { kind: 'OFFER' }, { originFlowId: f.id, depth: 1 });
    const deep = await fire('DOCUMENT_UPLOADED', { kind: 'OFFER' }, { depth: MAX_DEPTH + 1 });
    const normal = await fire('DOCUMENT_UPLOADED', { kind: 'OFFER' });
    await drain();
    assert.equal((await runsFor(f.id, own)).length, 0);
    assert.equal((await runsFor(f.id, deep)).length, 0);
    assert.equal((await runsFor(f.id, normal)).length, 1);
    const deepEvent = await prisma.flowEvent.findFirst({ where: { entity_type: ENTITY, entity_id: deep } });
    assert.ok(deepEvent.processed_at, 'handled, not retried');
    assert.match(deepEvent.error, /deep/);
  });

  it('a failing block fails its run (logged), and the event is still handled', async () => {
    const f = await newFlow(simple({ event: 'ENQUIRY_REASSIGNED' }), 'failing');
    // A version with a block the engine does not know — only possible by going
    // round the publish check, as a stand-in for a block that errors.
    const bad = { nodes: [when({ event: 'ENQUIRY_REASSIGNED' }), { id: 'boom', type: 'boom', data: {} }], edges: [{ id: 'e', source: 'start', target: 'boom' }] };
    await flowEngineRepository.publish(f.id, { version: 1, graph: JSON.stringify(bad), trigger: 'ENQUIRY_REASSIGNED', actorId: fx.admin.id });
    const entity = await fire('ENQUIRY_REASSIGNED', {});
    await drain();
    const [run] = await runsFor(f.id, entity);
    assert.equal(run.status, 'FAILED');
    assert.match(run.error, /Unknown block type "boom"/);
    assert.deepEqual(run.steps.map((s) => [s.node_id, s.status]), [['start', 'DONE'], ['boom', 'FAILED']]);
    const ev = await prisma.flowEvent.findFirst({ where: { entity_type: ENTITY, entity_id: entity } });
    assert.ok(ev.processed_at);
  });

  it('the run log lists a flow’s runs and one run’s steps', async () => {
    const f = await newFlow(simple({ event: 'STAGE_STALLED' }), 'run log');
    await flowEngineService.publish(f.id, admin(fx.admin));
    const entity = await fire('STAGE_STALLED', { stage: 'COSTING', days: 6 });
    await drain();
    const page = await flowEngineService.runs({ flowId: f.id, skip: 0, take: 10 });
    assert.equal(page.total, 1);
    assert.equal(page.items[0].entity_id, entity);
    assert.equal(page.items[0].version.version, 1);
    const run = await flowEngineService.getRun(page.items[0].id);
    assert.equal(run.steps.length, 2);
    assert.deepEqual(run.steps[0].output, { handle: 'next' });
  });
});

describe('Flow engine: catalog', () => {
  it('Sales offers its events, stages and blocks; unknown modules are refused', async () => {
    const c = flowEngineService.catalog('SALES');
    assert.ok(c.events.some((e) => e.key === 'STAGE_ENTERED'));
    assert.equal(c.stages.find((s) => s.key === 'OFFER_RELEASED').label, 'Offer');
    assert.deepEqual(c.blocks.map((b) => b.type).sort(), ['approval', 'assign', 'end', 'if', 'notify', 'stage_switch', 'trigger']);
    assert.ok(c.fields.some((f) => f.key === 'value_inr'));
    assert.equal(c.loadEntity, undefined, 'no functions go to the browser');
    assert.throws(() => flowEngineService.catalog('PAYROLL'), { name: 'ValidationError' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Part 2 — the blocks, on real enquiries.
// ═════════════════════════════════════════════════════════════════════════════
const FULL = ['SALES_VIEW', 'SALES_CREATE', 'SALES_EDIT'];
const as = (user) => ({ id: user.id, email: user.email, permissions: FULL });
const n = (id, type, data) => ({ id, type, data, position: { x: 0, y: 0 } });
const a = (source, target, sourceHandle) => ({ id: `${source}-${sourceHandle || 'next'}-${target}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) });
const holder = async (id) => (await prisma.enquiry.findUnique({ where: { id }, select: { handler_id: true } })).handler_id;

async function newEnquiry(extra = {}) {
  const e = await enquiryService.create({ title: `FLOW ${suffix}`, enquiry_type: 'GENERATED', customer_id: fx.customer.id, ...extra }, as(fx.field));
  ids.enquiries.push(e.id);
  return e;
}

/** Field raises a Generated enquiry and sends it to Review (the format is needed). */
async function toReview(extra) {
  const e = await newEnquiry(extra);
  await attachmentService.record(e.id, {
    originalname: 'format.pdf', filename: `flow-${suffix}-${Math.random().toString(36).slice(2)}`, mimetype: 'application/pdf', size: 1,
  }, { kind: 'FORMAT_PDF' }, as(fx.field));
  await enquiryService.update(e.id, { stage: 'REVIEW' }, as(fx.field));
  return e;
}

/** A published flow that assigns, paused again after the test so the next can own the same stages. */
async function withFlow(graph, fn, name = 'assign') {
  const f = await newFlow(graph, name);
  await flowEngineService.publish(f.id, admin(fx.admin));
  try { return await fn(f); } finally { await flowEngineService.pause(f.id, admin(fx.admin)); }
}

const assignAt = (stages, assignData) => ({
  nodes: [n('start', 'trigger', { event: 'STAGE_ENTERED', stages }), n('as', 'assign', assignData)],
  edges: [a('start', 'as')],
});

describe('Flow engine part 2: Assign decides who gets each stage', () => {
  it('a person at Review — instead of the built-in Internal Sales person; logged and recorded', async () => {
    await withFlow(assignAt(['REVIEW'], { to: 'PERSON', user_id: fx.rev.id }), async (f) => {
      const e = await toReview();
      assert.equal(await holder(e.id), fx.rev.id);
      const ev = await prisma.enquiryStageEvent.findFirst({ where: { enquiry_id: e.id, to_stage: 'REVIEW' } });
      assert.equal(ev.handler_id, fx.rev.id, 'who held it at Review is kept');
      await drain();
      const [run] = await runsFor(f.id, String(e.id));
      assert.deepEqual(run.steps.map((s) => s.node_id), ['start', 'as']);
      assert.deepEqual(JSON.parse(run.steps[1].output), { handle: 'next', result: { handler_id: fx.rev.id } });
    });
  });

  it('with no flow for the stage, the built-in rule decides (unchanged)', async () => {
    const e = await toReview();
    assert.equal(await holder(e.id), fx.internal.id);
  });

  it('Which stage? and If: refurbishment Reviews to one person, the rest to another; other stages untouched', async () => {
    const graph = {
      nodes: [
        n('start', 'trigger', { event: 'STAGE_ENTERED' }),
        n('sw', 'stage_switch', { cases: [{ id: 'rev', stages: ['REVIEW'] }] }),
        n('if', 'if', { rules: [{ field: 'is_refurbishment', op: 'is_true' }] }),
        n('toOther', 'assign', { to: 'PERSON', user_id: fx.other.id }),
        n('toRev', 'assign', { to: 'PERSON', user_id: fx.rev.id }),
        n('end', 'end', {}),
      ],
      edges: [a('start', 'sw'), a('sw', 'if', 'rev'), a('sw', 'end', 'other'), a('if', 'toOther', 'yes'), a('if', 'toRev', 'no')],
    };
    await withFlow(graph, async () => {
      const refurb = await toReview({ is_refurbishment: true });
      const plain = await toReview();
      assert.equal(await holder(refurb.id), fx.other.id);
      assert.equal(await holder(plain.id), fx.rev.id);
      const fresh = await newEnquiry();
      assert.equal(fresh.handler_id, fx.field.id, 'New: no Assign on its path → the raiser, as before');
    });
  });

  it('department head', async () => {
    await withFlow(assignAt(['REVIEW'], { to: 'DEPARTMENT', department_id: fx.dept.id, pick: 'HEAD' }), async () => {
      assert.equal(await holder((await toReview()).id), fx.head.id);
    });
  });

  it('least busy member of a department', async () => {
    const busy = await newEnquiry();
    await prisma.enquiry.update({ where: { id: busy.id }, data: { handler_id: fx.d1.id } }); // d1 holds one open enquiry
    await withFlow(assignAt(['REVIEW'], { to: 'DEPARTMENT', department_id: fx.dept.id, pick: 'LEAST_BUSY' }), async () => {
      assert.equal(await holder((await toReview()).id), fx.d2.id);
    });
  });

  it('turn by turn across a department', async () => {
    await withFlow(assignAt(['REVIEW'], { to: 'DEPARTMENT', department_id: fx.dept.id, pick: 'TURN' }), async () => {
      const got = [];
      for (let i = 0; i < 3; i += 1) got.push(await holder((await toReview()).id));
      assert.deepEqual(got, [fx.d1.id, fx.d2.id, fx.d1.id]);
    });
  });

  it('a role (least busy)', async () => {
    await withFlow(assignAt(['REVIEW'], { to: 'ROLE', role_id: fx.ownRole.id, pick: 'LEAST_BUSY' }), async () => {
      assert.equal(await holder((await toReview()).id), fx.roleUser.id);
    });
  });

  it('same person as at an earlier stage', async () => {
    const graph = {
      nodes: [
        n('start', 'trigger', { event: 'STAGE_ENTERED', stages: ['REVIEW', 'CONCEPT'] }),
        n('sw', 'stage_switch', { cases: [{ id: 'r', stages: ['REVIEW'] }, { id: 'c', stages: ['CONCEPT'] }] }),
        n('rev', 'assign', { to: 'PERSON', user_id: fx.rev.id }),
        n('same', 'assign', { to: 'SAME_AS_STAGE', stage: 'REVIEW' }),
        n('end', 'end', {}),
      ],
      edges: [a('start', 'sw'), a('sw', 'rev', 'r'), a('sw', 'same', 'c'), a('sw', 'end', 'other')],
    };
    await withFlow(graph, async () => {
      const e = await toReview();
      assert.equal(await holder(e.id), fx.rev.id);
      await activityService.create(e.id, { type: 'MEETING', activity_at: new Date(), subject: 'review', is_review: true, follow_up_ended: true }, as(fx.rev));
      await enquiryService.update(e.id, { stage: 'CONCEPT' }, as(fx.rev));
      assert.equal(await holder(e.id), fx.rev.id, 'Concept goes back to whoever had Review (built-in: Internal Sales)');
    });
  });

  it('a person who has since left → the built-in rule; the flow cannot be resumed until fixed', async () => {
    const leaver = await prisma.user.create({
      data: { name: `Leaver ${suffix}`, email: `leaver-${suffix}@flow.test`, password: 'x', role_id: fx.role.id }, select: { id: true },
    });
    ids.users.push(leaver.id);
    const f = await newFlow(assignAt(['REVIEW'], { to: 'PERSON', user_id: leaver.id }), 'leaver');
    await flowEngineService.publish(f.id, admin(fx.admin));
    try {
      await prisma.user.update({ where: { id: leaver.id }, data: { status: 'INACTIVE' } });
      assert.equal(await holder((await toReview()).id), fx.internal.id);
    } finally {
      await flowEngineService.pause(f.id, admin(fx.admin));
    }
    await assert.rejects(flowEngineService.resume(f.id, admin(fx.admin)), { name: 'ValidationError' });
    const again = await newFlow(assignAt(['COSTING'], { to: 'PERSON', user_id: leaver.id }), 'leaver again');
    await assert.rejects(flowEngineService.publish(again.id, admin(fx.admin)), { name: 'ValidationError' }, 'cannot publish naming an inactive person');
  });

  it('one flow decides each stage: an overlapping assigning flow is refused', async () => {
    await withFlow(assignAt(['REVIEW', 'CONCEPT'], { to: 'OWNER' }), async () => {
      const clash = await newFlow(assignAt(['CONCEPT', 'COSTING'], { to: 'CREATOR' }), 'clash');
      await assert.rejects(flowEngineService.publish(clash.id, admin(fx.admin)), (err) => err.name === 'ConflictError' && /already assigns Concept/.test(err.message));
      const fine = await newFlow(assignAt(['COSTING'], { to: 'CREATOR' }), 'no clash');
      await flowEngineService.publish(fine.id, admin(fx.admin));
      await flowEngineService.pause(fine.id, admin(fx.admin));
    });
  });
});

describe('Flow engine part 2: Notify', () => {
  it('a late-stage loss tells the department head, in words from the record; an early loss does not', async () => {
    const graph = {
      nodes: [
        n('start', 'trigger', { event: 'ENQUIRY_LOST' }),
        n('late', 'if', { rules: [{ field: 'event.from', op: 'in', value: ['REVIEW', 'COSTING_REVIEW', 'OFFER_RELEASED'] }] }),
        n('tell', 'notify', { to: [{ who: 'DEPARTMENT_HEAD', id: fx.dept.id }], title: '{{ref_no}} lost at {{event.from}}', message: 'Reason: {{event.lost_reason}} · {{customer}}' }),
        n('end', 'end', {}),
      ],
      edges: [a('start', 'late'), a('late', 'tell', 'yes'), a('late', 'end', 'no'), a('tell', 'end')],
    };
    const f = await newFlow(graph, 'lost alert');
    await flowEngineService.publish(f.id, admin(fx.admin));
    try {
      const late = await toReview();
      const early = await newEnquiry();
      await enquiryService.lose(late.id, { lost_reason: 'Price too high' }, admin(fx.admin));
      await enquiryService.lose(early.id, { lost_reason: 'No budget' }, admin(fx.admin));
      await drain();
      const got = await prisma.notification.findMany({ where: { user_id: fx.head.id, type: 'FLOW_NOTIFY' } });
      assert.equal(got.length, 1);
      assert.equal(got[0].title, `${late.ref_no} lost at Review`);
      assert.match(got[0].body, /^Reason: Price too high · FLOW CUSTOMER/);
      assert.equal(got[0].entity_id, String(late.id));
      const [run] = await runsFor(f.id, String(late.id));
      assert.deepEqual(run.steps.map((s) => s.node_id), ['start', 'late', 'tell', 'end']);
      assert.deepEqual(JSON.parse(run.steps[2].output).result, { sent_to: [fx.head.id] });
      const [quiet] = await runsFor(f.id, String(early.id));
      assert.deepEqual(quiet.steps.map((s) => s.node_id), ['start', 'late', 'end']);
    } finally {
      await flowEngineService.pause(f.id, admin(fx.admin));
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Part 3 — the department queue ("head picks").
// ═════════════════════════════════════════════════════════════════════════════
describe('Flow engine part 3: the department queue', () => {
  const queueAtReview = () => assignAt(['REVIEW'], { to: 'DEPARTMENT', department_id: fx.dept.id, pick: 'HEAD_PICKS' });
  const queueState = (id) => prisma.enquiry.findUnique({ where: { id }, select: { handler_id: true, queue_department_id: true, queued_at: true } });

  it('sent to the department: the head holds it, it waits in their list, and they are told', async () => {
    await withFlow(queueAtReview(), async () => {
      const e = await toReview();
      const s = await queueState(e.id);
      assert.equal(s.handler_id, fx.head.id);
      assert.equal(s.queue_department_id, fx.dept.id);
      assert.ok(s.queued_at);
      const told = await prisma.notification.findFirst({ where: { user_id: fx.head.id, entity_id: String(e.id), type: 'ENQUIRY_ASSIGNED' }, orderBy: { id: 'desc' } });
      assert.match(told.body, /waiting for you to assign it to someone in your team/);

      const list = await enquiryService.teamQueue(as(fx.head));
      assert.ok(list.items.some((x) => x.id === e.id));
      const dept = list.departments.find((d) => d.id === fx.dept.id);
      assert.deepEqual(dept.team.map((u) => u.id).sort(), [fx.head.id, fx.d1.id, fx.d2.id].sort());
      assert.deepEqual(await enquiryService.teamQueue(as(fx.field)), { departments: [], items: [] }, 'not a head: nothing');
    });
  });

  it('only the head assigns, only to their team; then the member holds it and can work on it', async () => {
    await withFlow(queueAtReview(), async () => {
      const e = await toReview();
      await assert.rejects(enquiryService.assignFromQueue(e.id, { user_id: fx.d1.id }, as(fx.field)), { name: 'ForbiddenError' });
      await assert.rejects(enquiryService.assignFromQueue(e.id, { user_id: fx.rev.id }, as(fx.head)), { name: 'ValidationError' }, 'not in the department');
      await enquiryService.assignFromQueue(e.id, { user_id: fx.d1.id }, as(fx.head));
      const s = await queueState(e.id);
      assert.equal(s.handler_id, fx.d1.id);
      assert.equal(s.queue_department_id, null);
      const ev = await prisma.enquiryStageEvent.findFirst({ where: { enquiry_id: e.id, to_stage: 'REVIEW' }, orderBy: { id: 'desc' } });
      assert.equal(ev.handler_id, fx.d1.id, 'the stage records who does it');
      assert.equal(await prisma.notification.count({ where: { user_id: fx.d1.id, entity_id: String(e.id), type: 'ENQUIRY_ASSIGNED' } }), 1);
      // The member now holds it: they log the review with View alone, like any holder.
      await activityService.create(e.id, { type: 'MEETING', activity_at: new Date(), subject: 'review', is_review: true, follow_up_ended: true }, { id: fx.d1.id, email: fx.d1.email, permissions: ['SALES_VIEW'] });
      await assert.rejects(enquiryService.assignFromQueue(e.id, { user_id: fx.d2.id }, as(fx.head)), { name: 'ConflictError' }, 'no longer waiting');
    });
  });

  it('the head can keep it', async () => {
    await withFlow(queueAtReview(), async () => {
      const e = await toReview();
      await enquiryService.assignFromQueue(e.id, { user_id: fx.head.id }, as(fx.head));
      const s = await queueState(e.id);
      assert.equal(s.handler_id, fx.head.id);
      assert.equal(s.queue_department_id, null);
    });
  });

  it('the head is reminded once after 4 hours of waiting', async () => {
    const { runQueueReminders } = require('../../src/modules/sales/followup.service');
    await withFlow(queueAtReview(), async () => {
      const e = await toReview();
      const reminders = () => prisma.notification.count({ where: { user_id: fx.head.id, entity_id: String(e.id), title: { startsWith: 'Waiting for you to assign' } } });
      await runQueueReminders();
      assert.equal(await reminders(), 0, 'not yet');
      await prisma.enquiry.update({ where: { id: e.id }, data: { queued_at: new Date(Date.now() - 5 * 36e5) } });
      await runQueueReminders();
      await runQueueReminders();
      assert.equal(await reminders(), 1);
    });
  });

  it('moving on, or a reassign, takes it out of the queue', async () => {
    await withFlow(queueAtReview(), async () => {
      const moved = await toReview();
      await activityService.create(moved.id, { type: 'MEETING', activity_at: new Date(), subject: 'review', is_review: true, follow_up_ended: true }, as(fx.head));
      await enquiryService.update(moved.id, { stage: 'CONCEPT' }, as(fx.head));
      const m = await queueState(moved.id);
      assert.equal(m.queue_department_id, null);
      assert.equal(m.handler_id, fx.internal.id, 'Concept: no flow → the built-in rule');

      const reassigned = await toReview();
      await enquiryService.reassign(reassigned.id, { handler_id: fx.rev.id }, admin(fx.admin));
      const r = await queueState(reassigned.id);
      assert.equal(r.handler_id, fx.rev.id);
      assert.equal(r.queue_department_id, null);
    });
  });

  it('a department without a head → the built-in rule (no queue)', async () => {
    const headless = await prisma.department.create({ data: { name: `FLOW HEADLESS ${suffix}` }, select: { id: true } });
    try {
      await withFlow(assignAt(['REVIEW'], { to: 'DEPARTMENT', department_id: headless.id, pick: 'HEAD_PICKS' }), async () => {
        const e = await toReview();
        const s = await queueState(e.id);
        assert.equal(s.handler_id, fx.internal.id);
        assert.equal(s.queue_department_id, null);
      });
    } finally {
      await prisma.department.delete({ where: { id: headless.id } });
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Part 4 — approvals ("Before …" flows hold the action).
// ═════════════════════════════════════════════════════════════════════════════
describe('Flow engine part 4: approvals', () => {
  let approvalsService;
  before(() => { ({ approvalsService } = require('../../src/modules/flowengine/approvals.service')); });

  const upload = (enquiryId, kind, extra = {}) => attachmentService.record(enquiryId, {
    originalname: `${kind.toLowerCase()}.pdf`, filename: `flow-${suffix}-${Math.random().toString(36).slice(2)}`, mimetype: 'application/pdf', size: 1,
  }, { kind, ...extra }, admin(fx.admin));
  const sa = () => admin(fx.admin);

  /** An enquiry walked to Offer by a Super Admin, with one offer at this price (₹). */
  async function withOffer(price) {
    const e = await toReview();
    await activityService.create(e.id, { type: 'MEETING', activity_at: new Date(), subject: 'review', is_review: true, follow_up_ended: true }, sa());
    await enquiryService.update(e.id, { stage: 'CONCEPT' }, sa());
    await upload(e.id, 'CONCEPT'); await upload(e.id, 'POWER_CALC');
    await enquiryService.update(e.id, { stage: 'COSTING' }, sa());
    await upload(e.id, 'COSTING');
    await enquiryService.update(e.id, { stage: 'COSTING_REVIEW' }, sa());
    await upload(e.id, 'COSTING_REVIEW');
    await enquiryService.update(e.id, { stage: 'OFFER_RELEASED' }, sa());
    const offer = await upload(e.id, 'OFFER', { offer_value: price });
    return { e, offer };
  }

  const requestsFor = (enquiryId) => prisma.approvalRequest.findMany({ where: { entity_id: String(enquiryId) }, include: { approvers: true }, orderBy: { id: 'asc' } });
  const stageOf = async (id) => (await prisma.enquiry.findUnique({ where: { id }, select: { stage: true } })).stage;

  const bigOfferFlow = () => ({
    nodes: [
      n('start', 'trigger', { event: 'BEFORE_OFFER_SENT' }),
      n('big', 'if', { rules: [{ field: 'event.offer_value_inr', op: 'gt', value: 5000000 }] }),
      n('ok', 'approval', { to: [{ who: 'PERSON', id: fx.rev.id }] }),
      n('tell', 'notify', { to: [{ who: 'HANDLER' }], title: 'Offer for {{ref_no}} not approved', message: '{{approval.decided_by}}: {{approval.comment}}' }),
      n('end', 'end', {}),
    ],
    edges: [a('start', 'big'), a('big', 'ok', 'yes'), a('big', 'end', 'no'), a('ok', 'end', 'approved'), a('ok', 'tell', 'rejected')],
  });

  it('publish rules: Approval only in a “Before …” flow, which needs one; nothing sent before it', async () => {
    const afterWon = await newFlow({ nodes: [n('start', 'trigger', { event: 'ENQUIRY_WON' }), n('ok', 'approval', { to: [{ who: 'OWNER' }] })], edges: [a('start', 'ok')] }, 'approval after');
    assert.ok((await flowEngineService.check(afterWon.id)).errors.some((x) => /works only in a flow started by/.test(x.message)));
    const noApproval = await newFlow({ nodes: [n('start', 'trigger', { event: 'BEFORE_WON' }), n('end', 'end', {})], edges: [a('start', 'end')] }, 'no approval');
    assert.ok((await flowEngineService.check(noApproval.id)).errors.some((x) => /add one/.test(x.message)));
    const early = await newFlow({
      nodes: [n('start', 'trigger', { event: 'BEFORE_WON' }), n('tell', 'notify', { to: [{ who: 'OWNER' }], title: 'x' }), n('ok', 'approval', { to: [{ who: 'OWNER' }] })],
      edges: [a('start', 'tell'), a('tell', 'ok')],
    }, 'notify first');
    assert.ok((await flowEngineService.check(early.id)).errors.some((x) => /Notify goes after an Approval/.test(x.message)));
  });

  it('a big offer is held for approval; a small one is not; approved, it goes through once', async () => {
    await withFlow(bigOfferFlow(), async () => {
      const small = await withOffer(100000);
      await attachmentService.markSent(small.offer.id, true, sa());
      assert.equal(await stageOf(small.e.id), 'FOLLOW_UP', 'under the limit: no approval');
      assert.equal((await requestsFor(small.e.id)).length, 0);

      const big = await withOffer(7200000);
      await assert.rejects(attachmentService.markSent(big.offer.id, true, sa()),
        (err) => err.code === 'APPROVAL_REQUIRED' && /Needs approval from FlowReviewer/.test(err.message));
      assert.equal(await stageOf(big.e.id), 'OFFER_RELEASED', 'held');
      const [req] = await requestsFor(big.e.id);
      assert.equal(req.status, 'PENDING');
      assert.equal(req.action_key, `OFFER:${big.offer.id}:7200000:-`);
      assert.match(req.title, /^Mark offer sent — ENQ-/);
      assert.match(req.summary, /Offer: Rev 1 · ₹72,00,000/);
      assert.match(req.summary, /Costing value: not entered/);
      assert.deepEqual(req.approvers.map((x) => x.user_id), [fx.rev.id]);
      assert.equal(await prisma.notification.count({ where: { user_id: fx.rev.id, type: 'FLOW_APPROVAL', entity_id: String(big.e.id) } }), 1);
      const waitingRun = await prisma.flowRun.findUnique({ where: { id: req.run_id }, include: { steps: { orderBy: { id: 'asc' } } } });
      assert.equal(waitingRun.status, 'WAITING');
      assert.deepEqual(waitingRun.steps.map((s) => s.node_id), ['start', 'big', 'ok']);

      await assert.rejects(attachmentService.markSent(big.offer.id, true, sa()), (err) => err.code === 'APPROVAL_PENDING', 'asking again while it waits');
      assert.equal((await requestsFor(big.e.id)).length, 1, 'no second request');
      assert.equal((await approvalsService.list({ tab: 'waiting' }, as(fx.rev))).items.some((x) => x.id === req.id), true);
      assert.equal(await approvalsService.count(as(fx.rev)), 1);

      await approvalsService.decide(req.id, { decision: 'APPROVED', comment: 'Fine' }, as(fx.rev));
      assert.equal(await prisma.notification.count({ where: { user_id: fx.admin.id, type: 'FLOW_APPROVAL_DECIDED', entity_id: String(big.e.id) } }), 1);
      const doneRun = await prisma.flowRun.findUnique({ where: { id: req.run_id }, include: { steps: { orderBy: { id: 'asc' } } } });
      assert.equal(doneRun.status, 'DONE');
      assert.deepEqual(doneRun.steps.map((s) => s.node_id), ['start', 'big', 'ok', 'ok', 'end']);

      await attachmentService.markSent(big.offer.id, true, sa());
      assert.equal(await stageOf(big.e.id), 'FOLLOW_UP', 'approved: it went through');
      assert.ok((await prisma.approvalRequest.findUnique({ where: { id: req.id } })).consumed_at, 'used up');
    });
  });

  it('rejected (with a comment): the holder is told why; trying again asks again', async () => {
    await withFlow(bigOfferFlow(), async () => {
      const big = await withOffer(9000000);
      await assert.rejects(attachmentService.markSent(big.offer.id, true, sa()), { code: 'APPROVAL_REQUIRED' });
      const [req] = await requestsFor(big.e.id);
      await assert.rejects(approvalsService.decide(req.id, { decision: 'REJECTED' }, as(fx.rev)), { name: 'ConflictError' }, 'a reason is needed');
      await assert.rejects(approvalsService.decide(req.id, { decision: 'APPROVED' }, as(fx.other)), { name: 'ForbiddenError' }, 'not an approver');
      await approvalsService.decide(req.id, { decision: 'REJECTED', comment: 'Price too low for this spec' }, as(fx.rev));
      await assert.rejects(approvalsService.decide(req.id, { decision: 'APPROVED' }, as(fx.rev)), { name: 'ConflictError' }, 'already decided');
      const told = await prisma.notification.findFirst({ where: { type: 'FLOW_NOTIFY', entity_id: String(big.e.id) } });
      assert.equal(told.user_id, fx.internal.id, 'the holder at Offer (Internal Sales)');
      assert.equal(told.title, `Offer for ${big.e.ref_no} not approved`);
      assert.match(told.body, /FlowReviewer .*: Price too low for this spec/);
      await assert.rejects(attachmentService.markSent(big.offer.id, true, sa()), { code: 'APPROVAL_REQUIRED' }, 'asks again');
      assert.equal((await requestsFor(big.e.id)).length, 2);
    });
  });

  it('costing value: the holder sets it from Costing Review on; the margin reaches flows and the approval card', async () => {
    const lowMargin = {
      nodes: [
        n('start', 'trigger', { event: 'BEFORE_OFFER_SENT' }),
        n('low', 'if', { rules: [{ field: 'event.margin_pct', op: 'lt', value: 20 }] }),
        n('ok', 'approval', { to: [{ who: 'PERSON', id: fx.rev.id }] }),
        n('end', 'end', {}),
      ],
      edges: [a('start', 'low'), a('low', 'ok', 'yes'), a('low', 'end', 'no'), a('ok', 'end', 'approved')],
    };
    await withFlow(lowMargin, async () => {
      const { e, offer } = await withOffer(1000000);
      await assert.rejects(enquiryService.setFinalCost(e.id, { final_cost: 900000 }, as(fx.other)), { name: 'ForbiddenError' }, 'not the holder');
      await enquiryService.setFinalCost(e.id, { final_cost: 900000 }, sa());
      assert.equal(Number((await prisma.enquiry.findUnique({ where: { id: e.id } })).final_cost), 900000);

      // 10% margin of offer (11.1% on cost) → under 20% → held, with the figures on the card.
      await assert.rejects(attachmentService.markSent(offer.id, true, sa()), { code: 'APPROVAL_REQUIRED' });
      const [req] = await requestsFor(e.id);
      assert.match(req.summary, /Costing value: ₹9,00,000/);
      assert.match(req.summary, /Offer: Rev 1 · ₹10,00,000/);
      assert.match(req.summary, /Margin: ₹1,00,000 — 10% of offer · 11.1% on cost/);
      await approvalsService.decide(req.id, { decision: 'REJECTED', comment: 'Margin too thin' }, as(fx.rev));
      assert.equal(await stageOf(e.id), 'OFFER_RELEASED', 'rejected: stays at Offer to rework');

      // Reworked: a better price clears the rule, no new request needed.
      await attachmentService.setOfferValue(offer.id, 1200000, sa());
      await attachmentService.markSent(offer.id, true, sa());
      assert.equal(await stageOf(e.id), 'FOLLOW_UP');
      assert.equal((await requestsFor(e.id)).length, 1);
      await assert.rejects(enquiryService.setFinalCost(e.id, { final_cost: 1 }, sa()), { name: 'ConflictError' }, 'only Costing Review → Negotiation');
    });
  });

  it('an approval holds for those figures only: changing the price asks again', async () => {
    await withFlow(bigOfferFlow(), async () => {
      const big = await withOffer(6000000);
      await assert.rejects(attachmentService.markSent(big.offer.id, true, sa()), { code: 'APPROVAL_REQUIRED' });
      const [req] = await requestsFor(big.e.id);
      await approvalsService.decide(req.id, { decision: 'APPROVED', comment: 'ok' }, as(fx.rev));
      await attachmentService.setOfferValue(big.offer.id, 5500000, sa());
      await assert.rejects(attachmentService.markSent(big.offer.id, true, sa()), { code: 'APPROVAL_REQUIRED' }, 'new figures: asked again');
      assert.equal((await requestsFor(big.e.id)).length, 2);
    });
  });

  it('an approver doing it themselves needs no request to someone else', async () => {
    const graph = { nodes: [n('start', 'trigger', { event: 'BEFORE_STAGE_MOVE', stages: ['REVIEW'] }), n('ok', 'approval', { to: [{ who: 'PERSON', id: fx.field.id }] }), n('end', 'end', {})], edges: [a('start', 'ok'), a('ok', 'end', 'approved')] };
    await withFlow(graph, async () => {
      const e = await toReview(); // moved to Review by fx.field, the approver
      assert.equal(await stageOf(e.id), 'REVIEW');
      const [req] = await requestsFor(e.id);
      assert.equal(req.status, 'APPROVED');
      assert.equal(req.decided_by, fx.field.id);
      assert.ok(req.consumed_at);
    });
  });

  it('everyone must approve: one approval is not enough; a Super Admin can decide in their place', async () => {
    const graph = { nodes: [n('start', 'trigger', { event: 'BEFORE_STAGE_MOVE', stages: ['REVIEW'] }), n('ok', 'approval', { to: [{ who: 'DEPARTMENT', id: fx.dept.id }], mode: 'ALL' }), n('end', 'end', {})], edges: [a('start', 'ok'), a('ok', 'end', 'approved')] };
    await withFlow(graph, async () => {
      const e = await newEnquiry();
      await upload(e.id, 'FORMAT_PDF');
      await assert.rejects(enquiryService.update(e.id, { stage: 'REVIEW' }, as(fx.field)), { code: 'APPROVAL_REQUIRED' });
      const [req] = await requestsFor(e.id);
      assert.deepEqual(req.approvers.map((x) => x.user_id).sort(), [fx.d1.id, fx.d2.id].sort());
      const half = await approvalsService.decide(req.id, { decision: 'APPROVED' }, as(fx.d1));
      assert.equal(half.status, 'PENDING', 'still waiting for the other');
      await approvalsService.decide(req.id, { decision: 'APPROVED' }, as(fx.d2));
      await enquiryService.update(e.id, { stage: 'REVIEW' }, as(fx.field));
      assert.equal(await stageOf(e.id), 'REVIEW');

      const e2 = await newEnquiry();
      await upload(e2.id, 'FORMAT_PDF');
      await assert.rejects(enquiryService.update(e2.id, { stage: 'REVIEW' }, as(fx.field)), { code: 'APPROVAL_REQUIRED' });
      const [req2] = await requestsFor(e2.id);
      const decided = await approvalsService.decide(req2.id, { decision: 'APPROVED', comment: 'covering' }, sa());
      assert.equal(decided.status, 'APPROVED');
      assert.ok(decided.approvers.some((x) => x.user_id === fx.admin.id && x.is_escalation));
    });
  });

  it('reminded once after the reminder time; escalated to the Super Admins after the escalation time', async () => {
    await withFlow(bigOfferFlow(), async () => {
      const big = await withOffer(6000000);
      await assert.rejects(attachmentService.markSent(big.offer.id, true, sa()), { code: 'APPROVAL_REQUIRED' });
      const [req] = await requestsFor(big.e.id);
      const reminders = () => prisma.notification.count({ where: { user_id: fx.rev.id, entity_id: String(big.e.id), title: { startsWith: 'Reminder' } } });
      await approvalsService.sweep();
      assert.equal(await reminders(), 0, 'not yet');
      await prisma.approvalRequest.update({ where: { id: req.id }, data: { created_at: new Date(Date.now() - 5 * 36e5) } });
      await approvalsService.sweep(); await approvalsService.sweep();
      assert.equal(await reminders(), 1);
      await prisma.approvalRequest.update({ where: { id: req.id }, data: { created_at: new Date(Date.now() - 25 * 36e5) } });
      await approvalsService.sweep();
      const after = await prisma.approvalRequest.findUnique({ where: { id: req.id }, include: { approvers: true } });
      assert.ok(after.escalated_at);
      const admins = await prisma.user.findMany({ where: { status: 'ACTIVE', deleted_at: null, role: { is_system: true } }, select: { id: true } });
      for (const u of admins) assert.ok(after.approvers.some((x) => x.user_id === u.id), 'each Super Admin can now decide');
      assert.ok(after.approvers.some((x) => x.is_escalation) || admins.every((u) => u.id === fx.rev.id), 'added at escalation');
    });
  });

  it('only the people involved see a request', async () => {
    await withFlow(bigOfferFlow(), async () => {
      const big = await withOffer(8000000);
      await assert.rejects(attachmentService.markSent(big.offer.id, true, sa()), { code: 'APPROVAL_REQUIRED' });
      const [req] = await requestsFor(big.e.id);
      assert.equal((await approvalsService.get(req.id, as(fx.rev))).id, req.id);
      assert.equal((await approvalsService.get(req.id, sa())).id, req.id);
      await assert.rejects(approvalsService.get(req.id, as(fx.other)), { name: 'NotFoundError' });
      await assert.rejects(approvalsService.list({ tab: 'all' }, as(fx.rev)), { name: 'ForbiddenError' });
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Part 5 — what the builder relies on: test run, moving current enquiries, attention.
// ═════════════════════════════════════════════════════════════════════════════
describe('Flow engine part 5: test run, current enquiries, attention', () => {
  it('a test run says what each block would do — and changes nothing', async () => {
    const e = await newEnquiry();
    const f = await newFlow({
      nodes: [
        n('start', 'trigger', { event: 'STAGE_ENTERED' }),
        n('sw', 'stage_switch', { cases: [{ id: 'r', label: 'Review', stages: ['REVIEW'] }] }),
        n('turn', 'assign', { to: 'DEPARTMENT', department_id: fx.dept.id, pick: 'TURN' }),
        n('tell', 'notify', { to: [{ who: 'OWNER' }], title: '{{ref_no}} is at {{event.to}}' }),
        n('end', 'end', {}),
      ],
      edges: [a('start', 'sw'), a('sw', 'turn', 'r'), a('sw', 'end', 'other'), a('turn', 'tell'), a('tell', 'end')],
    }, 'test run');
    const before = await prisma.flowAssignState.count({ where: { flow_id: f.id } });
    const notesBefore = await prisma.notification.count({ where: { entity_id: String(e.id) } });
    const r = await flowEngineService.test(f.id, { entity_id: e.id, payload: { to: 'REVIEW' } });
    assert.equal(r.starts, true);
    assert.deepEqual(r.steps.map((s) => s.node_id), ['start', 'sw', 'turn', 'tell', 'end']);
    assert.equal(r.steps[1].text, 'Review → “Review”');
    assert.match(r.steps[2].text, /^Would go to FlowMemberOne/);
    assert.match(r.steps[3].text, /^Would notify FlowField/);
    assert.equal(r.steps[3].result.title, `${e.ref_no} is at Review`);
    assert.equal(await prisma.flowAssignState.count({ where: { flow_id: f.id } }), before, 'turn by turn: no turn taken');
    assert.equal(await prisma.notification.count({ where: { entity_id: String(e.id) } }), notesBefore, 'nothing sent');
    assert.equal((await holder(e.id)), fx.field.id, 'nothing assigned');
    const other = await flowEngineService.test(f.id, { entity_id: e.id, payload: { to: 'COSTING' } });
    assert.deepEqual(other.steps.map((s) => s.node_id), ['start', 'sw', 'end']);
  });

  it('a test run of a “Before …” flow stops at the Approval, or follows the way you assume', async () => {
    const e = await newEnquiry();
    const f = await newFlow({
      nodes: [n('start', 'trigger', { event: 'BEFORE_LOST' }), n('ok', 'approval', { to: [{ who: 'PERSON', id: fx.rev.id }] }), n('tell', 'notify', { to: [{ who: 'OWNER' }], title: 'Lost refused' }), n('end', 'end', {})],
      edges: [a('start', 'ok'), a('ok', 'end', 'approved'), a('ok', 'tell', 'rejected'), a('tell', 'end')],
    }, 'test approval');
    const stop = await flowEngineService.test(f.id, { entity_id: e.id, payload: { lost_reason: 'x' } });
    assert.deepEqual(stop.steps.map((s) => s.node_id), ['start', 'ok']);
    assert.match(stop.steps[1].text, /^Would hold it for approval by FlowReviewer/);
    const rejected = await flowEngineService.test(f.id, { entity_id: e.id, payload: {}, assume: 'rejected' });
    assert.deepEqual(rejected.steps.map((s) => s.node_id), ['start', 'ok', 'tell', 'end']);
    assert.equal((await prisma.approvalRequest.count({ where: { flow_id: f.id } })), 0, 'nothing asked');
  });

  it('after publishing, the current enquiries the new rule would move are listed — and moved only when chosen', async () => {
    const waiting = await toReview(); // with Internal Sales (built-in rule)
    const other = await toReview();
    assert.equal(await holder(waiting.id), fx.internal.id);
    await withFlow(assignAt(['REVIEW'], { to: 'PERSON', user_id: fx.rev.id }), async (f) => {
      assert.equal(await holder(waiting.id), fx.internal.id, 'publishing moves nothing by itself');
      const { items } = await flowEngineService.affected(f.id);
      const mine = items.filter((x) => x.id === waiting.id || x.id === other.id);
      assert.equal(mine.length, 2);
      assert.equal(mine[0].next, `FlowReviewer ${suffix}`);
      const r = await flowEngineService.moveCurrent(f.id, { entity_ids: [waiting.id] }, admin(fx.admin));
      assert.equal(r.moved, 1);
      assert.equal(await holder(waiting.id), fx.rev.id);
      assert.equal(await holder(other.id), fx.internal.id, 'not chosen: left as it was');
      assert.ok(await prisma.notification.findFirst({ where: { user_id: fx.rev.id, entity_id: String(waiting.id), type: 'ENQUIRY_ASSIGNED' } }));
      assert.ok((await flowEngineService.affected(f.id)).items.every((x) => x.id !== waiting.id), 'now right: not listed again');
    });
  });

  it('a live flow naming someone who has left is flagged', async () => {
    const leaver = await prisma.user.create({ data: { name: `Gone ${suffix}`, email: `gone-${suffix}@flow.test`, password: 'x', role_id: fx.role.id }, select: { id: true } });
    ids.users.push(leaver.id);
    const graph = { nodes: [n('start', 'trigger', { event: 'ENQUIRY_WON' }), n('tell', 'notify', { to: [{ who: 'PERSON', id: leaver.id }], title: 'Won' })], edges: [a('start', 'tell')] };
    const f = await newFlow(graph, 'attention');
    await flowEngineService.publish(f.id, admin(fx.admin));
    try {
      assert.deepEqual((await flowEngineService.getById(f.id)).attention, []);
      await prisma.user.update({ where: { id: leaver.id }, data: { status: 'INACTIVE' } });
      const full = await flowEngineService.getById(f.id);
      assert.match(full.attention[0], new RegExp(`^Gone ${suffix} is inactive`));
      const listed = await flowEngineService.list({ module: 'SALES', skip: 0, take: 200 });
      assert.ok(listed.items.find((x) => x.id === f.id).attention.length);
    } finally {
      await flowEngineService.pause(f.id, admin(fx.admin));
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Parts 6–7 — the enquiry's Flows section, the run log, the ready-made flows.
// ═════════════════════════════════════════════════════════════════════════════
describe('Flow engine parts 6–7: what ran on an enquiry; the ready-made flows', () => {
  const { STARTER_FLOWS } = require('../../src/modules/flowengine/starterFlows');
  const handoffs = () => STARTER_FLOWS.find((f) => /hand-offs/.test(f.name)).graph;

  it('the ready-made hand-offs flow gives the same person as today at every stage', async () => {
    await withFlow(handoffs(), async (f) => {
      const e = await toReview();
      assert.equal(e.handler_id, fx.field.id, 'New: the raiser');
      assert.equal(await holder(e.id), fx.internal.id, 'Review: the Internal Sales person in Setup');
      await activityService.create(e.id, { type: 'MEETING', activity_at: new Date(), subject: 'review', is_review: true, follow_up_ended: true }, as(fx.internal));
      await enquiryService.update(e.id, { stage: 'CONCEPT' }, as(fx.internal));
      assert.equal(await holder(e.id), fx.internal.id, 'Concept: still Internal Sales');
      await enquiryService.lose(e.id, { lost_reason: 'test' }, as(fx.internal));
      assert.equal(await holder(e.id), fx.field.id, 'Lost: back to the owner');
      await drain();
      const runs = await runsFor(f.id, String(e.id));
      assert.ok(runs.length >= 3, 'each stage move ran the flow (logged)');

      // No Internal Sales person in Setup → the owner, exactly as the built-in rule.
      await workflowService.update({ internal_user_id: null }, admin(fx.admin));
      try {
        const e2 = await toReview();
        assert.equal(await holder(e2.id), fx.field.id);
      } finally {
        await workflowService.update({ internal_user_id: fx.internal.id }, admin(fx.admin));
      }
    }, 'starter hand-offs');
  });

  it('the starter drafts: hand-offs is ready to publish; the others need their people chosen', async () => {
    for (const s of STARTER_FLOWS) {
      const f = await newFlow(s.graph, `starter ${s.name}`);
      const c = await flowEngineService.check(f.id);
      if (/hand-offs/.test(s.name)) assert.deepEqual(c.errors, []);
      else assert.ok(c.errors.length && c.errors.every((x) => /choose from the list/.test(x.message)), s.name);
    }
  });

  it('an enquiry’s Flows section says what flows did, in words — only for people who can see it', async () => {
    await withFlow(assignAt(['REVIEW'], { to: 'PERSON', user_id: fx.rev.id }), async () => {
      const e = await toReview();
      await drain();
      const act = await enquiryService.flowActivity(e.id, as(fx.field));
      const run = act.runs.find((r) => r.trigger === 'Enquiry enters a stage');
      assert.ok(run);
      assert.ok(run.steps.includes(`Assigned to FlowReviewer ${suffix}`));
      await assert.rejects(enquiryService.flowActivity(e.id, { id: fx.other.id, permissions: ['SALES_VIEW_OWN'] }), { name: 'NotFoundError' });
    });
  });

  it('the run log names each enquiry', async () => {
    await withFlow(assignAt(['REVIEW'], { to: 'PERSON', user_id: fx.rev.id }), async (f) => {
      const e = await toReview();
      await drain();
      const page = await flowEngineService.runs({ flowId: f.id, skip: 0, take: 10 });
      assert.equal(page.items[0].entity_label, `${e.ref_no} · ${e.title}`);
    });
  });

  it('in a “Before moving to a stage” flow, Which stage? sees the stage being entered (each stage its own approver)', async () => {
    const graph = {
      nodes: [
        n('start', 'trigger', { event: 'BEFORE_STAGE_MOVE', stages: ['REVIEW', 'CONCEPT'] }),
        n('which', 'stage_switch', { cases: [{ id: 'r', label: 'To Review', stages: ['REVIEW'] }, { id: 'c', label: 'To Concept', stages: ['CONCEPT'] }] }),
        n('okReview', 'approval', { to: [{ who: 'PERSON', id: fx.rev.id }] }),
        n('okConcept', 'approval', { to: [{ who: 'PERSON', id: fx.other.id }] }),
        n('end', 'end', {}),
      ],
      edges: [a('start', 'which'), a('which', 'okReview', 'r'), a('which', 'okConcept', 'c'), a('which', 'end', 'other'),
        a('okReview', 'end', 'approved'), a('okConcept', 'end', 'approved')],
    };
    await withFlow(graph, async () => {
      const e = await newEnquiry();
      await attachmentService.record(e.id, { originalname: 'f.pdf', filename: `flow-${suffix}-${Math.random().toString(36).slice(2)}`, mimetype: 'application/pdf', size: 1 }, { kind: 'FORMAT_PDF' }, as(fx.field));
      // Leaving New for Review: the Review approver is asked (not "other", not the Concept one).
      await assert.rejects(enquiryService.update(e.id, { stage: 'REVIEW' }, as(fx.field)), (err) => err.code === 'APPROVAL_REQUIRED' && /FlowReviewer/.test(err.message));
      const t = await flowEngineService.test((await prisma.flowDefinition.findFirst({ where: { name: { startsWith: 'assign' }, status: 'ACTIVE' }, orderBy: { id: 'desc' }, select: { id: true } })).id, { entity_id: e.id, payload: { from: 'NEW', to: 'REVIEW' } });
      assert.equal(t.steps[1].text, 'Review → “To Review”');
    });
  });

  it('a draft can be test-run before its people are chosen — it says what is missing', async () => {
    const e = await newEnquiry();
    const f = await newFlow({
      nodes: [
        n('start', 'trigger', { event: 'STAGE_ENTERED' }),
        n('dept', 'assign', { to: 'DEPARTMENT', pick: 'HEAD_PICKS' }), // no department chosen yet
      ],
      edges: [a('start', 'dept')],
    }, 'unfinished');
    const r = await flowEngineService.test(f.id, { entity_id: e.id, payload: { to: 'REVIEW' } });
    assert.ok(r.problems.some((x) => /choose the department/.test(x.message)));
    assert.equal(r.steps[1].text, 'Nobody active to give it to — the built-in rule would decide');
    const notify = await newFlow({
      nodes: [n('start', 'trigger', { event: 'ENQUIRY_CREATED' }), n('tell', 'notify', { to: [{ who: 'DEPARTMENT_HEAD' }], title: 'x' })],
      edges: [a('start', 'tell')],
    }, 'unfinished notify');
    const r2 = await flowEngineService.test(notify.id, { entity_id: e.id });
    assert.equal(r2.steps[1].text, 'Would notify nobody (no active person matches)');
  });
});
