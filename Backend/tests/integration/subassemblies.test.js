/**
 * Subassemblies (Master Data) — pinned down.
 *
 * Needs a development/test DATABASE_URL; removes what it creates.
 * Run:  npm run test:subassemblies
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }
const it = (name, fn) => test(name, async (t) => (env.unavailable ? t.skip(env.reason) : fn(t)));

let prisma; let subs; let materials;
const tag = `S${Date.now().toString().slice(-6)}`;
const actor = { id: null, email: 'subassembly-test@local', is_system: true, permissions: [] };
const made = { prefix: null, uom: null, subs: [] };
let m1; let m2; let m3;

const line = (m, quantity, extra = {}) => ({ material_id: m.id, quantity, ...extra });
/** A new subassembly (its own new IMM code), released as its first revision unless asked not to. */
const newSub = async (name, drawing_no, items = [], { release = true } = {}) => {
  const s = await subs.create({ name, drawing_no, items, item: { mode: 'new', prefix_id: made.prefix, uom_id: made.uom } }, actor);
  made.subs.push(s.id);
  return release && items.length ? subs.release(s.id, s.draft.id, {}, actor) : s;
};
/** Next revision of a subassembly with these lines, released with a note. */
const revise = async (s, items, note = 'changed') => {
  const d = await subs.newRevision(s.id, actor);
  await subs.saveDraft(s.id, d.id, { items }, actor);
  return subs.release(s.id, d.id, { change_note: note }, actor);
};
const part = (name, dwg = null, type = 'BOUGHT_OUT') => ({
  prefix_id: made.prefix, uom_id: made.uom, item_name: name, description: 'd', technical_spec: 's',
  material_type: type, material: 'Cu', drawing_no: dwg, remarks: null,
});

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  ({ subassemblyService: subs } = require('../../src/modules/master/subassembly.service'));
  ({ materialService: materials } = require('../../src/modules/master/material.service'));
  made.prefix = (await materials.createPrefix({ prefix: tag, separator: '-', digits: 4 }, actor)).id;
  made.uom = (await prisma.unitOfMeasure.findUnique({ where: { code: 'Nos' } })).id;
  made.scheme = (await subs.getRevisionScheme()).scheme;
  // A material's drawing no. must be a subassembly's: make that drawing first.
  await newSub('Tube drawing', `${tag}-DWG-1`, [], { release: false });
  [m1, m2, m3] = await materials.createBulk({ rows: [part('Copper tube', `${tag}-DWG-1`), part('Thyristor'), part('Busbar')] }, actor);
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    if (made.scheme) await subs.setRevisionScheme(made.scheme, actor);
    await prisma.subassemblyItem.deleteMany({ where: { subassembly_id: { in: made.subs } } });
    await prisma.subassemblyRevision.deleteMany({ where: { subassembly_id: { in: made.subs } } });
    await prisma.subassembly.deleteMany({ where: { id: { in: made.subs } } });
    await prisma.material.deleteMany({ where: { prefix_id: made.prefix } });
    await prisma.immPrefix.deleteMany({ where: { id: made.prefix } });
  } finally { await prisma.$disconnect(); }
});

describe('Material drawing no. comes from a subassembly', () => {
  it('a material may only use a subassembly drawing no. (or none)', async () => {
    await assert.rejects(materials.createBulk({ rows: [part('x', 'NOT-A-DRAWING')] }, actor), { name: 'ValidationError' });
    const [ok] = await materials.createBulk({ rows: [part('x', `${tag}-DWG-1`), part('y')] }, actor);
    assert.equal(ok.drawing_no, `${tag}-DWG-1`);
    await assert.rejects(materials.update(ok.id, { drawing_no: 'NOT-A-DRAWING' }, actor), { name: 'ValidationError' });
  });

  it('renaming a subassembly drawing no. carries it to its materials', async () => {
    const sa = await newSub('Rename me', `${tag}-OLD`, [], { release: false });
    const [m] = await materials.createBulk({ rows: [part('y', `${tag}-OLD`)] }, actor);
    await subs.updateDetails(sa.id, { drawing_no: `${tag}-NEW` }, actor);
    assert.equal((await materials.getById(m.id)).drawing_no, `${tag}-NEW`);
  });
});

