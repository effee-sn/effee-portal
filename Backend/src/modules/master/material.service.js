const { materialRepository } = require('./material.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError, buildSearchClause } = require('../../core');

/**
 * Material master business logic.
 *
 *   - **IMM code prefixes** (Administrator → Configuration → Material Codes): each prefix
 *     numbers its own codes — prefix + separator ("", "-" or "_") + a
 *     zero-padded running number (e.g. IMM-00001). Once a prefix has been
 *     used, its text, separator and digits are fixed (existing codes must
 *     keep matching); its next number can still be moved forward.
 *   - **Materials** (Master Data → Materials): created in bulk, each row
 *     picking a prefix; the IMM code is generated on save and never changes.
 *
 * @param {ReturnType<typeof import('./material.repository').createMaterialRepository>} repository
 */
function createMaterialService(repository) {
  const SORTABLE_FIELDS = Object.freeze(['imm_code', 'item_name', 'created_at']);
  const SEARCHABLE_FIELDS = Object.freeze(['imm_code', 'item_name', 'drawing_no', 'material', 'description']);

  /** prefix + separator + zero-padded number. */
  const formatCode = (p, n) => `${p.prefix}${p.separator || ''}${String(n).padStart(p.digits, '0')}`;

  const shapePrefix = (p) => {
    const { _count, ...rest } = p;
    return { ...rest, material_count: _count.materials, preview: formatCode(p, p.next_number) };
  };

  /**
   * A material's drawing no. is optional; when given it must be the drawing no.
   * of a BOM subassembly (Master Data → BOM), not free text.
   * @param {Array<{ drawing_no?: string|null }>} rows @param {(i: number) => string} where
   */
  async function assertDrawingNos(rows, where) {
    const wanted = [...new Set(rows.map((r) => r.drawing_no).filter(Boolean))];
    const known = await repository.existingDrawingNos(wanted);
    const errors = [];
    rows.forEach((r, i) => {
      if (r.drawing_no && !known.has(r.drawing_no)) {
        errors.push({ field: where(i), message: `${rows.length > 1 ? `Row ${i + 1}: ` : ''}drawing no. ${r.drawing_no} is not a BOM subassembly — pick one from the list` });
      }
    });
    if (errors.length) throw new ValidationError('Validation failed', errors);
  }

  return {
    SORTABLE_FIELDS,
    formatCode,

    /**
     * Drawing numbers a material may use (the BOM subassemblies'): search-as-
     * you-type, a page of 10 at a time. With `nos`, instead reports which of
     * those drawing numbers exist (to flag pasted ones).
     * @param {{ q?: string, skip?: number, nos?: string }} query
     */
    async drawingOptions({ q = '', skip = 0, nos } = {}) {
      if (nos !== undefined) {
        const list = String(nos).split(',').map((n) => n.trim()).filter(Boolean).slice(0, 500);
        return { known: [...(await repository.existingDrawingNos(list))] };
      }
      const PAGE = 10;
      const rows = await repository.searchDrawingOptions(String(q), Number(skip) || 0, PAGE + 1);
      return { items: rows.slice(0, PAGE), has_more: rows.length > PAGE };
    },

    // ── Prefixes ─────────────────────────────────────────────────────────────
    async listPrefixes() {
      return (await repository.listPrefixes()).map(shapePrefix);
    },

    async createPrefix(dto, actor) {
      if (await repository.findPrefixByText(dto.prefix)) throw new ConflictError(`Prefix "${dto.prefix}" already exists`);
      const p = await repository.createPrefix({
        prefix: dto.prefix,
        separator: dto.separator ?? '',
        digits: dto.digits ?? 5,
        next_number: dto.next_number ?? 1,
        description: dto.description ?? null,
        is_active: dto.is_active ?? true,
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });
      await auditService.record({ action: auditService.Action.CREATE, entity: 'ImmPrefix', entityId: p.id, actor, changes: { prefix: p.prefix } });
      return shapePrefix(p);
    },

    async updatePrefix(id, dto, actor) {
      const before = await repository.findPrefix(id);
      if (!before) throw new NotFoundError('Prefix');
      const used = before._count.materials > 0;
      const format = ['prefix', 'separator', 'digits'].filter((k) => dto[k] !== undefined && dto[k] !== before[k]);
      if (used && format.length) {
        throw new ConflictError(`"${before.prefix}" already has ${before._count.materials} material(s) — its prefix, separator and digits can no longer change`);
      }
      if (dto.prefix !== undefined && dto.prefix !== before.prefix && await repository.findPrefixByText(dto.prefix)) {
        throw new ConflictError(`Prefix "${dto.prefix}" already exists`);
      }
      if (used && dto.next_number !== undefined && dto.next_number < before.next_number) {
        throw new ValidationError('Validation failed', [
          { field: 'next_number', message: `Can't go back below ${before.next_number} — those numbers may already be used` },
        ]);
      }
      const data = { updated_by: actor?.id ?? null };
      for (const k of ['prefix', 'separator', 'digits', 'next_number', 'description', 'is_active']) {
        if (dto[k] !== undefined) data[k] = dto[k];
      }
      const p = await repository.updatePrefix(id, data);
      await auditService.record({ action: auditService.Action.UPDATE, entity: 'ImmPrefix', entityId: id, actor, changes: dto });
      return shapePrefix(p);
    },

    async deletePrefix(id, actor) {
      const before = await repository.findPrefix(id);
      if (!before) throw new NotFoundError('Prefix');
      if (before._count.materials > 0) {
        throw new ConflictError(`"${before.prefix}" is used by ${before._count.materials} material(s) and can't be deleted — make it inactive instead`);
      }
      await repository.deletePrefix(id);
      await auditService.record({ action: auditService.Action.DELETE, entity: 'ImmPrefix', entityId: id, actor, changes: { prefix: before.prefix } });
    },

    // ── Materials ────────────────────────────────────────────────────────────
    /** @param {import('../../core/http/queryOptions').ListQuery} query */
    async list(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      return repository.findPage({ where: { ...query.filters, ...(search || {}) }, orderBy: query.orderBy, skip: query.skip, take: query.take });
    },

    async getById(id) {
      const m = await repository.findById(id);
      if (!m) throw new NotFoundError('Material');
      return m;
    },

    /**
     * Creates many materials at once; each gets its IMM code from its prefix.
     * @param {{ rows: Array<object> }} dto
     */
    async createBulk(dto, actor) {
      const prefixes = new Map((await repository.listPrefixes()).map((p) => [p.id, p]));
      const errors = [];
      dto.rows.forEach((r, i) => {
        const p = prefixes.get(r.prefix_id);
        if (!p) errors.push({ field: `rows.${i}.prefix_id`, message: `Row ${i + 1}: choose an IMM code prefix` });
        else if (!p.is_active) errors.push({ field: `rows.${i}.prefix_id`, message: `Row ${i + 1}: prefix "${p.prefix}" is inactive` });
      });
      if (errors.length) throw new ValidationError('Validation failed', errors);
      await assertDrawingNos(dto.rows, (i) => `rows.${i}.drawing_no`);

      let created;
      try {
        created = await repository.createMany(dto.rows, formatCode, actor?.id ?? null);
      } catch (err) {
        if (err.code === 'IMM_CODE_TAKEN') {
          throw new ConflictError(`${err.message} — raise that prefix's next number in Administrator → Configuration → Material Codes`);
        }
        throw err;
      }
      await auditService.record({
        action: auditService.Action.CREATE, entity: 'Material', entityId: null, actor,
        changes: { count: created.length, codes: created.map((m) => m.imm_code) },
      });
      return created;
    },

    /** Edits a material. Its IMM code and prefix never change. */
    async update(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Material');
      // Only a changed drawing no. is checked: one whose subassembly was since
      // deleted may stay as it is.
      if (dto.drawing_no && dto.drawing_no !== before.drawing_no) await assertDrawingNos([dto], () => 'drawing_no');
      const data = { updated_by: actor?.id ?? null };
      for (const k of ['drawing_no', 'item_name', 'description', 'technical_spec', 'material_type', 'material', 'remarks', 'is_active']) {
        if (dto[k] !== undefined) data[k] = dto[k];
      }
      const m = await repository.updateMaterial(id, data);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'Material', entityId: id, actor,
        changes: auditService.diff(before, data),
      });
      return m;
    },

    async remove(id, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Material');
      await repository.softDelete(id, actor?.id ?? null);
      await auditService.record({ action: auditService.Action.DELETE, entity: 'Material', entityId: id, actor, changes: { imm_code: before.imm_code } });
    },
  };
}

const materialService = createMaterialService(materialRepository);

module.exports = { materialService, createMaterialService };
