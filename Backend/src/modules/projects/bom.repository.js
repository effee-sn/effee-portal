const prisma = require('../../lib/prisma');

/**
 * Project BOM data-access layer: a project's BOM revisions, their lines (per
 * machine) and, once locked, their exploded tags.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createBomRepository(db) {
  const materialBrief = Object.freeze({
    id: true, imm_code: true, item_name: true, drawing_no: true, material_type: true,
    material: true, is_active: true, deleted_at: true, uom: { select: { code: true } },
    // Set when it is a subassembly's item: its current (released) revision and department.
    subassembly: {
      select: {
        id: true, deleted_at: true, department_id: true,
        revisions: { where: { status: 'RELEASED' }, select: { id: true, rev: true } },
      },
    },
  });

  const lineSelect = Object.freeze({
    id: true, machine_id: true, quantity: true, sort_order: true, child_revision_id: true,
    child_revision: { select: { id: true, rev: true, status: true, subassembly_id: true } },
    department: { select: { id: true, name: true, dept_no: true, deleted_at: true } },
    material: { select: materialBrief },
  });

  const bomSummary = Object.freeze({
    id: true, rev: true, status: true, change_note: true, locked_at: true, locked_by: true,
    created_at: true, created_by: true, updated_at: true,
    _count: { select: { lines: true, items: true } },
  });

  const itemSelect = Object.freeze({
    id: true, machine_id: true, tag: true, parent_tag: true, level: true, sort_order: true,
    material_id: true, is_subassembly: true, revision_id: true, rev: true, imm_code: true, item_name: true,
    drawing_no: true, material_type: true, material_text: true, technical_spec: true, uom: true,
    dept_no: true, department: true, qty_per_parent: true, quantity: true,
  });

  return {
    /** A live project with its live machines. @param {number} id */
    findProject(id) {
      return db.project.findFirst({
        where: { id, deleted_at: null },
        select: {
          id: true, code: true, name: true,
          machines: { where: { deleted_at: null }, select: { id: true, machine_no: true, name: true, sort_order: true }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] },
        },
      });
    },

    /** A project's BOM revisions, newest first. @param {number} projectId */
    listBoms(projectId) {
      return db.projectBom.findMany({ where: { project_id: projectId }, select: bomSummary, orderBy: { rev: 'desc' } });
    },

    /** One BOM revision with its lines. @param {number} projectId @param {number} bomId */
    findBom(projectId, bomId) {
      return db.projectBom.findFirst({
        where: { id: bomId, project_id: projectId },
        select: { ...bomSummary, lines: { select: lineSelect, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] } },
      });
    },

    /** These materials (deleted ones included) with their subassembly, if any. @param {number[]} ids */
    findMaterials(ids) {
      if (!ids.length) return [];
      return db.material.findMany({ where: { id: { in: ids } }, select: materialBrief });
    },

    /** Snapshot details of these materials (for the tags at lock). @param {number[]} ids */
    materialDetails(ids) {
      if (!ids.length) return [];
      return db.material.findMany({ where: { id: { in: ids } }, select: { id: true, technical_spec: true } });
    },

    /** These live departments. @param {number[]} ids */
    findDepartments(ids) {
      if (!ids.length) return [];
      return db.department.findMany({ where: { id: { in: ids }, deleted_at: null }, select: { id: true, name: true, dept_no: true } });
    },

    /**
     * Lines of these subassembly revisions — one level of an explosion — with
     * their materials and the child revisions they hold. @param {number[]} revIds
     */
    revisionLines(revIds) {
      if (!revIds.length) return [];
      return db.subassemblyItem.findMany({
        where: { revision_id: { in: revIds } },
        select: {
          revision_id: true, quantity: true, child_revision_id: true,
          child_revision: { select: { id: true, rev: true } },
          material: { select: materialBrief },
        },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      });
    },

    /** Starts a draft revision, copying the lines of `fromBomId` when given. */
    createDraft(projectId, rev, fromBomId, actorId) {
      return db.$transaction(async (tx) => {
        const b = await tx.projectBom.create({
          data: { project_id: projectId, rev, status: 'DRAFT', created_by: actorId, updated_by: actorId },
          select: { id: true },
        });
        if (fromBomId) {
          const lines = await tx.projectBomLine.findMany({
            where: { bom_id: fromBomId },
            select: { machine_id: true, material_id: true, child_revision_id: true, department_id: true, quantity: true, sort_order: true },
          });
          if (lines.length) await tx.projectBomLine.createMany({ data: lines.map((l) => ({ ...l, bom_id: b.id })) });
        }
        return b.id;
      });
    },

    /** Replaces a draft's lines. */
    replaceLines(bomId, lines, actorId) {
      return db.$transaction(async (tx) => {
        await tx.projectBomLine.deleteMany({ where: { bom_id: bomId } });
        if (lines.length) await tx.projectBomLine.createMany({ data: lines.map((l) => ({ ...l, bom_id: bomId })) });
        await tx.projectBom.update({ where: { id: bomId }, data: { updated_by: actorId } });
      });
    },

    /**
     * Locks a draft with its exploded tags: it becomes the current BOM and the
     * one locked before is superseded. Returns false when it was no longer a
     * draft (locked or discarded meanwhile).
     */
    lock(projectId, bomId, note, items, actorId) {
      return db.$transaction(async (tx) => {
        const done = await tx.projectBom.updateMany({
          where: { id: bomId, project_id: projectId, status: 'DRAFT' },
          data: { status: 'RELEASED', change_note: note, locked_at: new Date(), locked_by: actorId, updated_by: actorId },
        });
        if (done.count !== 1) return false;
        await tx.projectBom.updateMany({
          where: { project_id: projectId, status: 'RELEASED', id: { not: bomId } },
          data: { status: 'SUPERSEDED', updated_by: actorId },
        });
        for (let i = 0; i < items.length; i += 1000) {
          await tx.projectBomItem.createMany({ data: items.slice(i, i + 1000).map((it) => ({ ...it, bom_id: bomId })) });
        }
        return true;
      }, { timeout: 60000 });
    },

    /** Discards a draft. */
    deleteDraft(projectId, bomId) {
      return db.projectBom.deleteMany({ where: { id: bomId, project_id: projectId, status: 'DRAFT' } });
    },

    /** A locked revision's tags, optionally for one machine. */
    items(bomId, machineId) {
      return db.projectBomItem.findMany({
        where: { bom_id: bomId, ...(machineId ? { machine_id: machineId } : {}) },
        select: itemSelect,
        orderBy: [{ machine_id: 'asc' }, { sort_order: 'asc' }],
      });
    },

    /** id → name, for "locked by" / "started by". @param {number[]} ids */
    async userNames(ids) {
      const want = [...new Set(ids.filter(Boolean))];
      if (!want.length) return new Map();
      const rows = await db.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true } });
      return new Map(rows.map((u) => [u.id, u.name]));
    },
  };
}

const bomRepository = createBomRepository(prisma);

module.exports = { bomRepository, createBomRepository };