describe('Subassemblies', () => {
  let sub;

  it('the line search finds by IMM code, drawing no. and name, 10 at a time', async () => {
    assert.ok((await subs.searchMaterials(m1.imm_code)).items.some((m) => m.id === m1.id), 'by IMM code');
    assert.ok((await subs.searchMaterials(`${tag}-DWG-1`)).items.some((m) => m.id === m1.id), 'by drawing no.');
    assert.ok((await subs.searchMaterials('Thyristor')).items.some((m) => m.id === m2.id), 'by name');
    const page = await subs.searchMaterials('');
    assert.ok(page.items.length <= 10, 'at most 10 at a time');
    assert.equal(typeof page.has_more, 'boolean');
    const without = await subs.searchMaterials(tag, 0, `${m1.id},${m2.id}`);
    assert.ok(!without.items.some((m) => m.id === m1.id || m.id === m2.id), 'materials already added are left out');
    assert.ok(without.items.some((m) => m.id === m3.id));
  });

  it('a subassembly is created with its lines and quantities, as a draft of its first revision', async () => {
    sub = await newSub('Coil assembly', `${tag}-SA-1`, [line(m1, 85.5), line(m2, 6)], { release: false });
    assert.equal(sub.draft.rev, made.scheme === 'NUMBERS' ? '00' : 'A');
    assert.equal(sub.current, null, 'nothing released yet');
    const d = await subs.getRevision(sub.id, sub.draft.id);
    assert.equal(d.items.length, 2);
    assert.equal(Number(d.items[0].quantity), 85.5);
    assert.equal(d.items[0].material.imm_code, m1.imm_code);
  });

  it('drawing numbers are unique; a material is listed once', async () => {
    await assert.rejects(newSub('x', `${tag}-SA-1`), { name: 'ConflictError' });
    await assert.rejects(newSub('x', `${tag}-SA-9`, [line(m1, 1), line(m1, 2)]), { name: 'ValidationError' });
  });

  it('a draft\'s lines change; inactive materials cannot be added but may stay', async () => {
    const d = await subs.saveDraft(sub.id, sub.draft.id, { items: [line(m2, 4), line(m3, 12)] }, actor);
    assert.deepEqual(d.items.map((i) => [i.material.id, Number(i.quantity)]), [[m2.id, 4], [m3.id, 12]]);
    await materials.update(m1.id, { is_active: false }, actor);
    await assert.rejects(subs.saveDraft(sub.id, sub.draft.id, { items: [line(m1, 1)] }, actor), { name: 'ValidationError' });
    await materials.update(m1.id, { is_active: true }, actor);
    await materials.update(m3.id, { is_active: false }, actor);
    const again = await subs.saveDraft(sub.id, sub.draft.id, { items: [line(m3, 10)] }, actor);
    assert.equal(Number(again.items[0].quantity), 10, 'an inactive material already on it can stay');
    await materials.update(m3.id, { is_active: true }, actor);
  });

  it('deleting hides it, and frees its drawing no.', async () => {
    await subs.remove(sub.id, actor);
    await assert.rejects(subs.getById(sub.id), { name: 'NotFoundError' });
    await newSub('Coil assembly', `${tag}-SA-1`, [], { release: false });
  });
});

