/**
 * Issues (the issue logger) — the rules, against a real database.
 *
 * Creates its own users, department and issues and removes them after. Email
 * and browser push are off before the app loads. Never run against production.
 *
 * Run:  npm run test:issues
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.EMAIL_NOTIFICATIONS = 'false';
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run against production'; }

const it = (name, fn) => test(name, async (t) => {
  if (env.unavailable) return t.skip(env.reason);
  return fn(t);
});

let prisma; let issueService;
const fx = {};
const userIds = [];
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

const as = (user, permissions = []) => ({ id: user.id, name: user.name, email: user.email, permissions });
const raise = (by, extra = {}) => issueService.create({
  type: 'QUESTION', title: `TEST ISSUE ${suffix}`, description: 'Need the drawing', watcher_ids: [], ...extra,
}, [], as(by));
const notified = (userId, type, issueId) => prisma.notification.count({ where: { user_id: userId, type, entity_type: 'Issue', entity_id: String(issueId) } });

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) {
    env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return;
  }
  ({ issueService } = require('../../src/modules/issues/issue.service'));
  const role = await prisma.role.findFirst({ where: { deleted_at: null, is_system: false }, select: { id: true } });
  const mk = async (name, extra = {}) => {
    const u = await prisma.user.create({
      data: { name: `${name} ${suffix}`, email: `${name.toLowerCase()}-${suffix}@issues.test`, password: 'x', role_id: role.id, ...extra },
      select: { id: true, name: true, email: true },
    });
    userIds.push(u.id);
    return u;
  };
  fx.sales = await mk('Sales');
  fx.head = await mk('Head');
  fx.design = await mk('Designer');
  fx.other = await mk('Other');
  fx.dept = await prisma.department.create({ data: { name: `TEST DESIGN ${suffix}`, head_user_id: fx.head.id }, select: { id: true } });
  fx.noHead = await prisma.department.create({ data: { name: `TEST NOHEAD ${suffix}` }, select: { id: true } });
  await prisma.user.update({ where: { id: fx.design.id }, data: { department_id: fx.dept.id } });
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    const issues = await prisma.issue.findMany({ where: { raised_by_id: { in: userIds } }, select: { id: true } });
    const ids = issues.map((i) => i.id);
    await prisma.notification.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { entity_type: 'Issue', entity_id: { in: ids.map(String) } }] } });
    await prisma.auditLog.deleteMany({ where: { actor_id: { in: userIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { department_id: null } });
    await prisma.department.deleteMany({ where: { id: { in: [fx.dept?.id, fx.noHead?.id].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await prisma.$disconnect();
  }
});

describe('Issues: raising', () => {
  it('goes to a person, numbered ISS-YYYY-NNNN, with the record it was raised on', async () => {
    const i = await raise(fx.sales, { assignee_id: fx.design.id, module: 'sales', entity_type: 'Enquiry', entity_id: '42', entity_label: 'ENQ-2026-0042 · Heater' });
    assert.match(i.ref_no, /^ISS-\d{4}-\d{4}$/);
    assert.equal(i.status, 'OPEN');
    assert.equal(i.assignee_id, fx.design.id);
    assert.equal(i.entity_label, 'ENQ-2026-0042 · Heater');
    assert.equal(await notified(fx.design.id, 'ISSUE_ASSIGNED', i.id), 1);
  });

  it('needs a person or a department, not yourself; a department needs a head', async () => {
    await assert.rejects(raise(fx.sales), { name: 'ValidationError' });
    await assert.rejects(raise(fx.sales, { assignee_id: fx.sales.id }), { name: 'ValidationError' });
    await assert.rejects(raise(fx.sales, { department_id: fx.noHead.id }), { name: 'ValidationError' });
  });

  it('to a department: it waits in the queue and the head is told; the head assigns it in the team', async () => {
    const i = await raise(fx.sales, { department_id: fx.dept.id });
    assert.equal(i.assignee_id, null);
    assert.equal(i.department_id, fx.dept.id);
    assert.equal(await notified(fx.head.id, 'ISSUE_ASSIGNED', i.id), 1);
    assert.equal((await issueService.summary(as(fx.head))).queue >= 1, true);
    const queue = await issueService.list({ tab: 'queue', skip: 0, take: 50 }, as(fx.head));
    assert.ok(queue.items.some((x) => x.id === i.id));

    await assert.rejects(issueService.getById(i.id, as(fx.other)), { name: 'NotFoundError' }, 'others cannot see it');
    const r = await issueService.assign(i.id, { assignee_id: fx.design.id }, as(fx.head));
    assert.equal(r.assignee_id, fx.design.id);
    assert.equal(r.department_id, fx.dept.id, 'stays the department’s — the head keeps sight of it');
    assert.equal(await notified(fx.design.id, 'ISSUE_ASSIGNED', i.id), 1);
  });

  it('a Portal bug with nobody chosen goes to the portal administrator', async () => {
    const admin = await prisma.user.findFirst({ where: { status: 'ACTIVE', deleted_at: null, role: { is_system: true } }, orderBy: { id: 'asc' }, select: { id: true } });
    if (!admin) return;
    const i = await raise(fx.sales, { type: 'BUG', title: `TEST BUG ${suffix}` });
    assert.equal(i.assignee_id, admin.id);
  });
});

describe('Issues: working it through to closed', () => {
  let id;
  it('only whoever it is with starts and resolves it (saying how)', async () => {
    id = (await raise(fx.sales, { assignee_id: fx.design.id })).id;
    await assert.rejects(issueService.start(id, as(fx.sales)), { name: 'ForbiddenError' });
    assert.equal((await issueService.start(id, as(fx.design))).status, 'IN_PROGRESS');
    await assert.rejects(issueService.resolve(id, { resolution: 'x' }, as(fx.sales)), { name: 'ForbiddenError' });
    const r = await issueService.resolve(id, { resolution: 'Drawing shared' }, as(fx.design));
    assert.equal(r.status, 'RESOLVED');
    assert.equal(await notified(fx.sales.id, 'ISSUE_RESOLVED', id), 1);
    assert.equal((await issueService.summary(as(fx.sales))).to_confirm >= 1, true);
  });

  it('only whoever raised it closes or reopens it; a reopen goes back to the same person', async () => {
    await assert.rejects(issueService.close(id, {}, as(fx.design)), { name: 'ForbiddenError' });
    const re = await issueService.reopen(id, { note: 'Wrong revision' }, as(fx.sales));
    assert.equal(re.status, 'OPEN');
    assert.equal(re.assignee_id, fx.design.id);
    assert.equal(re.reopened_count, 1);
    await issueService.resolve(id, { resolution: 'R2 shared' }, as(fx.design));
    const c = await issueService.close(id, { note: 'Thanks' }, as(fx.sales));
    assert.equal(c.status, 'CLOSED');
    await assert.rejects(issueService.comment(id, { body: 'one more' }, [], as(fx.sales)), { name: 'ForbiddenError' }, 'closed: reopen to continue');
    const events = c.comments.filter((x) => x.kind === 'EVENT').map((x) => x.body);
    assert.ok(events.some((b) => b.startsWith('Reopened')));
    assert.ok(events.some((b) => b.startsWith('Closed')));
  });

  it('replies reach everyone involved; a watcher sees it and is told', async () => {
    const i = await raise(fx.sales, { assignee_id: fx.design.id, watcher_ids: [fx.other.id] });
    assert.ok(await issueService.getById(i.id, as(fx.other)));
    await issueService.comment(i.id, { body: 'Any update?' }, [], as(fx.sales));
    assert.equal(await notified(fx.design.id, 'ISSUE_COMMENT', i.id), 1);
    assert.equal(await notified(fx.other.id, 'ISSUE_COMMENT', i.id) >= 1, true);
    assert.equal(await notified(fx.sales.id, 'ISSUE_COMMENT', i.id), 0, 'not the person who wrote it');
    await assert.rejects(issueService.comment(i.id, { body: '' }, [], as(fx.sales)), { name: 'ValidationError' });
  });

  it('only whoever raised it cancels it; others cannot move someone else’s issue', async () => {
    const i = await raise(fx.sales, { assignee_id: fx.design.id, watcher_ids: [fx.other.id] });
    await assert.rejects(issueService.assign(i.id, { assignee_id: fx.head.id }, as(fx.other)), { name: 'ForbiddenError' });
    await assert.rejects(issueService.cancel(i.id, { note: 'x' }, as(fx.design)), { name: 'ForbiddenError' });
    assert.equal((await issueService.cancel(i.id, { note: 'Not needed' }, as(fx.sales))).status, 'CANCELLED');
  });

  it('Issues → View sees all; Issues → Edit manages any issue', async () => {
    const i = await raise(fx.sales, { assignee_id: fx.design.id });
    await assert.rejects(issueService.list({ tab: 'all', skip: 0, take: 10 }, as(fx.other)), { name: 'ForbiddenError' });
    const all = await issueService.list({ tab: 'all', search: `TEST ISSUE ${suffix}`, skip: 0, take: 100 }, as(fx.other, ['ISSUE_VIEW']));
    assert.ok(all.items.some((x) => x.id === i.id));
    const moved = await issueService.assign(i.id, { department_id: fx.dept.id }, as(fx.other, ['ISSUE_EDIT', 'ISSUE_VIEW']));
    assert.equal(moved.assignee_id, null);
  });

  it('a record shows only the issues you can see on it', async () => {
    const mine = await raise(fx.sales, { assignee_id: fx.design.id, entity_type: 'Enquiry', entity_id: `9${suffix}`.slice(0, 12) });
    const q = { tab: 'record', entity_type: 'Enquiry', entity_id: mine.entity_id, skip: 0, take: 10 };
    assert.equal((await issueService.list(q, as(fx.sales))).total, 1);
    assert.equal((await issueService.list(q, as(fx.other))).total, 0);
  });
});
