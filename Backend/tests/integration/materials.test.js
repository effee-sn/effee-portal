/**
 * Material master + IMM code prefixes — pinned down.
 *
 * Needs a development/test DATABASE_URL; removes what it creates.
 * Run:  npm run test:materials
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }

const it = (name, fn) => test(name, async (t) => {
  if (env.unavailable) return t.skip(env.reason);
  return fn(t);
});

let prisma; let svc;
const tag = `T${Date.now().toString().slice(-6)}`;
const made = { prefixes: [], units: [], subs: [] };
const actor = { id: null, email: 'materials-test@local', is_system: true, permissions: [] };
let nos; // the "Nos" unit's id
const row = (prefix_id, extra = {}) => ({
  prefix_id, item_name: 'Coil support bracket', description: 'Bracket for coil', technical_spec: '10 mm plate, bent 90°',
  material_type: 'FINISHED', material: 'MS', uom_id: nos, drawing_no: null, remarks: null, ...extra,
});

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  ({ materialService: svc } = require('../../src/modules/master/material.service'));
  nos = (await prisma.unitOfMeasure.findUnique({ where: { code: 'Nos' } })).id;
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await prisma.subassemblyItem.deleteMany({ where: { subassembly_id: { in: made.subs } } });
    await prisma.subassembly.deleteMany({ where: { id: { in: made.subs } } });
    const ids = (await prisma.material.findMany({ where: { prefix_id: { in: made.prefixes } }, select: { id: true } })).map((m) => String(m.id));
    await prisma.auditLog.deleteMany({ where: { entity: 'Material', entity_id: { in: ids } } });
    await prisma.material.deleteMany({ where: { prefix_id: { in: made.prefixes } } });
    await prisma.immPrefix.deleteMany({ where: { id: { in: made.prefixes } } });
    await prisma.unitOfMeasure.deleteMany({ where: { id: { in: made.units } } });
  } finally { await prisma.$disconnect(); }
});

describe('Material master', () => {
  let a; let b;

  it('a prefix formats codes as prefix + separator + zero-padded number', async () => {
    a = await svc.createPrefix({ prefix: `${tag}A`, separator: '-', digits: 5 }, actor);
    b = await svc.createPrefix({ prefix: `${tag}B`, separator: '', digits: 3, next_number: 42 }, actor);
    made.prefixes.push(a.id, b.id);
    assert.equal(a.preview, `${tag}A-00001`);
    assert.equal(b.preview, `${tag}B042`, 'no separator, starts at 42');
    await assert.rejects(svc.createPrefix({ prefix: `${tag}A` }, actor), { name: 'ConflictError' }, 'prefixes are unique');
  });

  it('bulk create numbers each prefix on its own, in order', async () => {
    const created = await svc.createBulk({ rows: [row(a.id), row(b.id), row(a.id, { item_name: 'Second' })] }, actor);
    assert.deepEqual(created.map((m) => m.imm_code), [`${tag}A-00001`, `${tag}B042`, `${tag}A-00002`]);
    const after = await svc.listPrefixes();
    assert.equal(after.find((p) => p.id === a.id).preview, `${tag}A-00003`, 'counter moved on');
  });

  it('a used prefix keeps its format; its counter can only move forward', async () => {
    await assert.rejects(svc.updatePrefix(a.id, { separator: '_' }, actor), { name: 'ConflictError' });
    await assert.rejects(svc.updatePrefix(a.id, { next_number: 1 }, actor), { name: 'ValidationError' });
    const p = await svc.updatePrefix(a.id, { next_number: 100 }, actor);
    assert.equal(p.preview, `${tag}A-00100`);
    await assert.rejects(svc.deletePrefix(a.id, actor), { name: 'ConflictError' }, 'used prefixes are not deleted');
  });

  it('an inactive prefix cannot be used; a missing one is reported per row', async () => {
    await svc.updatePrefix(b.id, { is_active: false }, actor);
    await assert.rejects(svc.createBulk({ rows: [row(b.id)] }, actor), { name: 'ValidationError', message: /Validation failed/ });
    await assert.rejects(svc.createBulk({ rows: [row(999999999)] }, actor), { name: 'ValidationError' });
  });

  it('editing keeps the IMM code; deleting hides it from the list', async () => {
    const [m] = await svc.createBulk({ rows: [row(a.id)] }, actor);
    // (A drawing no. must be a BOM subassembly's — covered in bom.test.js.)
    const e = await svc.update(m.id, { item_name: 'Renamed' }, actor);
    assert.equal(e.imm_code, m.imm_code);
    assert.equal(e.item_name, 'Renamed');
    await svc.remove(m.id, actor);
    await assert.rejects(svc.getById(m.id), { name: 'NotFoundError' });
  });

  it('saving at the same time never hands out the same code', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => svc.createBulk({ rows: [row(a.id), row(a.id)] }, actor)));
    const codes = results.flat().map((m) => m.imm_code);
    assert.equal(new Set(codes).size, codes.length, 'all unique');
  });
});

describe('Units, usage and history', () => {
  let p; let unit; let m;

  before(async () => {
    if (env.unavailable) return;
    p = await svc.createPrefix({ prefix: `${tag}U`, separator: '-', digits: 4 }, actor);
    made.prefixes.push(p.id);
  });

  it('every material needs an active unit; a used unit keeps its code', async () => {
    unit = await svc.createUnit({ code: `${tag}kg`, name: 'Test kilogram' }, actor);
    made.units.push(unit.id);
    await assert.rejects(svc.createUnit({ code: `${tag}kg`, name: 'again' }, actor), { name: 'ConflictError' });
    [m] = await svc.createBulk({ rows: [row(p.id, { uom_id: unit.id, item_name: `${tag} tube` })] }, actor);
    assert.equal(m.uom.code, `${tag}kg`);
    await assert.rejects(svc.updateUnit(unit.id, { code: `${tag}g` }, actor), { name: 'ConflictError' }, 'code locked once used');
    assert.equal((await svc.updateUnit(unit.id, { name: 'Kilogram (test)' }, actor)).name, 'Kilogram (test)', 'the name can change');
    await assert.rejects(svc.deleteUnit(unit.id, actor), { name: 'ConflictError' }, 'a used unit is not deleted');
    await svc.updateUnit(unit.id, { is_active: false }, actor);
    await assert.rejects(svc.createBulk({ rows: [row(p.id, { uom_id: unit.id })] }, actor), { name: 'ValidationError' }, 'inactive unit');
    await svc.updateUnit(unit.id, { is_active: true }, actor);
  });

  it('a material on a subassembly can\'t be deleted or change its unit, and shows where it is used', async () => {
    const sa = await prisma.subassembly.create({ data: { name: `${tag} frame`, drawing_no: `${tag}-FR` } });
    made.subs.push(sa.id);
    const rev = await prisma.subassemblyRevision.create({ data: { subassembly_id: sa.id, seq: 1, rev: 'A', status: 'RELEASED' } });
    await prisma.subassemblyItem.create({ data: { subassembly_id: sa.id, revision_id: rev.id, material_id: m.id, quantity: 4 } });
    const used = await svc.whereUsed(m.id);
    assert.deepEqual(used.subassemblies.map((s) => [s.drawing_no, Number(s.quantity), s.revision.rev]), [[`${tag}-FR`, 4, 'A']]);
    await assert.rejects(svc.remove(m.id, actor), { name: 'ConflictError' }, 'used: not deleted');
    await assert.rejects(svc.update(m.id, { uom_id: nos }, actor), { name: 'ConflictError' }, 'used: unit fixed');
    await svc.update(m.id, { is_active: false }, actor); // made inactive instead: fine
  });

  it('duplicates are found against the master and within the batch, ignoring case and spaces', async () => {
    const { matches } = await svc.duplicates({ rows: [
      { item_name: `  ${tag} TUBE `, material: 'ms', technical_spec: '10 mm plate,  bent 90°' },
      { item_name: 'Something new', material: 'Cu', technical_spec: 'x' },
      { item_name: 'something NEW', material: 'cu', technical_spec: 'X' },
    ] });
    assert.deepEqual(matches.map((x) => [x.row, x.kind]), [[0, 'existing'], [2, 'batch']]);
    assert.equal(matches[0].imm_code, m.imm_code);
    assert.equal(matches[1].other_row, 1);
  });

  it('each material has its own history, from its creation', async () => {
    const h = await svc.history(m.id);
    const actions = h.items.map((e) => e.action);
    assert.ok(actions.includes('CREATE'), 'created');
    assert.ok(actions.includes('UPDATE'), 'made inactive');
    assert.ok(h.items.every((e) => e.entity === 'Material' && e.entity_id === String(m.id)));
  });

  it('the list exports to Excel', async () => {
    const buf = await svc.exportXlsx({ filters: { prefix_id: p.id }, orderBy: { imm_code: 'asc' } });
    const XLSX = require('xlsx');
    const rows = XLSX.utils.sheet_to_json(XLSX.read(buf).Sheets.Materials, { header: 1 });
    assert.equal(rows[0][0], 'IMM code');
    assert.equal(rows[1][0], m.imm_code);
    assert.equal(rows[1][7], `${tag}kg`, 'unit column');
  });
});
