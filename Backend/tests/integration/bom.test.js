/**
 * BOM (subassemblies) — pinned down.
 *
 * Needs a development/test DATABASE_URL; removes what it creates.
 * Run:  npm run test:bom
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }
const it = (name, fn) => test(name, async (t) => (env.unavailable ? t.skip(env.reason) : fn(t)));

let prisma; let bom; let materials;
const tag = `B${Date.now().toString().slice(-6)}`;
const actor = { id: null, email: 'bom-test@local', is_system: true, permissions: [] };
const made = { prefix: null, subs: [] };
let m1; let m2; let m3;

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  ({ bomService: bom } = require('../../src/modules/master/bom.service'));
  ({ materialService: materials } = require('../../src/modules/master/material.service'));
  const p = await materials.createPrefix({ prefix: tag, separator: '-', digits: 4 }, actor);
  // A material's drawing no. must be a BOM subassembly's: make that drawing first.
  const drawing = await bom.create({ name: 'Tube drawing', drawing_no: `${tag}-DWG-1` }, actor);
  made.subs.push(drawing.id);
  made.prefix = p.id;
  const row = (name, dwg) => ({ prefix_id: p.id, item_name: name, description: 'd', technical_spec: 's', material_type: 'BOUGHT_OUT', material: 'Cu', drawing_no: dwg, remarks: null });
  [m1, m2, m3] = await materials.createBulk({ rows: [row('Copper tube', `${tag}-DWG-1`), row('Thyristor', null), row('Busbar', null)] }, actor);
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await prisma.subassemblyItem.deleteMany({ where: { subassembly_id: { in: made.subs } } });
    await prisma.subassembly.deleteMany({ where: { id: { in: made.subs } } });
    await prisma.material.deleteMany({ where: { prefix_id: made.prefix } });
    await prisma.immPrefix.deleteMany({ where: { id: made.prefix } });
  } finally { await prisma.$disconnect(); }
});

describe('Material drawing no. comes from the BOM', () => {
  it('a material may only use a BOM subassembly drawing no. (or none)', async () => {
    const p = made.prefix;
    const row = (dwg) => ({ prefix_id: p, item_name: 'x', description: 'd', technical_spec: 's', material_type: 'CONSUMABLE', material: 'MS', drawing_no: dwg, remarks: null });
    await assert.rejects(materials.createBulk({ rows: [row('NOT-A-BOM-DRAWING')] }, actor), { name: 'ValidationError' });
    const [ok] = await materials.createBulk({ rows: [row(`${tag}-DWG-1`), row(null)] }, actor);
    assert.equal(ok.drawing_no, `${tag}-DWG-1`);
    await assert.rejects(materials.update(ok.id, { drawing_no: 'NOT-A-BOM-DRAWING' }, actor), { name: 'ValidationError' });
  });

  it('renaming a subassembly drawing no. carries it to its materials', async () => {
    const sa = await bom.create({ name: 'Rename me', drawing_no: `${tag}-OLD` }, actor);
    made.subs.push(sa.id);
    const [m] = await materials.createBulk({ rows: [{ prefix_id: made.prefix, item_name: 'y', description: 'd', technical_spec: 's', material_type: 'FINISHED', material: 'SS304', drawing_no: `${tag}-OLD`, remarks: null }] }, actor);
    await bom.update(sa.id, { drawing_no: `${tag}-NEW` }, actor);
    assert.equal((await materials.getById(m.id)).drawing_no, `${tag}-NEW`);
  });
});

describe('BOM subassemblies', () => {
  let sub;

  it('the material search finds by IMM code, drawing no. and name', async () => {
    assert.ok((await bom.searchMaterials(m1.imm_code)).items.some((m) => m.id === m1.id), 'by IMM code');
    assert.ok((await bom.searchMaterials(`${tag}-DWG-1`)).items.some((m) => m.id === m1.id), 'by drawing no.');
    assert.ok((await bom.searchMaterials('Thyristor')).items.some((m) => m.id === m2.id), 'by name');
    const page = await bom.searchMaterials('');
    assert.ok(page.items.length <= 10, 'at most 10 at a time');
    assert.equal(typeof page.has_more, 'boolean');
    const without = await bom.searchMaterials(tag, 0, `${m1.id},${m2.id}`);
    assert.ok(!without.items.some((m) => m.id === m1.id || m.id === m2.id), 'materials already added are left out');
    assert.ok(without.items.some((m) => m.id === m3.id));
  });

  it('a subassembly is created with its materials and quantities', async () => {
    sub = await bom.create({ name: 'Coil assembly', drawing_no: `${tag}-SA-1`, items: [{ material_id: m1.id, quantity: 85.5 }, { material_id: m2.id, quantity: 6 }] }, actor);
    made.subs.push(sub.id);
    assert.equal(sub.items.length, 2);
    assert.equal(Number(sub.items[0].quantity), 85.5);
    assert.equal(sub.items[0].material.imm_code, m1.imm_code);
  });

  it('drawing numbers are unique; a material is listed once', async () => {
    await assert.rejects(bom.create({ name: 'x', drawing_no: `${tag}-SA-1` }, actor), { name: 'ConflictError' });
    await assert.rejects(bom.create({ name: 'x', drawing_no: `${tag}-SA-9`, items: [{ material_id: m1.id, quantity: 1 }, { material_id: m1.id, quantity: 2 }] }, actor),
      { name: 'ValidationError' });
  });

  it('editing replaces the materials; inactive ones cannot be added but may stay', async () => {
    const u = await bom.update(sub.id, { items: [{ material_id: m2.id, quantity: 4 }, { material_id: m3.id, quantity: 12 }] }, actor);
    assert.deepEqual(u.items.map((i) => [i.material.id, Number(i.quantity)]), [[m2.id, 4], [m3.id, 12]]);
    await materials.update(m1.id, { is_active: false }, actor);
    await assert.rejects(bom.update(sub.id, { items: [{ material_id: m1.id, quantity: 1 }] }, actor), { name: 'ValidationError', message: /Validation failed/ });
    await materials.update(m3.id, { is_active: false }, actor);
    await bom.update(sub.id, { name: 'Coil assembly v2' }, actor); // m3 already on it: fine
    const again = await bom.update(sub.id, { items: [{ material_id: m3.id, quantity: 10 }] }, actor);
    assert.equal(Number(again.items[0].quantity), 10, 'an inactive material already on it can stay');
  });

  it('deleting hides it, and frees its drawing no.', async () => {
    await bom.remove(sub.id, actor);
    await assert.rejects(bom.getById(sub.id), { name: 'NotFoundError' });
    const fresh = await bom.create({ name: 'Coil assembly', drawing_no: `${tag}-SA-1` }, actor);
    made.subs.push(fresh.id);
  });
});
