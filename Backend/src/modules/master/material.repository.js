const prisma = require('../../lib/prisma');

/**
 * Material master data-access layer: IMM code prefixes and materials.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createMaterialRepository(db) {
  const active = (where = {}) => ({ ...where, deleted_at: null });

  const prefixSelect = Object.freeze({
    id: true, prefix: true, separator: true, digits: true, next_number: true,
    description: true, is_active: true, created_at: true, updated_at: true,
    _count: { select: { materials: true } },
  });

  const materialSelect = Object.freeze({
    id: true, imm_code: true, prefix_id: true, drawing_no: true, item_name: true,
    description: true, technical_spec: true, material_type: true, material: true,
    remarks: true, is_active: true, created_at: true, updated_at: true, created_by: true, uom_id: true,
    prefix: { select: { id: true, prefix: true } },
    uom: { select: { id: true, code: true, name: true } },
    // Set when the material is a subassembly's own item.
    subassembly: { select: { id: true } },
    // A Finished part's current and draft drawing revisions.
    revisions: { where: { status: { in: ['RELEASED', 'DRAFT'] } }, select: { id: true, rev: true, status: true } },
  });

  const revisionSelect = Object.freeze({
    id: true, material_id: true, seq: true, rev: true, status: true, change_note: true,
    description: true, technical_spec: true, material_text: true,
    released_at: true, released_by: true, created_at: true, created_by: true, updated_at: true,
  });

  const unitSelect = Object.freeze({
    id: true, code: true, name: true, is_active: true, sort_order: true, created_at: true, updated_at: true,
    _count: { select: { materials: true } },
  });

  // Lines on live subassemblies — what makes a material "used".
  const liveLines = (materialId) => ({ material_id: materialId, subassembly: { deleted_at: null } });

  return {
    // ── Prefixes ─────────────────────────────────────────────────────────────
    listPrefixes() {
      return db.immPrefix.findMany({ select: prefixSelect, orderBy: { prefix: 'asc' } });
    },

    /** @param {number} id */
    findPrefix(id) {
      return db.immPrefix.findUnique({ where: { id }, select: prefixSelect });
    },

    /** @param {string} prefix */
    findPrefixByText(prefix) {
      return db.immPrefix.findUnique({ where: { prefix }, select: { id: true } });
    },

    createPrefix(data) {
      return db.immPrefix.create({ data, select: prefixSelect });
    },

    updatePrefix(id, data) {
      return db.immPrefix.update({ where: { id }, data, select: prefixSelect });
    },

    deletePrefix(id) {
      return db.immPrefix.delete({ where: { id }, select: { id: true } });
    },

    /**
     * Live materials already using any of these drawing numbers (the database
     * compares without regard to case).
     * @param {string[]} nos @param {number[]} [exceptIds]  materials to leave out
     */
    findByDrawingNos(nos, exceptIds = []) {
      if (!nos.length) return [];
      return db.material.findMany({
        where: active({ drawing_no: { in: nos }, ...(exceptIds.length ? { id: { notIn: exceptIds } } : {}) }),
        select: { id: true, imm_code: true, item_name: true, drawing_no: true },
      });
    },

    // ── Materials ────────────────────────────────────────────────────────────
    async findPage({ where, orderBy, skip, take }) {
      const scoped = active(where);
      const [items, total] = await Promise.all([
        db.material.findMany({ where: scoped, select: materialSelect, orderBy, skip, take }),
        db.material.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /** @param {number} id */
    findById(id) {
      return db.material.findFirst({ where: active({ id }), select: materialSelect });
    },

    updateMaterial(id, data) {
      return db.material.update({ where: { id }, data, select: materialSelect });
    },

    softDelete(id, actorId) {
      return db.material.update({ where: { id }, data: { deleted_at: new Date(), updated_by: actorId }, select: { id: true } });
    },

    /** How many live subassemblies list this material. @param {number} id */
    usageCount(id) {
      return db.subassemblyItem.count({ where: liveLines(id) });
    },

    /**
     * Where a material is used: the subassemblies listing it in their current
     * or draft revision (superseded ones are history).
     * @param {number} id
     */
    whereUsed(id) {
      return db.subassemblyItem.findMany({
        where: { ...liveLines(id), revision: { status: { in: ['DRAFT', 'RELEASED'] } } },
        select: {
          quantity: true,
          subassembly: { select: { id: true, name: true, drawing_no: true } },
          revision: { select: { rev: true, status: true } },
          part_revision: { select: { id: true, rev: true } },
        },
        orderBy: { subassembly: { drawing_no: 'asc' } },
      });
    },

    /**
     * Live materials with any of these item names (the database compares
     * without regard to case), to look for duplicates among.
     * @param {string[]} names
     */
    findByItemNames(names) {
      if (!names.length) return [];
      return db.material.findMany({
        where: active({ item_name: { in: names } }),
        select: { id: true, imm_code: true, item_name: true, material: true, technical_spec: true },
      });
    },

    /** Every material matching a filter, for export (capped). */
    findAll({ where, orderBy, take }) {
      return db.material.findMany({ where: active(where), select: materialSelect, orderBy, take });
    },

    // ── Units of measure ─────────────────────────────────────────────────────
    listUnits() {
      return db.unitOfMeasure.findMany({ select: unitSelect, orderBy: [{ sort_order: 'asc' }, { code: 'asc' }] });
    },

    /** @param {number} id */
    findUnit(id) {
      return db.unitOfMeasure.findUnique({ where: { id }, select: unitSelect });
    },

    /** @param {string} code */
    findUnitByCode(code) {
      return db.unitOfMeasure.findUnique({ where: { code }, select: { id: true } });
    },

    createUnit(data) {
      return db.unitOfMeasure.create({ data, select: unitSelect });
    },

    updateUnit(id, data) {
      return db.unitOfMeasure.update({ where: { id }, data, select: unitSelect });
    },

    deleteUnit(id) {
      return db.unitOfMeasure.delete({ where: { id }, select: { id: true } });
    },

    /**
     * Creates materials in one transaction, giving each its IMM code. Each
     * prefix's counter is advanced by the number of rows using it in a single
     * UPDATE (which locks the row), so two people saving at once never get the
     * same number.
     *
     * @param {Array<object>} rows  validated rows, each with prefix_id
     * @param {(p: { prefix: string, separator: string, digits: number }, n: number) => string} formatCode
     * @param {number|null} actorId
     * @returns {Promise<Array<object>>} the created materials, in input order
     */
    createMany(rows, formatCode, actorId, originalLabel) {
      return db.$transaction(async (tx) => {
        const created = await this.createManyIn(tx, rows, formatCode, actorId);
        // A Finished part starts with its first drawing revision, released.
        const parts = created.filter((m) => m.material_type === 'FINISHED');
        if (!parts.length) return created;
        const now = new Date();
        await tx.materialRevision.createMany({
          data: parts.map((m) => ({
            material_id: m.id, seq: 1, rev: originalLabel, status: 'RELEASED', change_note: 'First release',
            description: m.description, technical_spec: m.technical_spec, material_text: m.material,
            released_at: now, released_by: actorId, created_by: actorId, updated_by: actorId,
          })),
        });
        return Promise.all(created.map((m) => (m.material_type === 'FINISHED'
          ? tx.material.findUnique({ where: { id: m.id }, select: materialSelect }) : m)));
      });
    },

    /** id → name, for "released by". @param {number[]} ids */
    async userNames(ids) {
      const want = [...new Set(ids.filter(Boolean))];
      if (!want.length) return new Map();
      const rows = await db.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true } });
      return new Map(rows.map((u) => [u.id, u.name]));
    },

    // ── Drawing revisions of a Finished part ─────────────────────────────────
    /** All of a part's revisions, newest first. @param {number} materialId */
    listRevisions(materialId) {
      return db.materialRevision.findMany({ where: { material_id: materialId }, select: revisionSelect, orderBy: { seq: 'desc' } });
    },

    /** @param {number} materialId @param {number} revId */
    findRevision(materialId, revId) {
      return db.materialRevision.findFirst({ where: { id: revId, material_id: materialId }, select: revisionSelect });
    },

    /** Highest revision number so far. @param {number} materialId */
    async lastRevisionSeq(materialId) {
      const r = await db.materialRevision.aggregate({ where: { material_id: materialId }, _max: { seq: true } });
      return r._max.seq ?? 0;
    },

    createRevision(data) {
      return db.materialRevision.create({ data, select: revisionSelect });
    },

    updateRevision(id, data) {
      return db.materialRevision.update({ where: { id }, data, select: revisionSelect });
    },

    deleteRevisionDraft(materialId, revId) {
      return db.materialRevision.deleteMany({ where: { id: revId, material_id: materialId, status: 'DRAFT' } });
    },

    /**
     * Releases a draft: it becomes the current revision, the one before is
     * superseded, and the part takes the draft's description, specification and
     * material. False when it was no longer a draft (released or discarded meanwhile).
     */
    releaseRevision(materialId, revId, note, actorId) {
      return db.$transaction(async (tx) => {
        const now = new Date();
        const done = await tx.materialRevision.updateMany({
          where: { id: revId, material_id: materialId, status: 'DRAFT' },
          data: { status: 'RELEASED', change_note: note, released_at: now, released_by: actorId, updated_by: actorId },
        });
        if (done.count !== 1) return false;
        await tx.materialRevision.updateMany({
          where: { material_id: materialId, status: 'RELEASED', id: { not: revId } },
          data: { status: 'SUPERSEDED', updated_by: actorId },
        });
        const r = await tx.materialRevision.findUnique({ where: { id: revId }, select: { description: true, technical_spec: true, material_text: true } });
        await tx.material.update({
          where: { id: materialId },
          data: { description: r.description, technical_spec: r.technical_spec, material: r.material_text, updated_by: actorId },
        });
        return true;
      });
    },

    /**
     * `createMany`'s work inside a transaction the caller already runs (e.g. a
     * subassembly created together with its own item).
     * @param {import('@prisma/client').Prisma.TransactionClient} tx
     */
    async createManyIn(tx, rows, formatCode, actorId) {
      // Reserve a block of numbers per prefix.
      const counts = new Map();
      for (const r of rows) counts.set(r.prefix_id, (counts.get(r.prefix_id) || 0) + 1);
      const nextFor = new Map();
      for (const [prefixId, n] of counts) {
        const p = await tx.immPrefix.update({
          where: { id: prefixId },
          data: { next_number: { increment: n } },
          select: { prefix: true, separator: true, digits: true, next_number: true },
        });
        nextFor.set(prefixId, { ...p, cursor: p.next_number - n });
      }

      const codes = rows.map((r) => {
        const p = nextFor.get(r.prefix_id);
        const code = formatCode(p, p.cursor);
        p.cursor += 1;
        return code;
      });

      // A prefix whose counter was set back could collide with existing codes.
      const taken = await tx.material.findMany({ where: { imm_code: { in: codes } }, select: { imm_code: true } });
      if (taken.length) {
        const err = new Error(`Code ${taken.map((t) => t.imm_code).join(', ')} already exists`);
        err.code = 'IMM_CODE_TAKEN';
        throw err;
      }

      const created = [];
      for (let i = 0; i < rows.length; i += 1) {
        created.push(await tx.material.create({
          data: { ...rows[i], imm_code: codes[i], created_by: actorId, updated_by: actorId },
          select: materialSelect,
        }));
      }
      return created;
    },
  };
}

const materialRepository = createMaterialRepository(prisma);

module.exports = { materialRepository, createMaterialRepository };
