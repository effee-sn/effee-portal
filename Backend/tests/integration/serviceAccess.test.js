/**
 * Who sees the Service app, and who may manage a ticket's departments — pinned down.
 *
 *   - `service_access` on /auth/me: a service permission, or service work
 *     assigned to the user (a ticket in "My Tickets", an open department task).
 *     Someone with neither (e.g. a sales-only user) doesn't see Service.
 *   - Adding / dispatching / redirecting departments needs SERVICE_EDIT;
 *     SERVICE_VIEW alone can watch but not re-route.
 *
 * Needs a development/test DATABASE_URL; removes everything it creates.
 *
 * Run:  npm run test:service-access
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.EMAIL_NOTIFICATIONS = 'false';
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }

const it = (name, fn) => test(name, async (t) => {
  if (env.unavailable) return t.skip(env.reason);
  return fn(t);
});

let prisma; let authService; let deptTaskService;
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const made = { users: [], roles: [], tickets: [] };

/** A role holding exactly these permission codes, and a user in it. */
async function personWith(codes, label) {
  const role = await prisma.role.create({ data: { name: `SA ${label} ${suffix}`, slug: `sa-${label}-${suffix}` } });
  made.roles.push(role.id);
  const perms = await prisma.permission.findMany({ where: { code: { in: codes } }, select: { id: true } });
  if (perms.length) {
    await prisma.rolePermission.createMany({ data: perms.map((p) => ({ role_id: role.id, permission_id: p.id, allowed: true })) });
  }
  const user = await prisma.user.create({
    data: { name: `SA ${label}`, email: `sa-${label}-${suffix}@access.test`, password: 'x', role_id: role.id },
  });
  made.users.push(user.id);
  return { user, actor: { id: user.id, email: user.email, role_id: role.id, department_id: null, is_system: false, permissions: codes } };
}

async function newTicket(extra = {}) {
  const t = await prisma.serviceTicket.create({
    data: {
      ticket_id: `SA-${suffix}-${made.tickets.length}`, ticket_type: 'CALL', company_name: 'Access Test Co',
      reported_by: 'test', issue_title: 'access test', issue_description: 'access test', issue_severity: 'LOW', ...extra,
    },
  });
  made.tickets.push(t.id);
  return t;
}

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  ({ authService } = require('../../src/modules/auth/auth.service'));
  ({ deptTaskService } = require('../../src/modules/service/deptTask.service'));
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await prisma.ticketParticipant.deleteMany({ where: { ticket_id: { in: made.tickets } } });
    await prisma.ticketDepartmentTask.deleteMany({ where: { ticket_id: { in: made.tickets } } });
    await prisma.serviceTicket.deleteMany({ where: { id: { in: made.tickets } } });
    await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    await prisma.rolePermission.deleteMany({ where: { role_id: { in: made.roles } } });
    await prisma.role.deleteMany({ where: { id: { in: made.roles } } });
  } finally { await prisma.$disconnect(); }
});

describe('Service access', () => {
  it('no service permission and nothing assigned: no Service app', async () => {
    const { user } = await personWith(['SALES_VIEW'], 'sales');
    assert.equal((await authService.getMe(user.id)).service_access, false);
  });

  it('any service permission shows it (even create-only)', async () => {
    const { user } = await personWith(['SERVICE_CREATE'], 'creator');
    assert.equal((await authService.getMe(user.id)).service_access, true);
  });

  it('no permission, but a ticket assigned or participated in: shown', async () => {
    const { user } = await personWith([], 'assignee');
    const ticket = await newTicket({ assigned_user_id: user.id });
    assert.equal((await authService.getMe(user.id)).service_access, true, 'assigned directly');

    await prisma.serviceTicket.update({ where: { id: ticket.id }, data: { assigned_user_id: null } });
    assert.equal((await authService.getMe(user.id)).service_access, false, 'gone once unassigned');

    await prisma.ticketParticipant.create({ data: { ticket_id: ticket.id, user_id: user.id, user_name: user.name, stage_label: 'test' } });
    assert.equal((await authService.getMe(user.id)).service_access, true, 'a participant keeps it');
  });

  it('managing departments needs SERVICE_EDIT, not just SERVICE_VIEW', async () => {
    const ticket = await newTicket();
    const dept = await prisma.department.findFirst({ where: { deleted_at: null }, select: { id: true } });
    const viewer = await personWith(['SERVICE_VIEW'], 'viewer');
    await assert.rejects(
      deptTaskService.addTask(ticket.id, { department_id: dept?.id ?? 1, issue_note: 'x' }, viewer.actor),
      { name: 'ForbiddenError' },
    );
    if (!dept) return; // nothing more to prove without a department
    const editor = await personWith(['SERVICE_VIEW', 'SERVICE_EDIT'], 'editor');
    const tasks = await deptTaskService.addTask(ticket.id, { department_id: dept.id, issue_note: 'x' }, editor.actor);
    assert.ok(Array.isArray(tasks) ? tasks.length : tasks);
  });
});