describe('Revisions', () => {
  let s;

  it('releasing locks a draft; the next revision starts as a copy; the old one is superseded', async () => {
    s = await newSub('Bracket set', `${tag}-BR`, [line(m1, 2), line(m2, 1)], { release: false });
    await assert.rejects(subs.newRevision(s.id, actor), { name: 'ConflictError' }, 'a draft is already open');
    s = await subs.release(s.id, s.draft.id, {}, actor);
    assert.equal(s.current.status, 'RELEASED');
    assert.equal(s.current.change_note, 'First release');
    assert.equal(s.draft, null);
    await assert.rejects(subs.saveDraft(s.id, s.current.id, { items: [line(m1, 9)] }, actor), { name: 'ConflictError' }, 'released: locked');

    const d = await subs.newRevision(s.id, actor);
    assert.equal(d.status, 'DRAFT');
    assert.deepEqual(d.items.map((i) => [i.material.id, Number(i.quantity)]), [[m1.id, 2], [m2.id, 1]], 'a copy of the current one');
    await subs.saveDraft(s.id, d.id, { items: [line(m1, 3), line(m3, 5)] }, actor);
    await assert.rejects(subs.release(s.id, d.id, {}, actor), { name: 'ValidationError' }, 'a change note is needed');
    const firstId = s.current.id;
    s = await subs.release(s.id, d.id, { change_note: 'Thicker bracket; busbar instead of thyristor' }, actor);
    assert.equal(s.current.id, d.id);
    assert.equal(s.revisions.find((r) => r.id === firstId).status, 'SUPERSEDED');
    assert.equal(s.revisions.length, 2);
  });

  it('compare shows what was added, removed and changed', async () => {
    const [b, a] = s.revisions; // newest first
    const c = await subs.compare(s.id, a.id, b.id);
    assert.deepEqual(c.added.map((x) => x.material.id), [m3.id]);
    assert.deepEqual(c.removed.map((x) => x.material.id), [m2.id]);
    assert.equal(c.changed.length, 1);
    assert.equal(Number(c.changed[0].quantity.from), 2);
    assert.equal(Number(c.changed[0].quantity.to), 3);
  });

  it('a draft can be discarded; the first one only with the subassembly', async () => {
    const d = await subs.newRevision(s.id, actor);
    await subs.discardDraft(s.id, d.id, actor);
    assert.equal((await subs.getById(s.id)).draft, null);
    const fresh = await newSub('Only draft', `${tag}-OD`, [line(m1, 1)], { release: false });
    await assert.rejects(subs.discardDraft(fresh.id, fresh.draft.id, actor), { name: 'ConflictError' });
  });

  it('labels follow the scheme: letters A … Z, AA; numbers 00, 01', async () => {
    assert.deepEqual([1, 2, 26, 27, 28].map((n) => subs.revisionLabel('LETTERS', n)), ['A', 'B', 'Z', 'AA', 'AB']);
    assert.deepEqual([1, 2, 11].map((n) => subs.revisionLabel('NUMBERS', n)), ['00', '01', '10']);
    await subs.setRevisionScheme('NUMBERS', actor);
    const n = await newSub('Numbered', `${tag}-NUM`, [line(m1, 1)], { release: false });
    assert.equal(n.draft.rev, '00');
    await subs.setRevisionScheme('LETTERS', actor);
  });
});

describe('A subassembly is an item', () => {
  let a;

  it('gets its own Finished IMM code, which follows its name and drawing no.', async () => {
    a = await newSub('Frame', `${tag}-FR`, [], { release: false });
    assert.match(a.material.imm_code, new RegExp(`^${tag}-\\d{4}$`));
    assert.equal(a.material.material_type, 'FINISHED');
    assert.equal(a.material.item_name, 'Frame');
    await subs.updateDetails(a.id, { name: 'Main frame', drawing_no: `${tag}-FR2` }, actor);
    const item = await materials.getById(a.material.id);
    assert.equal(item.item_name, 'Main frame');
    assert.equal(item.drawing_no, `${tag}-FR2`);
    assert.equal(item.subassembly.id, a.id);
    await assert.rejects(materials.update(item.id, { item_name: 'Other' }, actor), { name: 'ConflictError' }, 'named on the subassembly');
    await assert.rejects(materials.remove(item.id, actor), { name: 'ConflictError' }, 'deleted with the subassembly');
  });

  it('can instead use an existing Finished material, once', async () => {
    const [fin, bo] = await materials.createBulk({ rows: [part('Panel', null, 'FINISHED'), part('Screw')] }, actor);
    const options = await subs.itemOptions(fin.imm_code);
    assert.ok(options.items.some((o) => o.id === fin.id), 'offered');
    const s = await subs.create({ name: 'Panel', drawing_no: `${tag}-PN`, item: { mode: 'existing', material_id: fin.id } }, actor);
    made.subs.push(s.id);
    assert.equal(s.material.id, fin.id);
    assert.equal((await materials.getById(fin.id)).drawing_no, `${tag}-PN`);
    await assert.rejects(subs.create({ name: 'P2', drawing_no: `${tag}-PN2`, item: { mode: 'existing', material_id: fin.id } }, actor), { name: 'ValidationError' }, 'already an item');
    await assert.rejects(subs.create({ name: 'P3', drawing_no: `${tag}-PN3`, item: { mode: 'existing', material_id: bo.id } }, actor), { name: 'ValidationError' }, 'not Finished');
  });
});

