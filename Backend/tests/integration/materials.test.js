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
const made = { prefixes: [] };
const actor = { id: null, email: 'materials-test@local', is_system: true, permissions: [] };
const row = (prefix_id, extra = {}) => ({
  prefix_id, item_name: 'Coil support bracket', description: 'Bracket for coil', technical_spec: '10 mm plate, bent 90°',
  material_type: 'FINISHED', material: 'MS', drawing_no: null, remarks: null, ...extra,
});

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  ({ materialService: svc } = require('../../src/modules/master/material.service'));
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await prisma.material.deleteMany({ where: { prefix_id: { in: made.prefixes } } });
    await prisma.immPrefix.deleteMany({ where: { id: { in: made.prefixes } } });
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
