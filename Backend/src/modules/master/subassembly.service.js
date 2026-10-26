const { subassemblyRepository } = require('./subassembly.repository');
const { materialRepository } = require('./material.repository');
const { materialService } = require('./material.service');
const { settingsRepository } = require('../settings/settings.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError, buildSearchClause } = require('../../core');

/**
 * Subassembly business logic (Master Data → Subassemblies).
 *
 *   - A subassembly is a drawn part: a name, a drawing no. (unique among live
 *     subassemblies) and its own item in the material master (a Finished
 *     material — its IMM code), created with it from a prefix and unit or
 *     linked from an existing Finished material. The item follows its name
 *     and drawing no., stays the same across revisions, and goes with it.
 *   - **Revisions** hold the lines (Rev A, B … or 00, 01 …, see
 *     REVISION_SCHEMES). Only a **draft** changes; **releasing** it (Subassemblies
 *     → Approve, with a change note) makes it the current revision and
 *     supersedes the one before, which stays readable forever. At most one
 *     draft at a time; a new one starts as a copy of the current revision. A
 *     draft can be discarded, a released revision never.
 *   - **Multi-level**: a line can be another subassembly's item, held at a
 *     released revision of it ("pinned"). When that child gets a newer
 *     revision the line shows it; only a new draft moves the line on. No
 *     loops (a subassembly never contains itself, at any depth) and at most
 *     MAX_LEVELS levels.
 *   - A material appears once per revision. Only active materials (and
 *     subassemblies with a released revision) can be added; one made inactive
 *     later stays, flagged. A subassembly used on another can't be deleted.
 *
 * @param {ReturnType<typeof import('./subassembly.repository').createSubassemblyRepository>} repository
 */
function createSubassemblyService(repository) {
  const SORTABLE_FIELDS = Object.freeze(['name', 'drawing_no', 'updated_at', 'created_at']);
  const SEARCHABLE_FIELDS = Object.freeze(['name', 'drawing_no']);
  const REVISION_SCHEMES = Object.freeze(['LETTERS', 'NUMBERS']);
  const MAX_LEVELS = 10;
  const PAGE = 10;

  const round = (n) => Math.round(n * 1e6) / 1e6;
  const fail = (field, message) => new ValidationError('Validation failed', [{ field, message }]);

  /** The n-th revision's label: LETTERS 1 → A … 26 → Z, 27 → AA; NUMBERS 1 → 00, 2 → 01. */
  function revisionLabel(scheme, seq) {
    if (scheme === 'NUMBERS') return String(seq - 1).padStart(2, '0');
    let n = seq; let s = '';
    while (n > 0) { n -= 1; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
    return s;
  }
  const scheme = async () => (await settingsRepository.getOrCreate()).revision_scheme || 'LETTERS';

  /** A child subassembly's current (released) revision, or null. */
  const currentOf = (sub) => (sub && !sub.deleted_at ? sub.revisions?.[0] ?? null : null);

  /** The department it comes from must be a live one. @param {number|null|undefined} id */
  async function assertDepartment(id) {
    if (id === null || id === undefined) return;
    if (!(await repository.findDepartment(id))) throw fail('department_id', 'That department was not found');
  }

  async function assertDrawingFree(drawingNo, exceptId) {
    const clash = await repository.findByDrawingNo(drawingNo, exceptId);
    if (clash) throw new ConflictError(`Drawing no. ${drawingNo} is already used by "${clash.name}"`);
  }

  /**
   * Validates lines and maps them to rows, holding each child subassembly at
   * a revision: the one asked for (`child_revision_id`: the line's current
   * hold in `previous`, or the child's current revision), else the line's
   * current hold, else the child's current revision.
   * @param {Array<{ material_id: number, quantity: number, child_revision_id?: number }>} items
   * @param {Map<number, { child_revision_id: number|null }>} [previous]  the draft's lines now, by material
   */
  async function toRows(items, previous = new Map()) {
    const ids = items.map((i) => i.material_id);
    if (new Set(ids).size !== ids.length) throw fail('items', 'A material is listed twice — raise its quantity instead');
    const found = new Map((await repository.findMaterials(ids)).map((m) => [m.id, m]));
    const errors = [];
    const rows = items.map((i, idx) => {
      const m = found.get(i.material_id);
      const at = `Line ${idx + 1}`;
      const field = `items.${idx}.material_id`;
      if (!m) { errors.push({ field, message: `${at}: material not found` }); return null; }
      const had = previous.get(m.id);
      // Inactive or deleted materials can't be newly added; ones already on it may stay.
      if ((!m.is_active || m.deleted_at) && !had) errors.push({ field, message: `${at}: ${m.imm_code} is ${m.deleted_at ? 'deleted' : 'inactive'}` });
      let child = null;
      if (m.subassembly && !m.subassembly.deleted_at) {
        const current = currentOf(m.subassembly);
        const allowed = new Set([had?.child_revision_id, current?.id].filter(Boolean));
        if (i.child_revision_id) {
          if (!allowed.has(i.child_revision_id)) errors.push({ field: `items.${idx}.child_revision_id`, message: `${at}: ${m.imm_code} can be held at its current revision only` });
          child = i.child_revision_id;
        } else child = had?.child_revision_id ?? current?.id ?? null;
        if (!child) errors.push({ field, message: `${at}: ${m.imm_code} has no released revision yet — release it first` });
      }
      return { material_id: m.id, quantity: i.quantity, sort_order: idx, child_revision_id: child };
    });
    if (errors.length) throw new ValidationError('Validation failed', errors);
    return rows;
  }

  /**
   * No loops, at most MAX_LEVELS deep: walks the structure these rows make,
   * through the revisions the children are held at.
   * @param {number|null} selfSubId @param {number|null} selfMaterialId @param {Array<{ material_id: number, child_revision_id: number|null }>} rows
   */
  async function assertStructure(selfSubId, selfMaterialId, rows) {
    if (selfMaterialId && rows.some((r) => r.material_id === selfMaterialId)) throw fail('items', 'A subassembly can’t contain itself');
    let frontier = rows.filter((r) => r.child_revision_id).map((r) => ({ revId: r.child_revision_id, top: r.material_id }));
    let levels = 1;
    while (frontier.length) {
      levels += 1;
      if (levels > MAX_LEVELS) throw fail('items', `That would make a structure more than ${MAX_LEVELS} levels deep`);
      const revs = new Map((await repository.revisionsById([...new Set(frontier.map((f) => f.revId))])).map((r) => [r.id, r]));
      const hitsSelf = frontier.find((f) => selfSubId && revs.get(f.revId)?.subassembly_id === selfSubId);
      const lines = await repository.linesOf([...revs.keys()]);
      const hitsItem = selfMaterialId && lines.find((l) => l.material.id === selfMaterialId);
      const looping = hitsSelf?.top ?? (hitsItem ? frontier.find((f) => f.revId === hitsItem.revision_id)?.top : null);
      if (looping) {
        const [m] = await repository.findMaterials([looping]);
        throw fail('items', `${m?.imm_code ?? 'That subassembly'} already contains this subassembly (directly or further down) — adding it would make a loop`);
      }
      const topOf = new Map(frontier.map((f) => [f.revId, f.top]));
      frontier = lines
        .map((l) => ({ revId: l.child_revision_id ?? currentOf(l.material.subassembly)?.id, top: topOf.get(l.revision_id) }))
        .filter((f) => f.revId);
    }
  }

  /**
   * Validates how a subassembly gets its item and returns a function that
   * makes it inside the save's transaction.
   * @param {{ mode: 'new'|'existing', prefix_id?: number, uom_id?: number, material_id?: number, description?: string|null }} spec
   * @param {{ name: string, drawing_no: string }} sub
   */
  async function planItem(spec, sub, actor) {
    if (spec.mode === 'existing') {
      const [m] = await repository.findMaterials([spec.material_id]);
      if (!m || m.deleted_at) throw fail('item.material_id', 'That material was not found');
      if (!m.is_active) throw fail('item.material_id', `${m.imm_code} is inactive`);
      if (m.material_type !== 'FINISHED') throw fail('item.material_id', `${m.imm_code} is not a Finished material`);
      if (m.subassembly) throw fail('item.material_id', `${m.imm_code} is already another subassembly's item`);
      return {
        materialId: m.id,
        make: async (tx) => {
          await tx.material.update({ where: { id: m.id }, data: { item_name: sub.name, drawing_no: sub.drawing_no, updated_by: actor?.id ?? null } });
          return m.id;
        },
      };
    }
    const { prefixes, units } = await repository.itemSetup();
    if (!prefixes.some((p) => p.id === spec.prefix_id)) throw fail('item.prefix_id', 'Choose an active IMM code prefix');
    if (!units.some((u) => u.id === spec.uom_id)) throw fail('item.uom_id', 'Choose an active unit of measure');
    const created = {};
    return {
      materialId: null,
      created,
      make: async (tx) => {
        const [m] = await materialRepository.createManyIn(tx, [{
          prefix_id: spec.prefix_id, uom_id: spec.uom_id, item_name: sub.name, drawing_no: sub.drawing_no,
          description: spec.description || sub.name, technical_spec: `As per drawing ${sub.drawing_no}`,
          material_type: 'FINISHED', material: 'Assembly', remarks: null,
        }], materialService.formatCode, actor?.id ?? null);
        Object.assign(created, m);
        return m.id;
      },
    };
  }

  /** Runs a save, turning code/link clashes into readable conflicts. */
  async function saving(fn) {
    try { return await fn(); } catch (err) {
      if (err.code === 'IMM_CODE_TAKEN') throw new ConflictError(`${err.message} — raise that prefix's next number in Administrator → Configuration → Material Codes`);
      if (err.code === 'P2002') throw new ConflictError('Someone else changed this at the same time — reload and try again');
      throw err;
    }
  }

  const recordItemCreated = (m, actor) => m.id && auditService.record({
    action: auditService.Action.CREATE, entity: 'Material', entityId: m.id, actor,
    changes: { imm_code: m.imm_code, item_name: m.item_name, unit: m.uom?.code, as: 'subassembly item' },
  });

  async function loadSub(id) {
    const s = await repository.findById(id);
    if (!s) throw new NotFoundError('Subassembly');
    return s;
  }

  async function loadDraft(subId, revId) {
    const r = await repository.findRevision(subId, revId);
    if (!r) throw new NotFoundError('Revision');
    if (r.status !== 'DRAFT') throw new ConflictError(`Rev ${r.rev} is ${r.status === 'RELEASED' ? 'released' : 'superseded'} — it can't change. Start a new revision instead.`);
    return r;
  }

  /** A line as shown: its child's held revision, and a newer one if there is. */
  const shapeLine = (l) => {
    const current = currentOf(l.material.subassembly);
    return {
      ...l,
      child: l.material.subassembly && !l.material.subassembly.deleted_at ? {
        subassembly_id: l.material.subassembly.id,
        held: l.child_revision ? { id: l.child_revision.id, rev: l.child_revision.rev } : null,
        current,
        newer: Boolean(current && l.child_revision && current.id !== l.child_revision.id),
      } : null,
    };
  };

  return {
    SORTABLE_FIELDS,
    MAX_LEVELS,
    REVISION_SCHEMES,
    revisionLabel,

    /** @param {import('../../core/http/queryOptions').ListQuery} query */
    async list(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const { items, total } = await repository.findPage({
        where: { ...query.filters, ...(search || {}) }, orderBy: query.orderBy, skip: query.skip, take: query.take,
      });
      return {
        items: items.map(({ revisions, ...s }) => {
          const current = revisions.find((r) => r.status === 'RELEASED');
          const draft = revisions.find((r) => r.status === 'DRAFT');
          return {
            ...s,
            current: current ? { id: current.id, rev: current.rev } : null,
            draft: draft ? { id: draft.id, rev: draft.rev } : null,
            item_count: (current ?? draft)?._count.items ?? 0,
          };
        }),
        total,
      };
    },

    /** A subassembly: its details, revisions (newest first), current and draft, and where it is used. */
    async getById(id) {
      const s = await loadSub(id);
      const used = s.material ? await repository.usedIn(s.material.id) : [];
      const names = await repository.userNames(s.revisions.flatMap((r) => [r.released_by, r.created_by]));
      const revisions = s.revisions.map(({ _count, ...r }) => ({
        ...r, line_count: _count.items, released_by_name: names.get(r.released_by) ?? null, created_by_name: names.get(r.created_by) ?? null,
      }));
      const current = revisions.find((r) => r.status === 'RELEASED') ?? null;
      return {
        ...s,
        revisions,
        current,
        draft: revisions.find((r) => r.status === 'DRAFT') ?? null,
        used_in: used.map((u) => ({
          ...u.subassembly, quantity: u.quantity,
          revision: u.revision, held: u.child_revision,
          newer: Boolean(current && u.child_revision && current.id !== u.child_revision.id),
        })),
      };
    },

    /** One revision with its lines (and, per child subassembly, the revision held and any newer one). */
    async getRevision(subId, revId) {
      await loadSub(subId);
      const r = await repository.findRevision(subId, revId);
      if (!r) throw new NotFoundError('Revision');
      const { _count, items, ...rest } = r;
      const names = await repository.userNames([r.released_by, r.created_by]);
      return {
        ...rest, line_count: _count.items, released_by_name: names.get(r.released_by) ?? null, created_by_name: names.get(r.created_by) ?? null,
        items: items.map(shapeLine),
      };
    },

    /** Line picker: by IMM code, drawing no. or item name, 10 at a time; `exclude` = comma-separated material ids. */
    async searchMaterials(q, skip = 0, exclude = '') {
      const excludeIds = String(exclude || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
      const rows = await repository.searchMaterials(String(q || ''), PAGE + 1, Number(skip) || 0, excludeIds);
      return { items: rows.slice(0, PAGE), has_more: rows.length > PAGE };
    },

    /** Finished materials that could be linked as a subassembly's item, 10 at a time. */
    async itemOptions(q, skip = 0) {
      const rows = await repository.searchItemOptions(String(q || ''), PAGE + 1, Number(skip) || 0);
      return { items: rows.slice(0, PAGE), has_more: rows.length > PAGE };
    },

    /** Active prefixes (with their next code) and units, for a new subassembly's item; and the first revision's label. */
    async itemSetup() {
      const { prefixes, units } = await repository.itemSetup();
      return {
        prefixes: prefixes.map((p) => ({ ...p, preview: materialService.formatCode(p, p.next_number) })),
        units,
        first_rev: revisionLabel(await scheme(), 1),
      };
    },

    // ── Revision labels (Administrator → Configuration → Revisions) ──────────
    async getRevisionScheme() {
      const s = await scheme();
      return { scheme: s, examples: [1, 2, 3].map((n) => revisionLabel(s, n)) };
    },

    async setRevisionScheme(value, actor) {
      const before = await settingsRepository.getOrCreate();
      await settingsRepository.update(before.id, { revision_scheme: value, updated_by: actor?.id ?? null });
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'CompanySettings', entityId: before.id, actor,
        changes: { revision_scheme: { from: before.revision_scheme, to: value } },
      });
      return this.getRevisionScheme();
    },

    // ── Subassemblies ────────────────────────────────────────────────────────
    /** A new subassembly with its item and its first revision (a draft) holding the lines. */
    async create(dto, actor) {
      await assertDrawingFree(dto.drawing_no);
      await assertDepartment(dto.department_id);
      const rows = await toRows(dto.items || []);
      const item = await planItem(dto.item, dto, actor);
      await assertStructure(null, item.materialId, rows);
      const rev = revisionLabel(await scheme(), 1);
      const id = await saving(() => repository.create({
        name: dto.name, drawing_no: dto.drawing_no, department_id: dto.department_id ?? null,
        created_by: actor?.id ?? null, updated_by: actor?.id ?? null,
      }, rows, rev, item.make));
      if (item.created) await recordItemCreated(item.created, actor);
      const s = await this.getById(id);
      await auditService.record({
        action: auditService.Action.CREATE, entity: 'Subassembly', entityId: id, actor,
        changes: { name: s.name, drawing_no: s.drawing_no, imm_code: s.material?.imm_code, draft: rev, lines: rows.length },
      });
      return s;
    },

    /** Name, drawing no. — and an item for one made before items existed. Lines change through revisions. */
    async updateDetails(id, dto, actor) {
      const before = await loadSub(id);
      if (dto.drawing_no !== undefined && dto.drawing_no !== before.drawing_no) await assertDrawingFree(dto.drawing_no, id);
      if (dto.item && before.material) throw new ConflictError('This subassembly already has its item');
      await assertDepartment(dto.department_id);
      const data = { updated_by: actor?.id ?? null };
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.drawing_no !== undefined) data.drawing_no = dto.drawing_no;
      if (dto.department_id !== undefined) data.department_id = dto.department_id;
      const sub = { name: data.name ?? before.name, drawing_no: data.drawing_no ?? before.drawing_no };
      const item = dto.item ? await planItem(dto.item, sub, actor) : null;
      await saving(() => repository.updateDetails(id, data, before.drawing_no, item?.make));
      if (item?.created) await recordItemCreated(item.created, actor);
      const s = await this.getById(id);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'Subassembly', entityId: id, actor,
        changes: {
          ...(dto.name !== undefined && dto.name !== before.name ? { name: { from: before.name, to: dto.name } } : {}),
          ...(dto.drawing_no !== undefined && dto.drawing_no !== before.drawing_no ? { drawing_no: { from: before.drawing_no, to: dto.drawing_no } } : {}),
          ...(dto.department_id !== undefined && dto.department_id !== (before.department?.id ?? null) ? { department: { from: before.department?.name ?? null, to: s.department?.name ?? null } } : {}),
          ...(item ? { imm_code: { from: null, to: s.material?.imm_code } } : {}),
        },
      });
      return s;
    },

    async remove(id, actor) {
      const before = await loadSub(id);
      if (before.material) {
        const used = await repository.usedIn(before.material.id);
        if (used.length || await repository.anyUse(before.material.id)) {
          const where = [...new Set(used.map((u) => u.subassembly.drawing_no))];
          throw new ConflictError(`${before.drawing_no} is used on other subassemblies${where.length ? ` (${where.join(', ')})` : ' (in their earlier revisions)'} — it can't be deleted`);
        }
      }
      await repository.softDelete(id, before.material?.id ?? null, actor?.id ?? null);
      await auditService.record({
        action: auditService.Action.DELETE, entity: 'Subassembly', entityId: id, actor,
        changes: { name: before.name, drawing_no: before.drawing_no, imm_code: before.material?.imm_code },
      });
    },

    // ── Revisions ────────────────────────────────────────────────────────────
    /** Starts the next revision as a draft copy of the current one. */
    async newRevision(id, actor) {
      const s = await loadSub(id);
      const draft = s.revisions.find((r) => r.status === 'DRAFT');
      if (draft) throw new ConflictError(`Rev ${draft.rev} is already being drafted — finish or discard it first`);
      const current = s.revisions.find((r) => r.status === 'RELEASED');
      if (!current) throw new ConflictError('There is no released revision to start from');
      const seq = (await repository.lastSeq(id)) + 1;
      const rev = revisionLabel(await scheme(), seq);
      const revId = await saving(() => repository.createDraftFrom(id, current.id, seq, rev, actor?.id ?? null));
      await auditService.record({ action: auditService.Action.CREATE, entity: 'SubassemblyRevision', entityId: revId, actor, changes: { subassembly: s.drawing_no, rev, from: current.rev } });
      return this.getRevision(id, revId);
    },

    /** Replaces a draft's lines. */
    async saveDraft(id, revId, dto, actor) {
      const s = await loadSub(id);
      const draft = await loadDraft(id, revId);
      const previous = new Map(draft.items.map((l) => [l.material.id, l]));
      const rows = await toRows(dto.items, previous);
      await assertStructure(id, s.material?.id ?? null, rows);
      await repository.replaceLines(id, revId, rows, actor?.id ?? null);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'SubassemblyRevision', entityId: revId, actor,
        changes: { subassembly: s.drawing_no, rev: draft.rev, lines: { from: draft.items.length, to: rows.length } },
      });
      return this.getRevision(id, revId);
    },

    /** Releases a draft (Subassemblies → Approve): it becomes current; the one before is superseded. */
    async release(id, revId, dto, actor) {
      const s = await loadSub(id);
      const draft = await loadDraft(id, revId);
      if (!s.material) throw new ConflictError('Give this subassembly its IMM code before releasing it');
      if (!draft.items.length) throw fail('items', 'Add at least one line before releasing');
      const note = (dto.change_note || '').trim();
      const hasEarlier = s.revisions.some((r) => r.status !== 'DRAFT');
      if (hasEarlier && !note) throw fail('change_note', 'Say what changed and why');
      const previous = s.revisions.find((r) => r.status === 'RELEASED');
      const ok = await repository.release(id, revId, note || 'First release', actor?.id ?? null);
      if (!ok) throw new ConflictError('This draft was released or discarded meanwhile — reload');
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'SubassemblyRevision', entityId: revId, actor,
        changes: { subassembly: s.drawing_no, released: draft.rev, superseded: previous?.rev ?? null, note: note || 'First release' },
      });
      return this.getById(id);
    },

    /** Discards a draft. The first one, never released, goes only with the subassembly. */
    async discardDraft(id, revId, actor) {
      const s = await loadSub(id);
      const draft = await loadDraft(id, revId);
      if (!s.revisions.some((r) => r.status !== 'DRAFT')) {
        throw new ConflictError('This is its only revision — delete the subassembly instead');
      }
      await repository.deleteDraft(id, revId);
      await auditService.record({ action: auditService.Action.DELETE, entity: 'SubassemblyRevision', entityId: revId, actor, changes: { subassembly: s.drawing_no, rev: draft.rev } });
    },

    /**
     * What changed between two revisions: lines added, removed, or with a new
     * quantity or child revision held; plus the later one's change note.
     */
    async compare(id, fromId, toId) {
      await loadSub(id);
      const [a, b] = await Promise.all([repository.findRevision(id, fromId), repository.findRevision(id, toId)]);
      if (!a || !b) throw new NotFoundError('Revision');
      const before = new Map(a.items.map((l) => [l.material.id, l]));
      const after = new Map(b.items.map((l) => [l.material.id, l]));
      const added = []; const removed = []; const changed = [];
      for (const [mid, l] of after) {
        const o = before.get(mid);
        if (!o) { added.push({ material: l.material, quantity: l.quantity, held: l.child_revision }); continue; }
        const qty = Number(o.quantity) !== Number(l.quantity);
        const held = (o.child_revision_id ?? null) !== (l.child_revision_id ?? null);
        if (qty || held) {
          changed.push({
            material: l.material,
            ...(qty ? { quantity: { from: o.quantity, to: l.quantity } } : {}),
            ...(held ? { held: { from: o.child_revision, to: l.child_revision } } : {}),
          });
        }
      }
      for (const [mid, o] of before) if (!after.has(mid)) removed.push({ material: o.material, quantity: o.quantity, held: o.child_revision });
      const byCode = (x, y) => x.material.imm_code.localeCompare(y.material.imm_code);
      const strip = ({ items, _count, ...r }) => r;
      return { from: strip(a), to: strip(b), added: added.sort(byCode), removed: removed.sort(byCode), changed: changed.sort(byCode) };
    },

    /**
     * The full structure of a revision (default: the current one, else the
     * draft), expanded through the revisions its children are held at, and
     * the rolled-up totals of the plain materials for one of it.
     */
    async tree(id, revId) {
      const s = await loadSub(id);
      const target = revId
        ? s.revisions.find((r) => r.id === revId)
        : s.revisions.find((r) => r.status === 'RELEASED') ?? s.revisions.find((r) => r.status === 'DRAFT');
      if (!target) throw new NotFoundError('Revision');
      const node = (l) => {
        const sub = l.material.subassembly && !l.material.subassembly.deleted_at ? l.material.subassembly : null;
        const held = l.child_revision ?? (sub ? currentOf(sub) : null);
        return {
          material: l.material, quantity: Number(l.quantity),
          subassembly_id: sub?.id ?? null, revision: held ? { id: held.id, rev: held.rev } : null,
          children: [],
        };
      };
      const top = (await repository.linesOf([target.id])).map(node);
      let frontier = top.filter((n) => n.revision).map((n) => ({ n, path: new Set([id]) }));
      let levels = top.length ? 1 : 0;
      while (frontier.length && levels <= MAX_LEVELS) {
        levels += 1;
        const byRev = new Map();
        for (const l of await repository.linesOf([...new Set(frontier.map((f) => f.n.revision.id))])) {
          if (!byRev.has(l.revision_id)) byRev.set(l.revision_id, []);
          byRev.get(l.revision_id).push(l);
        }
        const next = [];
        for (const { n, path } of frontier) {
          if (path.has(n.subassembly_id)) continue; // bad old data: don't loop
          n.children = (byRev.get(n.revision.id) || []).map(node);
          const p = new Set(path).add(n.subassembly_id);
          for (const c of n.children) if (c.revision) next.push({ n: c, path: p });
        }
        frontier = next;
      }

      const totals = new Map();
      const walk = (n, times) => {
        const qty = times * n.quantity;
        if (n.children.length) { n.children.forEach((c) => walk(c, qty)); return; }
        const t = totals.get(n.material.id) || { material: n.material, quantity: 0, unbuilt: Boolean(n.subassembly_id) };
        t.quantity = round(t.quantity + qty);
        totals.set(n.material.id, t);
      };
      top.forEach((c) => walk(c, 1));

      return {
        id: s.id, name: s.name, drawing_no: s.drawing_no, material: s.material,
        revision: { id: target.id, rev: target.rev, status: target.status },
        levels,
        children: top,
        totals: [...totals.values()].sort((x, y) => x.material.imm_code.localeCompare(y.material.imm_code)),
      };
    },
  };
}

const subassemblyService = createSubassemblyService(subassemblyRepository);

module.exports = { subassemblyService, createSubassemblyService };
