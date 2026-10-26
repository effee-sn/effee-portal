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
     * Drawing numbers of live subassemblies (what a material's drawing no.
     * may be), matching a search on drawing no. or name — one page.
     * @param {string} q @param {number} skip @param {number} take
     */
    searchDrawingOptions(q, skip, take) {
      const term = q.trim();
      return db.subassembly.findMany({
        where: { deleted_at: null, ...(term ? { OR: [{ drawing_no: { contains: term } }, { name: { contains: term } }] } : {}) },
        select: { drawing_no: true, name: true },
        orderBy: { drawing_no: 'asc' },
        skip,
        take,
      });
    },

    /** Which of these drawing numbers belong to live subassemblies. @param {string[]} nos */
    async existingDrawingNos(nos) {
      if (!nos.length) return new Set();
      const rows = await db.subassembly.findMany({ where: { deleted_at: null, drawing_no: { in: nos } }, select: { drawing_no: true } });
      return new Set(rows.map((r) => r.drawing_no));
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
     * or draft revision (superseded ones are history), and the subassembly
     * whose drawing it belongs to (its drawing no.).
     * @param {number} id @param {string|null} drawingNo
     */
    async whereUsed(id, drawingNo) {
      const [lines, drawing] = await Promise.all([
        db.subassemblyItem.findMany({
          where: { ...liveLines(id), revision: { status: { in: ['DRAFT', 'RELEASED'] } } },
          select: {
            quantity: true,
            subassembly: { select: { id: true, name: true, drawing_no: true } },
            revision: { select: { rev: true, status: true } },
          },
          orderBy: { subassembly: { drawing_no: 'asc' } },
        }),
        drawingNo
          ? db.subassembly.findFirst({ where: { deleted_at: null, drawing_no: drawingNo }, select: { id: true, name: true, drawing_no: true } })
          : null,
      ]);
      return { lines, drawing };
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
    createMany(rows, formatCode, actorId) {
      return db.$transaction((tx) => this.createManyIn(tx, rows, formatCode, actorId));
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
