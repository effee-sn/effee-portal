const prisma = require('../../lib/prisma');

/**
 * BOM data-access layer: subassemblies and the materials they are built from.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createBomRepository(db) {
  const active = (where = {}) => ({ ...where, deleted_at: null });

  const materialBrief = Object.freeze({
    id: true, imm_code: true, item_name: true, drawing_no: true, material_type: true,
    material: true, is_active: true, deleted_at: true,
  });

  const listSelect = Object.freeze({
    id: true, name: true, drawing_no: true, created_at: true, updated_at: true,
    _count: { select: { items: true } },
  });

  const detailSelect = Object.freeze({
    id: true, name: true, drawing_no: true, created_at: true, updated_at: true, created_by: true,
    items: {
      select: { id: true, quantity: true, sort_order: true, material: { select: materialBrief } },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    },
  });

  return {
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

    /** Another live subassembly with this drawing no. @param {string} drawingNo @param {number} [exceptId] */
    findByDrawingNo(drawingNo, exceptId) {
      return db.subassembly.findFirst({
        where: active({ drawing_no: drawingNo, ...(exceptId ? { id: { not: exceptId } } : {}) }),
        select: { id: true, name: true },
      });
    },

    /** These materials, deleted ones included (flagged by deleted_at). @param {number[]} ids */
    findMaterials(ids) {
      return db.material.findMany({ where: { id: { in: ids } }, select: { id: true, is_active: true, deleted_at: true, imm_code: true } });
    },

    /**
     * Material picker: active materials matching an IMM code, drawing no. or
     * item name.
     * @param {string} q @param {number} take @param {number} [skip]
     */
    searchMaterials(q, take, skip = 0, excludeIds = []) {
      const term = q.trim();
      return db.material.findMany({
        where: {
          deleted_at: null,
          is_active: true,
          ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
          ...(term ? { OR: [
            { imm_code: { contains: term } },
            { drawing_no: { contains: term } },
            { item_name: { contains: term } },
          ] } : {}),
        },
        select: materialBrief,
        orderBy: { imm_code: 'asc' },
        skip,
        take,
      });
    },

    /** Creates a subassembly with its items. */
    create(data, items) {
      return db.subassembly.create({
        data: { ...data, items: { create: items } },
        select: detailSelect,
      });
    },

    /**
     * Updates a subassembly and replaces its items, in one transaction. A new
     * drawing no. is carried to the materials that referenced the old one.
     */
    update(id, data, items, oldDrawingNo) {
      return db.$transaction(async (tx) => {
        await tx.subassembly.update({ where: { id }, data });
        if (data.drawing_no && oldDrawingNo && data.drawing_no !== oldDrawingNo) {
          await tx.material.updateMany({ where: { drawing_no: oldDrawingNo }, data: { drawing_no: data.drawing_no } });
        }
        if (items) {
          await tx.subassemblyItem.deleteMany({ where: { subassembly_id: id } });
          if (items.length) await tx.subassemblyItem.createMany({ data: items.map((i) => ({ ...i, subassembly_id: id })) });
        }
        return tx.subassembly.findUnique({ where: { id }, select: detailSelect });
      });
    },

    softDelete(id, actorId) {
      return db.subassembly.update({ where: { id }, data: { deleted_at: new Date(), updated_by: actorId }, select: { id: true } });
    },
  };
}

const bomRepository = createBomRepository(prisma);

module.exports = { bomRepository, createBomRepository };
