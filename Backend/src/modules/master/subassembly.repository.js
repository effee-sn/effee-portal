const prisma = require('../../lib/prisma');

/**
 * Subassembly data-access layer: subassemblies, their revisions (each with its
 * lines — materials, or other subassemblies' items held at a revision), and
 * their own items in the material master.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createSubassemblyRepository(db) {
  const active = (where = {}) => ({ ...where, deleted_at: null });
  const OPEN = ['DRAFT', 'RELEASED']; // the revisions still in use (not superseded)

  const materialBrief = Object.freeze({
    id: true, imm_code: true, item_name: true, drawing_no: true, material_type: true,
    material: true, is_active: true, deleted_at: true, uom: { select: { code: true } },
    // Set when this material is itself a subassembly: its current (released) revision.
    subassembly: { select: { id: true, deleted_at: true, revisions: { where: { status: 'RELEASED' }, select: { id: true, rev: true } } } },
  });

  const lineSelect = Object.freeze({
    id: true, quantity: true, sort_order: true, child_revision_id: true,
    child_revision: { select: { id: true, rev: true, status: true } },
    material: { select: materialBrief },
  });

  const revisionSummary = Object.freeze({
    id: true, seq: true, rev: true, status: true, change_note: true, released_at: true, released_by: true,
    created_at: true, created_by: true, updated_at: true, _count: { select: { items: true } },
  });

  const departmentBrief = Object.freeze({ select: { id: true, name: true, dept_no: true } });

  const listSelect = Object.freeze({
    id: true, name: true, drawing_no: true, created_at: true, updated_at: true,
    department: departmentBrief,
    material: { select: { id: true, imm_code: true, uom: { select: { code: true } } } },
    revisions: { where: { status: { in: OPEN } }, select: { id: true, rev: true, status: true, _count: { select: { items: true } } } },
  });

  const detailSelect = Object.freeze({
    id: true, name: true, drawing_no: true, created_at: true, updated_at: true, created_by: true,
    department: departmentBrief,
    material: { select: materialBrief },
    revisions: { select: revisionSummary, orderBy: { seq: 'desc' } },
  });

  return {
    OPEN,

    async findPage({ where, orderBy, skip, take }) {
      const scoped = active(where);
      const [items, total] = await Promise.all([
        db.subassembly.findMany({ where: scoped, select: listSelect, orderBy, skip, take }),
        db.subassembly.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /** @param {number} id */
    findById(id) {
      return db.subassembly.findFirst({ where: active({ id }), select: detailSelect });
    },

    /** One revision of a subassembly, with its lines. @param {number} subId @param {number} revId */
    findRevision(subId, revId) {
      return db.subassemblyRevision.findFirst({
        where: { id: revId, subassembly_id: subId },
        select: { ...revisionSummary, items: { select: lineSelect, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] } },
      });
    },

    /** Another live subassembly with this drawing no. @param {string} drawingNo @param {number} [exceptId] */
    findByDrawingNo(drawingNo, exceptId) {
      return db.subassembly.findFirst({
        where: active({ drawing_no: drawingNo, ...(exceptId ? { id: { not: exceptId } } : {}) }),
        select: { id: true, name: true },
      });
    },

    /** These materials, deleted ones included; subassemblies' items with their current revision. @param {number[]} ids */
    findMaterials(ids) {
      return db.material.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, is_active: true, deleted_at: true, imm_code: true, material_type: true,
          subassembly: { select: { id: true, deleted_at: true, revisions: { where: { status: 'RELEASED' }, select: { id: true, rev: true } } } },
        },
      });
    },

    /** These revisions (any subassembly): which subassembly each is of. @param {number[]} ids */
    revisionsById(ids) {
      if (!ids.length) return [];
      return db.subassemblyRevision.findMany({ where: { id: { in: ids } }, select: { id: true, rev: true, status: true, subassembly_id: true } });
    },

    /**
     * The lines of these revisions, with materials and the child revisions
     * they hold — one level of a structure. @param {number[]} revIds
     */
    linesOf(revIds) {
      if (!revIds.length) return [];
      return db.subassemblyItem.findMany({
        where: { revision_id: { in: revIds } },
        select: {
          revision_id: true, quantity: true, child_revision_id: true,
          child_revision: { select: { id: true, rev: true, subassembly_id: true } },
          material: { select: materialBrief },
        },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      });
    },

    /**
     * Where a subassembly's item is used: lines of other live subassemblies'
     * draft and current revisions, with the revision of it each holds.
     * @param {number} materialId
     */
    usedIn(materialId) {
      return db.subassemblyItem.findMany({
        where: { material_id: materialId, subassembly: { deleted_at: null }, revision: { status: { in: OPEN } } },
        select: {
          quantity: true,
          child_revision: { select: { id: true, rev: true } },
          revision: { select: { id: true, rev: true, status: true } },
          subassembly: { select: { id: true, name: true, drawing_no: true } },
        },
        orderBy: { subassembly: { drawing_no: 'asc' } },
      });
    },

    /** Lines of live subassemblies (any revision, history included) using this material. @param {number} materialId */
    anyUse(materialId) {
      return db.subassemblyItem.count({ where: { material_id: materialId, subassembly: { deleted_at: null } } });
    },

    /**
     * Picker for lines: active materials, and subassemblies' items that have
     * a released revision, matching an IMM code, drawing no. or item name.
     * @param {string} q @param {number} take @param {number} [skip] @param {number[]} [excludeIds]
     */
    searchMaterials(q, take, skip = 0, excludeIds = []) {
      const term = q.trim();
      return db.material.findMany({
        where: {
          deleted_at: null,
          is_active: true,
          ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
          AND: [
            { OR: [{ subassembly: null }, { subassembly: { revisions: { some: { status: 'RELEASED' } } } }] },
            ...(term ? [{ OR: [{ imm_code: { contains: term } }, { drawing_no: { contains: term } }, { item_name: { contains: term } }] }] : []),
          ],
        },
        select: materialBrief,
        orderBy: { imm_code: 'asc' },
        skip,
        take,
      });
    },

    /**
     * Finished materials that could become a subassembly's item: active and
     * not already one. @param {string} q @param {number} take @param {number} skip
     */
    searchItemOptions(q, take, skip) {
      const term = q.trim();
      return db.material.findMany({
        where: {
          deleted_at: null, is_active: true, material_type: 'FINISHED', subassembly: null,
          ...(term ? { OR: [{ imm_code: { contains: term } }, { item_name: { contains: term } }, { drawing_no: { contains: term } }] } : {}),
        },
        select: { id: true, imm_code: true, item_name: true, drawing_no: true },
        orderBy: { imm_code: 'asc' },
        skip,
        take,
      });
    },

    /** Active prefixes and units, for creating a subassembly's item. */
    async itemSetup() {
      const [prefixes, units] = await Promise.all([
        db.immPrefix.findMany({ where: { is_active: true }, select: { id: true, prefix: true, separator: true, digits: true, next_number: true, description: true }, orderBy: { prefix: 'asc' } }),
        db.unitOfMeasure.findMany({ where: { is_active: true }, select: { id: true, code: true, name: true }, orderBy: [{ sort_order: 'asc' }, { code: 'asc' }] }),
      ]);
      return { prefixes, units };
    },

    /** Highest revision number so far. @param {number} subId */
    async lastSeq(subId) {
      const r = await db.subassemblyRevision.aggregate({ where: { subassembly_id: subId }, _max: { seq: true } });
      return r._max.seq ?? 0;
    },

    /**
     * Creates a subassembly, its first revision (a draft) with its lines, and
     * — in the same transaction — its item: `makeItem(tx)` creates (or links)
     * it and returns its id.
     * @param {object} data @param {Array<object>} lines @param {string} rev
     * @param {(tx: import('@prisma/client').Prisma.TransactionClient) => Promise<number>} makeItem
     */
    create(data, lines, rev, makeItem) {
      return db.$transaction(async (tx) => {
        const materialId = await makeItem(tx);
        const s = await tx.subassembly.create({ data: { ...data, material_id: materialId }, select: { id: true } });
        const r = await tx.subassemblyRevision.create({
          data: { subassembly_id: s.id, seq: 1, rev, status: 'DRAFT', created_by: data.created_by, updated_by: data.created_by },
          select: { id: true },
        });
        if (lines.length) await tx.subassemblyItem.createMany({ data: lines.map((l) => ({ ...l, subassembly_id: s.id, revision_id: r.id })) });
        return s.id;
      });
    },

    /**
     * Changes a subassembly's name / drawing no. (its item follows; a new
     * drawing no. is carried to the materials that referenced the old one) and
     * gives one made before items existed its item via `makeItem(tx)`.
     */
    updateDetails(id, data, oldDrawingNo, makeItem) {
      return db.$transaction(async (tx) => {
        if (makeItem) data.material_id = await makeItem(tx);
        const s = await tx.subassembly.update({ where: { id }, data, select: { material_id: true, name: true, drawing_no: true } });
        if (data.drawing_no && oldDrawingNo && data.drawing_no !== oldDrawingNo) {
          await tx.material.updateMany({ where: { drawing_no: oldDrawingNo }, data: { drawing_no: data.drawing_no } });
        }
        if (s.material_id) {
          await tx.material.update({ where: { id: s.material_id }, data: { item_name: s.name, drawing_no: s.drawing_no, updated_by: data.updated_by ?? null } });
        }
      });
    },

    /** A new draft revision, starting from a copy of `fromRevId`'s lines. */
    createDraftFrom(subId, fromRevId, seq, rev, actorId) {
      return db.$transaction(async (tx) => {
        const r = await tx.subassemblyRevision.create({
          data: { subassembly_id: subId, seq, rev, status: 'DRAFT', created_by: actorId, updated_by: actorId },
          select: { id: true },
        });
        const lines = await tx.subassemblyItem.findMany({
          where: { revision_id: fromRevId },
          select: { material_id: true, child_revision_id: true, quantity: true, sort_order: true },
        });
        if (lines.length) await tx.subassemblyItem.createMany({ data: lines.map((l) => ({ ...l, subassembly_id: subId, revision_id: r.id })) });
        return r.id;
      });
    },

    /** Replaces a draft's lines. */
    replaceLines(subId, revId, lines, actorId) {
      return db.$transaction(async (tx) => {
        await tx.subassemblyItem.deleteMany({ where: { revision_id: revId } });
        if (lines.length) await tx.subassemblyItem.createMany({ data: lines.map((l) => ({ ...l, subassembly_id: subId, revision_id: revId })) });
        await tx.subassemblyRevision.update({ where: { id: revId }, data: { updated_by: actorId } });
      });
    },

    /**
     * Releases a draft: it becomes the current revision and the one released
     * before is superseded. Returns false when it was no longer a draft
     * (someone else released or discarded it meanwhile).
     */
    release(subId, revId, note, actorId) {
      return db.$transaction(async (tx) => {
        const now = new Date();
        const done = await tx.subassemblyRevision.updateMany({
          where: { id: revId, subassembly_id: subId, status: 'DRAFT' },
          data: { status: 'RELEASED', change_note: note, released_at: now, released_by: actorId, updated_by: actorId },
        });
        if (done.count !== 1) return false;
        await tx.subassemblyRevision.updateMany({
          where: { subassembly_id: subId, status: 'RELEASED', id: { not: revId } },
          data: { status: 'SUPERSEDED', updated_by: actorId },
        });
        return true;
      });
    },

    /** Discards a draft (its lines go with it). */
    deleteDraft(subId, revId) {
      return db.subassemblyRevision.deleteMany({ where: { id: revId, subassembly_id: subId, status: 'DRAFT' } });
    },

    /** A live department. @param {number} id */
    findDepartment(id) {
      return db.department.findFirst({ where: active({ id }), select: { id: true, name: true, dept_no: true } });
    },

    /** id → name, for "released by" / "made by". @param {number[]} ids */
    async userNames(ids) {
      const want = [...new Set(ids.filter(Boolean))];
      if (!want.length) return new Map();
      const rows = await db.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true } });
      return new Map(rows.map((u) => [u.id, u.name]));
    },

    /** Deletes a subassembly together with its own item. */
    softDelete(id, materialId, actorId) {
      const now = new Date();
      return db.$transaction(async (tx) => {
        await tx.subassembly.update({ where: { id }, data: { deleted_at: now, updated_by: actorId } });
        if (materialId) await tx.material.update({ where: { id: materialId }, data: { deleted_at: now, updated_by: actorId } });
      });
    },
  };
}

const subassemblyRepository = createSubassemblyRepository(prisma);

module.exports = { subassemblyRepository, createSubassemblyRepository };