describe('Multi-level', () => {
  let inner; let outer;

  it('only a released subassembly can go on another', async () => {
    const unreleased = await newSub('Draft only', `${tag}-DO`, [line(m1, 1)], { release: false });
    assert.ok(!(await subs.searchMaterials(unreleased.material.imm_code)).items.length, 'not offered');
    await assert.rejects(newSub('Uses it', `${tag}-UI`, [line(unreleased.material, 1)]),
      (err) => err.name === 'ValidationError' && /no released revision/.test(err.details[0].message));
  });

  it('a child is held at its revision; the tree multiplies quantities through', async () => {
    inner = await newSub('Coil', `${tag}-CO`, [line(m1, 85.5), line(m2, 2)]);
    outer = await newSub('Coil pack', `${tag}-CP`, [line(inner.material, 3), line(m2, 1)]);
    const t = await subs.tree(outer.id);
    assert.equal(t.levels, 2);
    assert.equal(t.children[0].subassembly_id, inner.id);
    assert.equal(t.children[0].revision.id, inner.current.id);
    const total = (m) => t.totals.find((x) => x.material.id === m.id)?.quantity;
    assert.equal(total(m1), 256.5, '85.5 × 3');
    assert.equal(total(m2), 7, '2 × 3 + 1');
    assert.equal((await subs.getById(inner.id)).used_in[0].id, outer.id, 'where used');
  });

  it('a newer child revision is flagged, not taken: only a new draft moves the line on', async () => {
    const innerA = inner.current;
    inner = await revise(inner, [line(m1, 100), line(m2, 2)], 'Longer tube');
    let cur = await subs.getRevision(outer.id, outer.current.id);
    const childLine = cur.items.find((l) => l.material.id === inner.material.id);
    assert.equal(childLine.child.held.id, innerA.id, 'still held at the old revision');
    assert.equal(childLine.child.newer, true);
    assert.equal((await subs.getById(inner.id)).used_in[0].newer, true);
    assert.equal((await subs.tree(outer.id)).totals.find((x) => x.material.id === m1.id).quantity, 256.5, 'totals unchanged');

    const d = await subs.newRevision(outer.id, actor);
    assert.equal(d.items.find((l) => l.material.id === inner.material.id).child.held.id, innerA.id, 'the draft copies the hold');
    await assert.rejects(subs.saveDraft(outer.id, d.id, { items: [line(inner.material, 3, { child_revision_id: 999999 }), line(m2, 1)] }, actor), { name: 'ValidationError' });
    await subs.saveDraft(outer.id, d.id, { items: [line(inner.material, 3, { child_revision_id: inner.current.id }), line(m2, 1)] }, actor);
    outer = await subs.release(outer.id, d.id, { change_note: 'Coil to its new revision' }, actor);
    cur = await subs.getRevision(outer.id, outer.current.id);
    assert.equal(cur.items.find((l) => l.material.id === inner.material.id).child.newer, false);
    assert.equal((await subs.tree(outer.id)).totals.find((x) => x.material.id === m1.id).quantity, 300, '100 × 3');
    const c = await subs.compare(outer.id, outer.revisions[1].id, outer.revisions[0].id);
    assert.equal(c.changed[0].held.from.id, innerA.id);
  });

  it('no loops: not itself, not something that already contains it', async () => {
    const d = await subs.newRevision(inner.id, actor);
    await assert.rejects(subs.saveDraft(inner.id, d.id, { items: [line(inner.material, 1)] }, actor), { name: 'ValidationError' });
    await assert.rejects(subs.saveDraft(inner.id, d.id, { items: [line(outer.material, 1)] }, actor),
      (err) => err.name === 'ValidationError' && /loop/.test(err.details[0].message));
    await subs.discardDraft(inner.id, d.id, actor);
  });

  it('one used on another can\'t be deleted', async () => {
    await assert.rejects(subs.remove(inner.id, actor), { name: 'ConflictError' });
  });

  it('at most 10 levels deep', async () => {
    let below = await newSub('L1', `${tag}-L1`, [line(m3, 1)]);
    for (let n = 2; n <= 10; n += 1) below = await newSub(`L${n}`, `${tag}-L${n}`, [line(below.material, 1)]);
    await assert.rejects(newSub('L11', `${tag}-L11`, [line(below.material, 1)]),
      (err) => err.name === 'ValidationError' && /more than 10 levels/.test(err.details[0].message));
    assert.equal((await subs.tree(below.id)).levels, 10);
  });
});
