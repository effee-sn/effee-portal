/**
 * Project BOM — drafts per machine, locking into tags, totals, snapshot,
 * revisions — pinned down.
 *
 * Needs a development/test DATABASE_URL; removes what it creates.
 * Run:  npm run test:project-bom
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }
const it = (name, fn) => test(name, async (t) => (env.unavailable ? t.skip(env.reason) : fn(t)));

let prisma; let boms; let projects; let subs; let materials; let departments;
const tag = `PB${Date.now().toString().slice(-6)}`;
const actor = { id: null, email: 'project-bom-test@local', is_system: true, permissions: [] };
const made = { prefix: null, subs: [], depts: [], project: null };
const fx = {};

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  ({ bomService: boms } = require('../../src/modules/projects/bom.service'));
  ({ projectService: projects } = require('../../src/modules/projects/project.service'));
  ({ subassemblyService: subs } = require('../../src/modules/master/subassembly.service'));
  ({ materialService: materials } = require('../../src/modules/master/material.service'));
  ({ departmentService: departments } = require('../../src/modules/department/department.service'));

  made.prefix = (await materials.createPrefix({ prefix: tag, separator: '-', digits: 3 }, actor)).id;
  const uom = (await prisma.unitOfMeasure.findUnique({ where: { code: 'Nos' } })).id;
  const deptNo = 700 + Math.floor(Math.random() * 99);
  fx.dept = await departments.create({ name: `${tag} Mechanical`, dept_no: deptNo }, actor);
  fx.noNumber = await departments.create({ name: `${tag} Unnumbered` }, actor);
  made.depts.push(fx.dept.id, fx.noNumber.id);

  const part = (name, type) => ({ prefix_id: made.prefix, uom_id: uom, item_name: `${tag} ${name}`, description: 'd', technical_spec: `${name} spec v1`, material_type: type, material: 'MS' });
  [fx.tube, fx.bracket, fx.bolt] = await materials.createBulk({ rows: [part('Tube', 'BOUGHT_OUT'), part('Bracket', 'FINISHED'), part('Bolt', 'CONSUMABLE')] }, actor);
  const item = { mode: 'new', prefix_id: made.prefix, uom_id: uom };
  const released = async (name, dwg, items) => {
    const s = await subs.create({ name, drawing_no: `${tag}-${dwg}`, department_id: fx.dept.id, items, item }, actor);
    made.subs.push(s.id);
    return subs.release(s.id, s.draft.id, {}, actor);
  };
  // Coil = 10 tube + 2 bracket; Pack = 2 coil + 8 bolt.
  fx.coil = await released('Coil', 'CO', [{ material_id: fx.tube.id, quantity: 10 }, { material_id: fx.bracket.id, quantity: 2 }]);
  fx.pack = await released('Pack', 'PK', [{ material_id: fx.coil.material.id, quantity: 2 }, { material_id: fx.bolt.id, quantity: 8 }]);
  const unreleased = await subs.create({ name: 'Draft only', drawing_no: `${tag}-DO`, items: [{ material_id: fx.tube.id, quantity: 1 }], item }, actor);
  made.subs.push(unreleased.id);
  fx.unreleased = unreleased;

  const p = await projects.create({ name: `TEST ${tag}`, machines: 2 }, actor);
  made.project = p.id;
  [fx.m1, fx.m2] = p.machines;
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    if (made.project) {
      const ids = (await prisma.projectBom.findMany({ where: { project_id: made.project }, select: { id: true } })).map((b) => b.id);
      await prisma.projectBomItem.deleteMany({ where: { bom_id: { in: ids } } });
      await prisma.projectBomLine.deleteMany({ where: { bom_id: { in: ids } } });
      await prisma.projectBom.deleteMany({ where: { id: { in: ids } } });
      await prisma.projectMachine.deleteMany({ where: { project_id: made.project } });
      await prisma.project.delete({ where: { id: made.project } });
    }
    await prisma.subassemblyItem.deleteMany({ where: { subassembly_id: { in: made.subs } } });
    await prisma.subassemblyRevision.deleteMany({ where: { subassembly_id: { in: made.subs } } });
    await prisma.subassembly.deleteMany({ where: { id: { in: made.subs } } });
    await prisma.material.deleteMany({ where: { prefix_id: made.prefix } });
    await prisma.immPrefix.deleteMany({ where: { id: made.prefix } });
    await prisma.department.deleteMany({ where: { id: { in: made.depts } } });
  } finally { await prisma.$disconnect(); }
});

const line = (machine, m, quantity, extra = {}) => ({ machine_id: machine.id, material_id: m.id, quantity, ...extra });

describe('Project BOM', () => {
  let rev1;

  it('starts as draft Rev 1; one draft at a time', async () => {
    rev1 = await boms.startRevision(made.project, actor);
    assert.equal(rev1.rev, 1);
    assert.equal(rev1.status, 'DRAFT');
    await assert.rejects(boms.startRevision(made.project, actor), { name: 'ConflictError' });
  });

  it('a draft holds lines per machine; a subassembly line takes its department and current revision', async () => {
    await assert.rejects(boms.saveDraft(made.project, rev1.id, { lines: [line(fx.m1, fx.unreleased.material, 1)] }, actor),
      (err) => err.name === 'ValidationError' && /no released revision/.test(err.details[0].message));
    await assert.rejects(boms.saveDraft(made.project, rev1.id, { lines: [line(fx.m1, fx.bolt, 1), line(fx.m1, fx.bolt, 2)] }, actor), { name: 'ValidationError' });
    const d = await boms.saveDraft(made.project, rev1.id, { lines: [
      line(fx.m1, fx.pack.material, 1),
      line(fx.m2, fx.coil.material, 3),
      line(fx.m2, fx.bolt, 4),
    ] }, actor);
    const packLine = d.lines.find((l) => l.material.id === fx.pack.material.id);
    assert.equal(packLine.department.id, fx.dept.id, 'from the subassembly');
    assert.equal(packLine.child.held.id, fx.pack.current.id);
    assert.ok(d.problems.some((p) => /choose the department/.test(p)), 'the loose bolt has no department yet');
    await assert.rejects(boms.lock(made.project, rev1.id, {}, actor), { name: 'ValidationError' });
    const unnumbered = await boms.saveDraft(made.project, rev1.id, { lines: [line(fx.m2, fx.bolt, 4, { department_id: fx.noNumber.id })] }, actor);
    assert.ok(unnumbered.problems.some((p) => /no department no/.test(p)));
    const ok = await boms.saveDraft(made.project, rev1.id, { lines: [
      line(fx.m1, fx.pack.material, 1),
      line(fx.m2, fx.coil.material, 3),
      line(fx.m2, fx.bolt, 4, { department_id: fx.dept.id }),
    ] }, actor);
    assert.deepEqual(ok.problems, []);
  });

  it('the draft previews its tags', async () => {
    const t = await boms.tags(made.project, rev1.id, fx.m1.id);
    assert.equal(t.preview, true);
    assert.ok(t.count > 0);
  });

  it('locking explodes into tags: copies get /1, /2; bought-out and consumables carry the quantity', async () => {
    const o = await boms.lock(made.project, rev1.id, {}, actor);
    assert.equal(o.current.rev, 1);
    assert.equal(o.current.change_note, 'First lock');
    const dn = fx.dept.dept_no;
    const P = fx.pack.material.imm_code; const C = fx.coil.material.imm_code;
    const m1 = (await boms.tags(made.project, rev1.id, fx.m1.id)).items;
    const byTag = new Map(m1.map((i) => [i.tag, i]));
    const top = `${fx.m1.machine_no}-${dn}-${P}`;
    assert.ok(byTag.has(top), 'pack, one piece: no suffix');
    assert.ok(byTag.has(`${top}-${C}/1`) && byTag.has(`${top}-${C}/2`), 'two coils');
    assert.equal(Number(byTag.get(`${top}-${C}/1-${fx.tube.imm_code}`).quantity), 10, 'tube carries its quantity');
    assert.ok(byTag.has(`${top}-${C}/2-${fx.bracket.imm_code}/1`) && byTag.has(`${top}-${C}/2-${fx.bracket.imm_code}/2`), 'Finished brackets are pieces');
    assert.equal(Number(byTag.get(`${top}-${fx.bolt.imm_code}`).quantity), 8);
    assert.equal(byTag.get(`${top}-${C}/1`).rev, fx.coil.current.rev, 'the revision it was exploded at');
    assert.equal(byTag.get(`${top}-${C}/1`).parent_tag, top);
  });

  it('totals multiply through the levels, per machine and for the project', async () => {
    const t = await boms.totals(made.project, rev1.id);
    const q = (m) => t.materials.find((x) => x.material_id === m.id);
    assert.equal(q(fx.tube).quantity, 50, '10 × 2 (M1) + 10 × 3 (M2)');
    assert.equal(q(fx.tube).per_machine[fx.m1.id], 20);
    assert.equal(q(fx.bracket).quantity, 10, '2 × 2 + 2 × 3');
    assert.equal(q(fx.bolt).quantity, 12, '8 + 4');
    assert.equal(t.subassemblies.find((x) => x.material_id === fx.coil.material.id).quantity, 5, 'coils to build: 2 + 3');
  });

  it('a locked BOM is a snapshot: later material edits don\'t change it', async () => {
    await materials.update(fx.tube.id, { technical_spec: 'Tube spec v2' }, actor);
    const items = (await boms.tags(made.project, rev1.id, fx.m2.id)).items;
    assert.equal(items.find((i) => i.material_id === fx.tube.id).technical_spec, 'Tube spec v1');
    await assert.rejects(boms.saveDraft(made.project, rev1.id, { lines: [] }, actor), { name: 'ConflictError' }, 'locked: no changes');
    await assert.rejects(projects.removeMachine(made.project, fx.m1.id, actor), { name: 'ConflictError' }, 'a machine on a locked BOM stays');
  });

  it('a change is a new revision: a copy, locked with a note; the old one is superseded but kept', async () => {
    fx.coil = await (async () => {
      const d = await subs.newRevision(fx.coil.id, actor);
      await subs.saveDraft(fx.coil.id, d.id, { items: [{ material_id: fx.tube.id, quantity: 12 }, { material_id: fx.bracket.id, quantity: 2 }] }, actor);
      return subs.release(fx.coil.id, d.id, { change_note: 'longer tube' }, actor);
    })();
    const rev2 = await boms.startRevision(made.project, actor);
    assert.equal(rev2.rev, 2);
    const coilLine = rev2.lines.find((l) => l.machine_id === fx.m2.id && l.material.id === fx.coil.material.id);
    assert.equal(coilLine.child.newer, true, 'Coil has a newer revision');
    await boms.saveDraft(made.project, rev2.id, { lines: rev2.lines.map((l) => ({
      machine_id: l.machine_id, material_id: l.material.id, quantity: Number(l.quantity), department_id: l.department?.id,
      child_revision_id: l === coilLine ? fx.coil.current.id : l.child?.held?.id,
    })) }, actor);
    await assert.rejects(boms.lock(made.project, rev2.id, {}, actor), { name: 'ValidationError' }, 'a note is needed');
    const o = await boms.lock(made.project, rev2.id, { change_note: 'M2 coils to Rev B' }, actor);
    assert.equal(o.current.rev, 2);
    assert.equal(o.revisions.find((r) => r.rev === 1).status, 'SUPERSEDED');
    const t2 = await boms.totals(made.project, rev2.id);
    assert.equal(t2.materials.find((x) => x.material_id === fx.tube.id).quantity, 56, 'M1 still 10 × 2 (Pack holds Coil A); M2 12 × 3');
    const t1 = await boms.totals(made.project, rev1.id);
    assert.equal(t1.materials.find((x) => x.material_id === fx.tube.id).quantity, 50, 'Rev 1 unchanged');
  });

  it('exports a locked revision to Excel', async () => {
    const { buffer, filename } = await boms.exportXlsx(made.project, rev1.id);
    assert.match(filename, /BOM-Rev1\.xlsx$/);
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer);
    assert.deepEqual(wb.SheetNames, ['Tags', 'Material totals', 'Subassemblies']);
  });
});
