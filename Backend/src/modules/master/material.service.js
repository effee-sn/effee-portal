const XLSX = require('xlsx');
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
 *   - **Units of measure** (Administrator → Configuration → Units of Measure):
 *     every material counts in one. A unit in use keeps its code.
 *   - **Used materials** — on any live subassembly — can't be deleted (only
 *     made inactive) and keep their unit, so quantities keep their meaning.
 *   - **A subassembly's own item** (Master Data → Subassemblies) takes its name,
 *     drawing no. and type from the subassembly: those are changed there, and
 *     the item is deleted with it.
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
   * of a subassembly (Master Data → Subassemblies), not free text.
   * @param {Array<{ drawing_no?: string|null }>} rows @param {(i: number) => string} where
   */
  async function assertDrawingNos(rows, where) {
    const wanted = [...new Set(rows.map((r) => r.drawing_no).filter(Boolean))];
    const known = await repository.existingDrawingNos(wanted);
    const errors = [];
    rows.forEach((r, i) => {
      if (r.drawing_no && !known.has(r.drawing_no)) {
        errors.push({ field: where(i), message: `${rows.length > 1 ? `Row ${i + 1}: ` : ''}drawing no. ${r.drawing_no} is not a subassembly's — pick one from the list` });
      }
    });
    if (errors.length) throw new ValidationError('Validation failed', errors);
  }

  const shapeUnit = (u) => {
    const { _count, ...rest } = u;
    return { ...rest, material_count: _count.materials };
  };

  /** Each row's unit must exist and be active. @param {Array<{ uom_id?: number }>} rows @param {(i: number) => string} where */
  async function assertUnits(rows, where) {
    const units = new Map((await repository.listUnits()).map((u) => [u.id, u]));
    const errors = [];
    rows.forEach((r, i) => {
      const u = units.get(r.uom_id);
      const at = rows.length > 1 ? `Row ${i + 1}: ` : '';
      if (!u) errors.push({ field: where(i), message: `${at}choose a unit of measure` });
      else if (!u.is_active) errors.push({ field: where(i), message: `${at}unit "${u.code}" is inactive` });
    });
    if (errors.length) throw new ValidationError('Validation failed', errors);
  }

  /** Name / material / spec compared loosely: case and extra spaces ignored. */
  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const sameKey = (r) => `${norm(r.item_name)}|${norm(r.material)}|${norm(r.technical_spec)}`;

  return {
    SORTABLE_FIELDS,
    formatCode,

    /**
     * Drawing numbers a material may use (the subassemblies'): search-as-
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
      await assertUnits(dto.rows, (i) => `rows.${i}.uom_id`);
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
      // One entry per material, so each has its own history from the start.
      await Promise.all(created.map((m) => auditService.record({
        action: auditService.Action.CREATE, entity: 'Material', entityId: m.id, actor,
        changes: { imm_code: m.imm_code, item_name: m.item_name, unit: m.uom.code },
      })));
      return created;
    },

    /**
     * Rows (of a bulk entry) that look like a material already in the master,
     * or like an earlier row — same item name, material and specification,
     * ignoring case and extra spaces. A warning only: saving is still allowed.
     * @param {{ rows: Array<{ item_name: string, material: string, technical_spec: string }> }} dto
     */
    async duplicates(dto) {
      const names = [...new Set(dto.rows.map((r) => String(r.item_name || '').trim()).filter(Boolean))];
      const existing = new Map();
      for (const m of await repository.findByItemNames(names)) {
        const k = sameKey(m);
        if (!existing.has(k)) existing.set(k, m);
      }
      const seen = new Map();
      const matches = [];
      dto.rows.forEach((r, i) => {
        if (!norm(r.item_name)) return;
        const k = sameKey(r);
        const m = existing.get(k);
        if (m) matches.push({ row: i, kind: 'existing', id: m.id, imm_code: m.imm_code, item_name: m.item_name });
        else if (seen.has(k)) matches.push({ row: i, kind: 'batch', other_row: seen.get(k) });
        if (!seen.has(k)) seen.set(k, i);
      });
      return { matches };
    },

    /** Where a material is used (subassemblies) and the drawing it belongs to. */
    async whereUsed(id) {
      const m = await repository.findById(id);
      if (!m) throw new NotFoundError('Material');
      const { lines, drawing } = await repository.whereUsed(id, m.drawing_no);
      return {
        drawing,
        // A subassembly's own item: its drawing is that subassembly.
        self: Boolean(m.subassembly && drawing && drawing.id === m.subassembly.id),
        subassemblies: lines.map((l) => ({ ...l.subassembly, quantity: l.quantity, revision: l.revision })),
      };
    },

    /** A material's own change history, newest first. */
    async history(id, { page = 1, limit = 20 } = {}) {
      const m = await repository.findById(id);
      if (!m) throw new NotFoundError('Material');
      const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const p = Math.max(Number(page) || 1, 1);
      const { items, total } = await auditService.list({
        filters: { entity: 'Material', entity_id: String(id) }, skip: (p - 1) * take, take,
      });
      return { items, total, page: p, limit: take };
    },

    /**
     * The (filtered) list as an Excel file. Columns after the IMM code follow
     * the bulk entry's paste order, so an export can be pasted back in.
     * @param {import('../../core/http/queryOptions').ListQuery} query
     */
    async exportXlsx(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const rows = await repository.findAll({ where: { ...query.filters, ...(search || {}) }, orderBy: query.orderBy, take: 20000 });
      const TYPE_LABEL = { FINISHED: 'Finished', BOUGHT_OUT: 'Bought-out', CONSUMABLE: 'Consumables' };
      const head = ['IMM code', 'Drawing no.', 'Item name', 'Description', 'Technical specification', 'Material type', 'Material', 'Unit', 'Remarks', 'Status'];
      const body = rows.map((m) => [
        m.imm_code, m.drawing_no || '', m.item_name, m.description, m.technical_spec,
        TYPE_LABEL[m.material_type] || m.material_type, m.material, m.uom?.code || '', m.remarks || '', m.is_active ? 'Active' : 'Inactive',
      ]);
      const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
      ws['!cols'] = head.map((h, ci) => ({ wch: Math.min(48, Math.max(8, h.length, ...body.map((r) => String(r[ci]).length)) + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Materials');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    },

    // ── Units of measure ─────────────────────────────────────────────────────
    async listUnits() {
      return (await repository.listUnits()).map(shapeUnit);
    },

    async createUnit(dto, actor) {
      if (await repository.findUnitByCode(dto.code)) throw new ConflictError(`Unit "${dto.code}" already exists`);
      const u = await repository.createUnit({
        code: dto.code, name: dto.name, is_active: dto.is_active ?? true, sort_order: dto.sort_order ?? 0,
        created_by: actor?.id ?? null, updated_by: actor?.id ?? null,
      });
      await auditService.record({ action: auditService.Action.CREATE, entity: 'UnitOfMeasure', entityId: u.id, actor, changes: { code: u.code } });
      return shapeUnit(u);
    },

    async updateUnit(id, dto, actor) {
      const before = await repository.findUnit(id);
      if (!before) throw new NotFoundError('Unit');
      if (dto.code !== undefined && dto.code !== before.code) {
        if (before._count.materials > 0) {
          throw new ConflictError(`"${before.code}" is used by ${before._count.materials} material(s) — its code can no longer change (the name still can)`);
        }
        if (await repository.findUnitByCode(dto.code)) throw new ConflictError(`Unit "${dto.code}" already exists`);
      }
      const data = { updated_by: actor?.id ?? null };
      for (const k of ['code', 'name', 'is_active', 'sort_order']) if (dto[k] !== undefined) data[k] = dto[k];
      const u = await repository.updateUnit(id, data);
      await auditService.record({ action: auditService.Action.UPDATE, entity: 'UnitOfMeasure', entityId: id, actor, changes: auditService.diff(before, data) });
      return shapeUnit(u);
    },

    async deleteUnit(id, actor) {
      const before = await repository.findUnit(id);
      if (!before) throw new NotFoundError('Unit');
      if (before._count.materials > 0) {
        throw new ConflictError(`"${before.code}" is used by ${before._count.materials} material(s) and can't be deleted — make it inactive instead`);
      }
      await repository.deleteUnit(id);
      await auditService.record({ action: auditService.Action.DELETE, entity: 'UnitOfMeasure', entityId: id, actor, changes: { code: before.code } });
    },

    /** Edits a material. Its IMM code and prefix never change. */
    async update(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Material');
      if (before.subassembly) {
        const owned = { item_name: 'item name', drawing_no: 'drawing no.', material_type: 'material type' };
        const changed = Object.keys(owned).filter((k) => dto[k] !== undefined && dto[k] !== before[k]);
        if (changed.length) {
          throw new ConflictError(`${before.imm_code} is a subassembly's item — change its ${changed.map((k) => owned[k]).join(', ')} on the subassembly`);
        }
      }
      // Only a changed drawing no. is checked: one whose subassembly was since
      // deleted may stay as it is.
      if (dto.drawing_no && dto.drawing_no !== before.drawing_no) await assertDrawingNos([dto], () => 'drawing_no');
      if (dto.uom_id !== undefined && dto.uom_id !== before.uom_id) {
        const used = await repository.usageCount(id);
        if (used) throw new ConflictError(`${before.imm_code} is on ${used} subassembly line(s) — its unit can no longer change`);
        await assertUnits([dto], () => 'uom_id');
      }
      const data = { updated_by: actor?.id ?? null };
      for (const k of ['drawing_no', 'item_name', 'description', 'technical_spec', 'material_type', 'material', 'uom_id', 'remarks', 'is_active']) {
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
      if (before.subassembly) throw new ConflictError(`${before.imm_code} is a subassembly's item — delete the subassembly instead`);
      const used = await repository.usageCount(id);
      if (used) {
        throw new ConflictError(`${before.imm_code} is used on ${used} subassembly line(s) and can't be deleted — make it inactive instead`);
      }
      await repository.softDelete(id, actor?.id ?? null);
      await auditService.record({ action: auditService.Action.DELETE, entity: 'Material', entityId: id, actor, changes: { imm_code: before.imm_code } });
    },
  };
}

const materialService = createMaterialService(materialRepository);

module.exports = { materialService, createMaterialService };
