/**
 * Projects (with their cost), department codes and a subassembly's
 * department — pinned down.
 *
 * Needs a development/test DATABASE_URL; removes what it creates.
 * Run:  npm run test:projects
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }
const it = (name, fn) => test(name, async (t) => (env.unavailable ? t.skip(env.reason) : fn(t)));

let prisma; let projects; let departments; let subs;
const tag = `PJ${Date.now().toString().slice(-6)}`;
const actor = { id: null, email: 'projects-test@local', is_system: true, permissions: [] };
const made = { projects: [], depts: [], subs: [] };

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  ({ projectService: projects } = require('../../src/modules/projects/project.service'));
  ({ departmentService: departments } = require('../../src/modules/department/department.service'));
  ({ subassemblyService: subs } = require('../../src/modules/master/subassembly.service'));
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await prisma.project.deleteMany({ where: { id: { in: made.projects } } });
    const subItems = (await prisma.subassembly.findMany({ where: { id: { in: made.subs } }, select: { material_id: true } })).map((x) => x.material_id).filter(Boolean);
    await prisma.subassemblyItem.deleteMany({ where: { subassembly_id: { in: made.subs } } });
    await prisma.subassemblyRevision.deleteMany({ where: { subassembly_id: { in: made.subs } } });
    await prisma.subassembly.deleteMany({ where: { id: { in: made.subs } } });
    await prisma.material.deleteMany({ where: { id: { in: subItems } } });
    await prisma.department.deleteMany({ where: { id: { in: made.depts } } });
  } finally { await prisma.$disconnect(); }
});

describe('Projects', () => {
  it('a project has a cost, entered on it, in a currency of the master', async () => {
    const p = await projects.create({ name: `TEST ${tag}`, cost: 1250000.5, cost_currency: 'INR' }, actor);
    made.projects.push(p.id);
    assert.equal(Number(p.cost), 1250000.5);
    assert.equal(p.cost_currency, 'INR');
    assert.equal(p.machines, undefined, 'no machines any more');
    const changed = await projects.update(p.id, { cost: 990000 }, actor);
    assert.equal(Number(changed.cost), 990000);
    const cleared = await projects.update(p.id, { cost: null }, actor);
    assert.equal(cleared.cost, null, 'blank clears it');
    await assert.rejects(projects.update(p.id, { cost_currency: 'XYZ' }, actor), { name: 'ValidationError' }, 'not in the currency master');
    const h = await projects.history(p.id, {});
    assert.ok(h.total >= 3, 'created + two changes');
    assert.equal(h.items[0].action, 'UPDATE', 'newest first');
  });

  it('a project without a cost starts in INR', async () => {
    const p = await projects.create({ name: `TEST ${tag} no cost` }, actor);
    made.projects.push(p.id);
    assert.equal(p.cost, null);
    assert.equal(p.cost_currency, 'INR');
  });
});

describe('Department codes and a subassembly\'s department', () => {
  it('a department code is set in Configuration, unique among live departments', async () => {
    const code = `E${tag.slice(-6)}`;
    const d1 = await departments.create({ name: `${tag} Mechanical` }, actor);
    const d2 = await departments.create({ name: `${tag} Electrical` }, actor);
    made.depts.push(d1.id, d2.id);
    const list = await projects.setDepartmentCode(d1.id, { code }, actor);
    assert.equal(list.find((d) => d.id === d1.id).dept_code, code);
    await assert.rejects(projects.setDepartmentCode(d2.id, { code }, actor), { name: 'ConflictError' }, 'taken by d1');
    await projects.setDepartmentCode(d2.id, { code: `${code}-2` }, actor);
    const cleared = await projects.setDepartmentCode(d2.id, { code: null }, actor);
    assert.equal(cleared.find((d) => d.id === d2.id).dept_code, null, 'cleared');
    await assert.rejects(projects.setDepartmentCode(999999999, { code: 'X' }, actor), { name: 'NotFoundError' });
    made.dept = { ...d1, dept_code: code };
  });

  it('a subassembly records the department it comes from', async () => {
    const s = await subs.create({ name: 'Frame', drawing_no: `${tag}-FR`, department_id: made.dept.id }, actor);
    made.subs.push(s.id);
    assert.equal(s.department.dept_code, made.dept.dept_code);
    const cleared = await subs.updateDetails(s.id, { department_id: null }, actor);
    assert.equal(cleared.department, null);
    await assert.rejects(subs.updateDetails(s.id, { department_id: 999999999 }, actor), { name: 'ValidationError' });
    const uncoded = await departments.create({ name: `${tag} No code` }, actor);
    made.depts.push(uncoded.id);
    await assert.rejects(subs.updateDetails(s.id, { department_id: uncoded.id }, actor), { name: 'ValidationError' }, 'a department without a code can\'t be chosen');
    await assert.rejects(subs.create({ name: 'Other', drawing_no: `${tag}-OT`, department_id: uncoded.id }, actor), { name: 'ValidationError' });
  });
});
