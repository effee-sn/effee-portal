/**
 * Project machines (Machine IDs), their numbering, department numbers and a
 * subassembly's department — pinned down.
 *
 * Needs a development/test DATABASE_URL; removes what it creates (the Machine
 * ID counter stays moved on — IDs are never reused).
 * Run:  npm run test:machines
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }
const it = (name, fn) => test(name, async (t) => (env.unavailable ? t.skip(env.reason) : fn(t)));

let prisma; let projects; let departments; let subs; let materials;
const tag = `PM${Date.now().toString().slice(-6)}`;
const actor = { id: null, email: 'machines-test@local', is_system: true, permissions: [] };
const made = { projects: [], depts: [], subs: [], prefix: null, numbering: null };

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  ({ projectService: projects } = require('../../src/modules/projects/project.service'));
  ({ departmentService: departments } = require('../../src/modules/department/department.service'));
  ({ subassemblyService: subs } = require('../../src/modules/master/subassembly.service'));
  ({ materialService: materials } = require('../../src/modules/master/material.service'));
  made.numbering = await projects.getMachineNumbering();
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await prisma.projectMachine.deleteMany({ where: { project_id: { in: made.projects } } });
    await prisma.project.deleteMany({ where: { id: { in: made.projects } } });
    const subItems = (await prisma.subassembly.findMany({ where: { id: { in: made.subs } }, select: { material_id: true } })).map((x) => x.material_id).filter(Boolean);
    await prisma.subassemblyItem.deleteMany({ where: { subassembly_id: { in: made.subs } } });
    await prisma.subassemblyRevision.deleteMany({ where: { subassembly_id: { in: made.subs } } });
    await prisma.subassembly.deleteMany({ where: { id: { in: made.subs } } });
    await prisma.material.deleteMany({ where: { id: { in: subItems } } });
    if (made.prefix) {
      await prisma.material.deleteMany({ where: { prefix_id: made.prefix } });
      await prisma.immPrefix.deleteMany({ where: { id: made.prefix } });
    }
    await prisma.department.deleteMany({ where: { id: { in: made.depts } } });
    // Back to how the numbering was (its counter only ever moves forward).
    const s = await prisma.companySettings.findFirst();
    const n = made.numbering;
    await prisma.companySettings.update({
      where: { id: s.id },
      data: { machine_prefix: n.prefix, machine_separator: n.separator, machine_digits: n.digits, machine_next: Math.max(n.next_number, s.machine_next) },
    });
  } finally { await prisma.$disconnect(); }
});

describe('Machine IDs', () => {
  let p;

  it('a new project gets its machines, numbered in order from the numbering setting', async () => {
    if (!made.numbering.machine_count) {
      const preview = await projects.setMachineNumbering({ prefix: tag, separator: '-', digits: 3 }, actor);
      assert.equal(preview.preview, `${tag}-${String(preview.next_number).padStart(3, '0')}`);
    }
    const before = await projects.getMachineNumbering();
    p = await projects.create({ name: `TEST ${tag}`, machines: 2 }, actor);
    made.projects.push(p.id);
    assert.equal(p.machines.length, 2);
    assert.equal(p.machines[0].machine_no, before.preview);
    const after = await projects.getMachineNumbering();
    assert.equal(after.next_number, before.next_number + 2, 'counter moved on by 2');
  });

  it('machines are added, renamed and removed; a removed ID is not given out again', async () => {
    const withMore = await projects.addMachines(p.id, { count: 1, name: 'Panel C' }, actor);
    assert.equal(withMore.machines.length, 3);
    const third = withMore.machines[2];
    assert.equal(third.name, 'Panel C');
    const renamed = await projects.updateMachine(p.id, third.id, { name: 'Panel C (spare)' }, actor);
    assert.equal(renamed.name, 'Panel C (spare)');
    assert.equal(renamed.machine_no, third.machine_no, 'the ID never changes');
    await projects.removeMachine(p.id, third.id, actor);
    const again = await projects.addMachines(p.id, {}, actor);
    assert.ok(!again.machines.some((m) => m.machine_no === third.machine_no), 'not reused');
    await assert.rejects(projects.updateMachine(p.id, 999999999, { name: 'x' }, actor), { name: 'NotFoundError' });
  });

  it('once IDs are given out the format is fixed and the counter only moves forward', async () => {
    const n = await projects.getMachineNumbering();
    await assert.rejects(projects.setMachineNumbering({ digits: n.digits + 1 }, actor), { name: 'ConflictError' });
    await assert.rejects(projects.setMachineNumbering({ next_number: 1 }, actor), { name: 'ValidationError' });
    const moved = await projects.setMachineNumbering({ next_number: n.next_number + 10 }, actor);
    assert.equal(moved.next_number, n.next_number + 10);
  });

  it('adding at the same time never hands out the same ID', async () => {
    await Promise.all([1, 2, 3, 4].map(() => projects.addMachines(p.id, { count: 2 }, actor)));
    const all = (await projects.getById(p.id)).machines.map((m) => m.machine_no);
    assert.equal(new Set(all).size, all.length);
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
