const { bomRepository } = require('./bom.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError, buildSearchClause } = require('../../core');

/**
 * BOM business logic (Master Data → BOM).
 *
 * A subassembly is a named part with a drawing no., built from materials of the
 * material master, each with a quantity. Drawing numbers are unique among live
 * subassemblies; a material appears once per subassembly (raise its quantity
 * instead). Only active materials can be added; one made inactive later stays
 * on the subassembly, flagged.
 *
 * @param {ReturnType<typeof import('./bom.repository').createBomRepository>} repository
 */
function createBomService(repository) {
  const SORTABLE_FIELDS = Object.freeze(['name', 'drawing_no', 'updated_at', 'created_at']);
  const SEARCHABLE_FIELDS = Object.freeze(['name', 'drawing_no']);

  const shapeList = (s) => { const { _count, ...rest } = s; return { ...rest, item_count: _count.items }; };

  async function assertDrawingFree(drawingNo, exceptId) {
    const clash = await repository.findByDrawingNo(drawingNo, exceptId);
    if (clash) throw new ConflictError(`Drawing no. ${drawingNo} is already used by "${clash.name}"`);
  }

  /** Validates the item list and maps it to rows. @param {Array<{ material_id: number, quantity: number }>} items */
  async function toRows(items, existingIds = new Set()) {
    const ids = items.map((i) => i.material_id);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('Validation failed', [{ field: 'items', message: 'A material is listed twice — raise its quantity instead' }]);
    }
    const found = new Map((await repository.findMaterials(ids)).map((m) => [m.id, m]));
    const errors = [];
    items.forEach((i, idx) => {
      const m = found.get(i.material_id);
      if (!m) errors.push({ field: `items.${idx}.material_id`, message: `Line ${idx + 1}: material not found` });
      // Inactive or deleted materials can't be newly added; ones already on it may stay.
      else if ((!m.is_active || m.deleted_at) && !existingIds.has(m.id)) errors.push({ field: `items.${idx}.material_id`, message: `Line ${idx + 1}: ${m.imm_code} is ${m.deleted_at ? 'deleted' : 'inactive'}` });
    });
    if (errors.length) throw new ValidationError('Validation failed', errors);
    return items.map((i, idx) => ({ material_id: i.material_id, quantity: i.quantity, sort_order: idx }));
  }

  return {
    SORTABLE_FIELDS,

    /** @param {import('../../core/http/queryOptions').ListQuery} query */
    async list(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const { items, total } = await repository.findPage({
        where: { ...query.filters, ...(search || {}) }, orderBy: query.orderBy, skip: query.skip, take: query.take,
      });
      return { items: items.map(shapeList), total };
    },

    async getById(id) {
      const s = await repository.findById(id);
      if (!s) throw new NotFoundError('Subassembly');
      return s;
    },

    /** Material picker: by IMM code, drawing no. or item name — 10 at a time. */
    /** 10 at a time; `exclude` (comma-separated ids) leaves out materials already on the subassembly. */
    async searchMaterials(q, skip = 0, exclude = '') {
      const PAGE = 10;
      const excludeIds = String(exclude || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
      const rows = await repository.searchMaterials(String(q || ''), PAGE + 1, Number(skip) || 0, excludeIds);
      return { items: rows.slice(0, PAGE), has_more: rows.length > PAGE };
    },

    async create(dto, actor) {
      await assertDrawingFree(dto.drawing_no);
      const rows = await toRows(dto.items || []);
      const s = await repository.create({
        name: dto.name, drawing_no: dto.drawing_no, created_by: actor?.id ?? null, updated_by: actor?.id ?? null,
      }, rows);
      await auditService.record({
        action: auditService.Action.CREATE, entity: 'Subassembly', entityId: s.id, actor,
        changes: { name: s.name, drawing_no: s.drawing_no, materials: rows.length },
      });
      return s;
    },

    async update(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Subassembly');
      if (dto.drawing_no !== undefined && dto.drawing_no !== before.drawing_no) await assertDrawingFree(dto.drawing_no, id);
      const data = { updated_by: actor?.id ?? null };
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.drawing_no !== undefined) data.drawing_no = dto.drawing_no;
      const rows = dto.items !== undefined
        ? await toRows(dto.items, new Set(before.items.map((i) => i.material.id)))
        : undefined;
      const s = await repository.update(id, data, rows, before.drawing_no);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'Subassembly', entityId: id, actor,
        changes: {
          ...(dto.name !== undefined && dto.name !== before.name ? { name: { from: before.name, to: dto.name } } : {}),
          ...(dto.drawing_no !== undefined && dto.drawing_no !== before.drawing_no ? { drawing_no: { from: before.drawing_no, to: dto.drawing_no } } : {}),
          ...(rows ? { materials: { from: before.items.length, to: rows.length } } : {}),
        },
      });
      return s;
    },

    async remove(id, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Subassembly');
      await repository.softDelete(id, actor?.id ?? null);
      await auditService.record({
        action: auditService.Action.DELETE, entity: 'Subassembly', entityId: id, actor,
        changes: { name: before.name, drawing_no: before.drawing_no },
      });
    },
  };
}

const bomService = createBomService(bomRepository);

module.exports = { bomService, createBomService };
