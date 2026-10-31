/**
 * Reporting manager and organisation chart, through the users service and the
 * database: set / clear Reports to, loops and inactive managers refused, and
 * the chart following Reports to, else the department head.
 *
 * Run:  node --test --test-concurrency=1 tests/integration/orgChart.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const env = { unavailable: false, reason: '' };
let prisma; let usersService;
const suffix = Date.now().toString(36);
const ids = { users: [], depts: [] };
const fx = {};
const actor = { id: null, is_system: true };

before(async () => {
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) {
    env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`;
    console.warn(`\n  ⚠ Org chart tests skipped — ${env.reason}\n`); return;
  }
  ({ usersService } = require('../../src/modules/users/users.service'));
  const role = await prisma.role.findFirst({ where: { deleted_at: null }, select: { id: true } });
  const mk = async (name, extra = {}) => {
    const u = await prisma.user.create({ data: { name: `${name} ${suffix}`, email: `${name.toLowerCase()}-${suffix}@org.test`, password: 'x', role_id: role.id, ...extra }, select: { id: true } });
    ids.users.push(u.id); return u.id;
  };
  fx.md = await mk('OrgMD');
  fx.sales = (await prisma.department.create({ data: { name: `ORG SALES ${suffix}` }, select: { id: true } })).id; ids.depts.push(fx.sales);
  fx.head = await mk('OrgHead', { department_id: fx.sales });
  await prisma.department.update({ where: { id: fx.sales }, data: { head_user_id: fx.head } });
  fx.mgr = await mk('OrgManager', { department_id: fx.sales });
  fx.eng = await mk('OrgEngineer', { department_id: fx.sales });
  fx.inside = await mk('OrgInside', { department_id: fx.sales });
  fx.gone = await mk('OrgGone', { status: 'INACTIVE' });
});

after(async () => {
  if (!prisma || env.unavailable) return;
  await prisma.user.updateMany({ where: { id: { in: ids.users } }, data: { reports_to_id: null } });
  await prisma.department.updateMany({ where: { id: { in: ids.depts } }, data: { head_user_id: null } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.department.deleteMany({ where: { id: { in: ids.depts } } });
});

describe('reporting manager and organisation chart', () => {
  it('sets reports to, refuses loops, oneself and inactive people, and clears', async (t) => {
    if (env.unavailable) return t.skip(env.reason);
    await usersService.update(fx.head, { reports_to_id: fx.md }, actor);
    await usersService.update(fx.mgr, { reports_to_id: fx.head }, actor);
    const eng = await usersService.update(fx.eng, { reports_to_id: fx.mgr }, actor);
    assert.equal(eng.reports_to_id, fx.mgr);
    assert.equal(eng.reports_to.id, fx.mgr, 'the list shows who');

    await assert.rejects(usersService.update(fx.mgr, { reports_to_id: fx.mgr }, actor), (e) => /themselves/.test(e.details?.[0]?.message));
    await assert.rejects(usersService.update(fx.md, { reports_to_id: fx.eng }, actor), (e) => /loop/.test(e.details?.[0]?.message), 'the MD under someone far below');
    await assert.rejects(usersService.update(fx.head, { reports_to_id: fx.inside }, actor), (e) => /loop/.test(e.details?.[0]?.message), 'below them through the department head');
    await assert.rejects(usersService.update(fx.eng, { reports_to_id: fx.gone }, actor), (e) => /active/.test(e.details?.[0]?.message));

    const cleared = await usersService.update(fx.eng, { reports_to_id: null }, actor);
    assert.equal(cleared.reports_to_id, null);
    await usersService.update(fx.eng, { reports_to_id: fx.mgr }, actor);
  });

  it('the chart: reports to, else the department head; the top; head of', async (t) => {
    if (env.unavailable) return t.skip(env.reason);
    const chart = await usersService.orgChart();
    const p = Object.fromEntries(chart.people.filter((x) => ids.users.includes(x.id)).map((x) => [x.id, x]));
    assert.deepEqual([p[fx.eng].manager_id, p[fx.eng].manager_basis], [fx.mgr, 'REPORTS_TO']);
    assert.deepEqual([p[fx.inside].manager_id, p[fx.inside].manager_basis], [fx.head, 'DEPARTMENT_HEAD']);
    assert.deepEqual([p[fx.head].manager_id, p[fx.head].head_of], [fx.md, [`ORG SALES ${suffix}`]]);
    assert.ok(chart.roots.includes(fx.md), 'the MD is at the top');
    assert.equal(p[fx.md].reports_count, 1);
    assert.equal(p[fx.head].reports_count, 2, 'the manager (reports to) and the inside person (department)');
    assert.ok(!chart.people.some((x) => x.id === fx.gone), 'inactive people are not on the chart');
    assert.ok(!('password' in p[fx.md]), 'no password in the chart');
  });
});
