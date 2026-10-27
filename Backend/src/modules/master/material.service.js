const XLSX = require('xlsx');
const { materialRepository } = require('./material.repository');
const { labelFor, revName, loadRevisionConfig } = require('./revisionLabels');
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
 *   - **Drawing revisions** — Finished parts only (not a subassembly's item,
 *     which has its subassembly's): the first is released when the part is
 *     made ("Original", see revisionLabels); a change to its description,
 *     specification or material is a new draft revision, released with
 *     Materials → Approve and a change note. The part always carries its current
 *     revision's values; subassembly and project BOM lines hold it at a revision.
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

  /** Drawing numbers compare without regard to case. */
  const drawingKey = (s) => String(s).trim().toLowerCase();

  /**
   * A material's drawing no. is optional free text, and belongs to one
   * material only: not repeated within the rows, nor used by another live
   * material (a subassembly's item carries its drawing no. too).
   * @param {Array<{ drawing_no?: string|null }>} rows @param {(i: number) => string} where
   * @param {number} [exceptId]  the material being edited
   */
  async function assertDrawingNosFree(rows, where, exceptId) {
    const wanted = [...new Set(rows.map((r) => r.drawing_no).filter(Boolean))];
    const taken = new Map((await repository.findByDrawingNos(wanted, exceptId ? [exceptId] : [])).map((m) => [drawingKey(m.drawing_no), m]));
    const seen = new Map();
    const errors = [];
    rows.forEach((r, i) => {
      if (!r.drawing_no) return;
      const at = rows.length > 1 ? `Row ${i + 1}: ` : '';
      const k = drawingKey(r.drawing_no);
      const m = taken.get(k);
      if (m) errors.push({ field: where(i), message: `${at}drawing no. ${r.drawing_no} is already used by ${m.imm_code} (${m.item_name})` });
      else if (seen.has(k)) errors.push({ field: where(i), message: `${at}drawing no. ${r.drawing_no} is repeated — same as row ${seen.get(k) + 1}` });
      if (!seen.has(k)) seen.set(k, i);
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

  /** A Finished part that is not a subassembly's item: it has drawing revisions. */
  const hasRevisions = (m) => m.material_type === 'FINISHED' && !m.subassembly;
  // What a drawing revision carries (material field → revision field).
  const REVISED = Object.freeze({ description: 'description', technical_spec: 'technical_spec', material: 'material_text' });

  async function loadPart(id) {
    const m = await repository.findById(id);
    if (!m) throw new NotFoundError('Material');
    if (!hasRevisions(m)) throw new ConflictError(`${m.imm_code} has no drawing revisions — only Finished parts do (a subassembly's item is revised on its subassembly)`);
    return m;
  }

  async function loadRevisionDraft(m, revId) {
    const r = await repository.findRevision(m.id, revId);
    if (!r) throw new NotFoundError('Revision');
    if (r.status !== 'DRAFT') throw new ConflictError(`${revName(r.rev)} is ${r.status === 'RELEASED' ? 'released' : 'superseded'} — it can't change. Start a new revision instead.`);
    return r;
  }

  /** Name / material / spec compared loosely: case and extra spaces ignored. */
  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const sameKey = (r) => `${norm(r.item_name)}|${norm(r.material)}|${norm(r.technical_spec)}`;

  return {
    SORTABLE_FIELDS,
    formatCode,

    /**
     * Which of these drawing numbers other materials already use (to flag them
     * in the bulk entry before saving).
     * @param {{ nos?: string }} query  comma-separated
     */
    async drawingCheck({ nos = '' } = {}) {
      const list = String(nos).split(',').map((n) => n.trim()).filter(Boolean).slice(0, 500);
      return { taken: await repository.findByDrawingNos(list) };
    },

    /**
     * The live material using this drawing no., if any — for subassemblies,
     * whose drawing no. their own item carries.
     * @param {string} drawingNo @param {number[]} [exceptIds]
     */
    async drawingOwner(drawingNo, exceptIds = []) {
      const [m] = await repository.findByDrawingNos([drawingNo], exceptIds.filter(Boolean));
      return m || null;
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
      await assertDrawingNosFree(dto.rows, (i) => `rows.${i}.drawing_no`);

      let created;
      try {
        created = await repository.createMany(dto.rows, formatCode, actor?.id ?? null, labelFor(await loadRevisionConfig(), 1));
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

    /** Where a material is used (subassemblies), and the subassembly it is the item of. */
    async whereUsed(id) {
      const m = await repository.findById(id);
      if (!m) throw new NotFoundError('Material');
      const lines = await repository.whereUsed(id);
      return {
        // A subassembly's own item carries its name and drawing no.
        self: m.subassembly ? { id: m.subassembly.id, name: m.item_name, drawing_no: m.drawing_no } : null,
        subassemblies: lines.map((l) => ({ ...l.subassembly, quantity: l.quantity, revision: l.revision, held: l.part_revision })),
      };
    },

    // ── Drawing revisions (Finished parts) ───────────────────────────────────
    /** A part's revisions, newest first, with who released each. */
    async revisions(id) {
      const m = await repository.findById(id);
      if (!m) throw new NotFoundError('Material');
      if (!hasRevisions(m)) return { items: [], revisable: false };
      const items = await repository.listRevisions(id);
      const names = await repository.userNames(items.flatMap((r) => [r.released_by, r.created_by]));
      return {
        revisable: true,
        items: items.map((r) => ({ ...r, released_by_name: names.get(r.released_by) ?? null, created_by_name: names.get(r.created_by) ?? null })),
      };
    },

    /** Starts the next revision as a draft copy of the current one. */
    async newRevision(id, actor) {
      const m = await loadPart(id);
      const all = await repository.listRevisions(id);
      const draft = all.find((r) => r.status === 'DRAFT');
      if (draft) throw new ConflictError(`${revName(draft.rev)} is already being drafted — finish or discard it first`);
      const current = all.find((r) => r.status === 'RELEASED');
      if (!current) throw new ConflictError(`${m.imm_code} has no released revision to start from`);
      const seq = (await repository.lastRevisionSeq(id)) + 1;
      const rev = labelFor(await loadRevisionConfig(), seq);
      let r;
      try {
        r = await repository.createRevision({
          material_id: id, seq, rev, status: 'DRAFT',
          description: current.description, technical_spec: current.technical_spec, material_text: current.material_text,
          created_by: actor?.id ?? null, updated_by: actor?.id ?? null,
        });
      } catch (err) {
        if (err.code === 'P2002') throw new ConflictError('Someone else started a revision at the same time — reload');
        throw err;
      }
      await auditService.record({ action: auditService.Action.CREATE, entity: 'MaterialRevision', entityId: r.id, actor, changes: { material: m.imm_code, rev, from: current.rev } });
      return r;
    },

    /** Changes a draft's description, specification or material. */
    async saveRevisionDraft(id, revId, dto, actor) {
      const m = await loadPart(id);
      const before = await loadRevisionDraft(m, revId);
      const data = { updated_by: actor?.id ?? null };
      for (const [k, f] of Object.entries(REVISED)) if (dto[k] !== undefined) data[f] = dto[k];
      const r = await repository.updateRevision(revId, data);
      await auditService.record({ action: auditService.Action.UPDATE, entity: 'MaterialRevision', entityId: revId, actor, changes: { material: m.imm_code, rev: before.rev, ...auditService.diff(before, data) } });
      return r;
    },

    /** Releases a draft (Materials → Approve, with a change note): the part takes its values. */
    async releaseRevision(id, revId, dto, actor) {
      const m = await loadPart(id);
      const draft = await loadRevisionDraft(m, revId);
      const note = (dto.change_note || '').trim();
      if (!note) throw new ValidationError('Validation failed', [{ field: 'change_note', message: 'Say what changed and why' }]);
      const all = await repository.listRevisions(id);
      const previous = all.find((r) => r.status === 'RELEASED');
      const ok = await repository.releaseRevision(id, revId, note, actor?.id ?? null);
      if (!ok) throw new ConflictError('This draft was released or discarded meanwhile — reload');
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'MaterialRevision', entityId: revId, actor,
        changes: { material: m.imm_code, released: draft.rev, superseded: previous?.rev ?? null, note },
      });
      return this.getById(id);
    },

    /** Discards a draft revision. */
    async discardRevisionDraft(id, revId, actor) {
      const m = await loadPart(id);
      const draft = await loadRevisionDraft(m, revId);
      await repository.deleteRevisionDraft(id, revId);
      await auditService.record({ action: auditService.Action.DELETE, entity: 'MaterialRevision', entityId: revId, actor, changes: { material: m.imm_code, rev: draft.rev } });
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
      if (hasRevisions(before)) {
        const revised = Object.keys(REVISED).filter((k) => dto[k] !== undefined && dto[k] !== before[k]);
        if (revised.length) {
          throw new ConflictError(`${before.imm_code} has drawing revisions — change its ${revised.map((k) => k.replace('_', ' ')).join(', ')} through a new revision`);
        }
      }
      if (dto.drawing_no && dto.drawing_no !== before.drawing_no) await assertDrawingNosFree([dto], () => 'drawing_no', id);
      if (dto.uom_id !== undefined && dto.uom_id !== before.uom_id) {
        const used = await repository.usageCount(id);
        if (used) throw new ConflictError(`${before.imm_code} is on ${used} subassembly line(s) — its unit can no longer change`);
        await assertUnits([dto], () => 'uom_id');
      }
      const data = { updated_by: actor?.id ?? null };
      for (const k of ['drawing_no', 'item_name', 'description', 'technical_spec', 'material_type', 'material', 'uom_id', 'remarks', 'is_active']) {
        if (dto[k] !== undefined) data[k] = dto[k];
      }
      let m = await repository.updateMaterial(id, data);
      // Made a Finished part just now: it starts its drawing revisions.
      if (hasRevisions(m) && !(await repository.lastRevisionSeq(id))) {
        await repository.createRevision({
          material_id: id, seq: 1, rev: labelFor(await loadRevisionConfig(), 1), status: 'RELEASED', change_note: 'First release',
          description: m.description, technical_spec: m.technical_spec, material_text: m.material,
          released_at: new Date(), released_by: actor?.id ?? null, created_by: actor?.id ?? null, updated_by: actor?.id ?? null,
        });
        m = await repository.findById(id);
      }
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
