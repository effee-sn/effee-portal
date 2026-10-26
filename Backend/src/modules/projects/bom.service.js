const XLSX = require('xlsx');
const { bomRepository } = require('./bom.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError } = require('../../core');

/**
 * Project BOM business logic (Projects → a project → BOM).
 *
 *   - A project's BOM has revisions (Rev 1, 2 …). Only a **draft** changes:
 *     its lines say, **per machine**, which subassemblies (held at a released
 *     revision, like a subassembly's own lines) and loose materials it needs,
 *     how many, and the department each comes from.
 *   - **Locking** (BOM → Approve; a change note after the first) explodes every
 *     level through the revisions held into **tags** — a frozen snapshot, with
 *     each material's details as they are at that moment — and supersedes the
 *     BOM locked before. Changing a locked BOM means a new draft revision.
 *   - **Tags**: Machine ID - dept no. - subassembly IMM code(s) - part IMM code.
 *     A subassembly or Finished part needed n times (a whole number) gets one
 *     tag per piece: …/1, …/2 (a single one: no suffix); each piece's own parts
 *     are tagged under it. Bought-out and consumable parts get one tag carrying
 *     the quantity.
 *   - **Totals**: every plain material at the bottom of the structure, with
 *     quantities multiplied through the levels — per machine and for the
 *     project; and how many of each subassembly are to be built.
 *
 * @param {ReturnType<typeof import('./bom.repository').createBomRepository>} repository
 */
function createBomService(repository) {
  const MAX_TAGS = 20000;
  const MAX_LEVELS = 12;
  const round = (n) => Math.round(n * 1e6) / 1e6;
  const fail = (field, message) => new ValidationError('Validation failed', [{ field, message }]);

  /** A subassembly's current (released) revision, or null. */
  const currentOf = (sub) => (sub && !sub.deleted_at ? sub.revisions?.[0] ?? null : null);

  async function loadProject(projectId) {
    const p = await repository.findProject(projectId);
    if (!p) throw new NotFoundError('Project');
    return p;
  }

  async function loadBom(projectId, bomId) {
    const b = await repository.findBom(projectId, bomId);
    if (!b) throw new NotFoundError('BOM revision');
    return b;
  }

  async function loadDraft(projectId, bomId) {
    const b = await loadBom(projectId, bomId);
    if (b.status !== 'DRAFT') throw new ConflictError(`BOM Rev ${b.rev} is ${b.status === 'RELEASED' ? 'locked' : 'superseded'} — it can't change. Start a new revision instead.`);
    return b;
  }

  /** A line as shown: its child's held revision and any newer one. */
  const shapeLine = (l) => {
    const sub = l.material.subassembly && !l.material.subassembly.deleted_at ? l.material.subassembly : null;
    const current = currentOf(sub);
    return {
      ...l,
      child: sub ? {
        subassembly_id: sub.id,
        held: l.child_revision ? { id: l.child_revision.id, rev: l.child_revision.rev } : null,
        current,
        newer: Boolean(current && l.child_revision && current.id !== l.child_revision.id),
      } : null,
    };
  };

  /**
   * Validates draft lines and maps them to rows. A child subassembly is held
   * at the revision asked for (the line's current hold, or the child's
   * current revision), else its current hold, else its current revision.
   * @param {object} project @param {Array<object>} lines
   * @param {Map<string, object>} previous  the draft's lines now, by "machine:material"
   */
  async function toRows(project, lines, previous) {
    const machines = new Map(project.machines.map((m) => [m.id, m]));
    const seen = new Set();
    const materials = new Map((await repository.findMaterials([...new Set(lines.map((l) => l.material_id))])).map((m) => [m.id, m]));
    const depts = new Map((await repository.findDepartments([...new Set(lines.map((l) => l.department_id).filter(Boolean))])).map((d) => [d.id, d]));
    const errors = [];
    const rows = lines.map((l, i) => {
      const at = `Line ${i + 1}`;
      const field = `lines.${i}`;
      const machine = machines.get(l.machine_id);
      const m = materials.get(l.material_id);
      if (!machine) { errors.push({ field: `${field}.machine_id`, message: `${at}: that machine is not on this project` }); return null; }
      if (!m) { errors.push({ field: `${field}.material_id`, message: `${at}: material not found` }); return null; }
      const key = `${l.machine_id}:${l.material_id}`;
      if (seen.has(key)) errors.push({ field: `${field}.material_id`, message: `${at}: ${m.imm_code} is listed twice for ${machine.machine_no} — raise its quantity instead` });
      seen.add(key);
      const had = previous.get(key);
      if ((!m.is_active || m.deleted_at) && !had) errors.push({ field: `${field}.material_id`, message: `${at}: ${m.imm_code} is ${m.deleted_at ? 'deleted' : 'inactive'}` });
      if (l.department_id && !depts.has(l.department_id)) errors.push({ field: `${field}.department_id`, message: `${at}: that department was not found` });
      let child = null;
      if (m.subassembly && !m.subassembly.deleted_at) {
        const current = currentOf(m.subassembly);
        const allowed = new Set([had?.child_revision_id, current?.id].filter(Boolean));
        if (l.child_revision_id) {
          if (!allowed.has(l.child_revision_id)) errors.push({ field: `${field}.child_revision_id`, message: `${at}: ${m.imm_code} can be held at its current revision only` });
          child = l.child_revision_id;
        } else child = had?.child_revision_id ?? current?.id ?? null;
        if (!child) errors.push({ field: `${field}.material_id`, message: `${at}: ${m.imm_code} has no released revision yet` });
      }
      return {
        machine_id: l.machine_id, material_id: m.id, quantity: l.quantity, sort_order: i, child_revision_id: child,
        department_id: l.department_id ?? (m.subassembly && !m.subassembly.deleted_at ? m.subassembly.department_id : null) ?? null,
      };
    });
    if (errors.length) throw new ValidationError('Validation failed', errors);
    return rows;
  }

  /**
   * Explodes lines into tags. `lines` carry machine_id, quantity, material
   * (brief), child_revision ({ id, rev }) and department ({ name, dept_no }).
   * @returns {Promise<Array<object>>} tags in order, as ProjectBomItem rows (without bom_id)
   */
  async function explode(project, lines) {
    const machines = new Map(project.machines.map((m) => [m.id, m]));
    const cache = new Map(); // revision id → its lines
    const linesOf = async (revId) => {
      if (!cache.has(revId)) {
        const rows = await repository.revisionLines([revId]);
        cache.set(revId, rows);
      }
      return cache.get(revId);
    };
    const items = [];
    let order = 0;

    const emit = async (machine, dept, m, qtyPerParent, times, held, parentTag, level, path) => {
      if (level > MAX_LEVELS) throw new ConflictError(`The structure under ${parentTag} is more than ${MAX_LEVELS} levels deep`);
      const sub = m.subassembly && !m.subassembly.deleted_at ? m.subassembly : null;
      const rev = sub ? (held ?? currentOf(sub)) : null;
      if (sub && path.has(sub.id)) throw new ConflictError(`${m.imm_code} contains itself further down — fix that subassembly first`);
      const n = round(times * Number(qtyPerParent));
      const split = m.material_type === 'FINISHED' && Number.isInteger(n) && n >= 1;
      const base = parentTag ? `${parentTag}-${m.imm_code}` : `${machine.machine_no}-${dept.dept_no}-${m.imm_code}`;
      const copies = split ? Array.from({ length: n }, (_, k) => ({ tag: n > 1 ? `${base}/${k + 1}` : base, quantity: 1 })) : [{ tag: base, quantity: n }];
      if (items.length + copies.length > MAX_TAGS) throw new ConflictError(`This BOM would have more than ${MAX_TAGS} tags — check the quantities`);
      const children = rev ? await linesOf(rev.id) : [];
      const nextPath = sub ? new Set(path).add(sub.id) : path;
      for (const c of copies) {
        items.push({
          machine_id: machine.id, tag: c.tag, parent_tag: parentTag, level, sort_order: (order += 1),
          material_id: m.id, is_subassembly: Boolean(sub), revision_id: rev?.id ?? null, rev: rev?.rev ?? null,
          imm_code: m.imm_code, item_name: m.item_name, drawing_no: m.drawing_no ?? null, material_type: m.material_type,
          material_text: m.material, technical_spec: null, uom: m.uom?.code ?? '', dept_no: dept.dept_no, department: dept.name ?? null,
          qty_per_parent: Number(qtyPerParent), quantity: c.quantity, has_children: children.length > 0,
        });
        for (const ch of children) {
          await emit(machine, dept, ch.material, ch.quantity, c.quantity, ch.child_revision, c.tag, level + 1, nextPath);
        }
      }
    };

    for (const l of lines) {
      const machine = machines.get(l.machine_id);
      if (!machine) continue;
      await emit(machine, l.department, l.material, l.quantity, 1, l.child_revision, null, 1, new Set());
    }
    return items;
  }

  /** Material totals (plain materials at the bottom) and subassemblies to build, per machine and overall. */
  function totalsOf(project, items) {
    const bucket = (map, it) => {
      const t = map.get(it.material_id) || {
        material_id: it.material_id, imm_code: it.imm_code, item_name: it.item_name, material_type: it.material_type,
        material_text: it.material_text, uom: it.uom, quantity: 0, per_machine: {},
      };
      t.quantity = round(t.quantity + Number(it.quantity));
      t.per_machine[it.machine_id] = round((t.per_machine[it.machine_id] || 0) + Number(it.quantity));
      map.set(it.material_id, t);
    };
    const leaves = new Map(); const subs = new Map();
    for (const it of items) {
      if (it.is_subassembly) bucket(subs, it);
      if (!it.has_children) bucket(leaves, it);
    }
    const byCode = (a, b) => a.imm_code.localeCompare(b.imm_code);
    return {
      machines: project.machines.map((m) => ({ id: m.id, machine_no: m.machine_no, name: m.name })),
      materials: [...leaves.values()].sort(byCode),
      subassemblies: [...subs.values()].sort(byCode),
    };
  }

  /** A locked revision's stored tags, with "has children" worked out from the tags. */
  async function storedItems(bomId, machineId) {
    const items = await repository.items(bomId, machineId);
    const parents = new Set(items.map((i) => i.parent_tag).filter(Boolean));
    return items.map((i) => ({ ...i, has_children: parents.has(i.tag) }));
  }

  /** The tags of any revision: stored for a locked one, worked out on the fly for a draft (a preview). */
  async function itemsOf(project, bom, machineId) {
    if (bom.status !== 'DRAFT') return storedItems(bom.id, machineId);
    const lines = bom.lines.filter((l) => !machineId || l.machine_id === machineId);
    const ready = lines.filter((l) => l.department?.dept_no != null);
    return explode(project, ready);
  }

  /** Every problem that stops a draft from being locked. */
  function lockProblems(project, bom) {
    const machines = new Map(project.machines.map((m) => [m.id, m]));
    const out = [];
    if (!bom.lines.length) out.push('Add at least one line.');
    bom.lines.forEach((l, i) => {
      const at = `Line ${i + 1} (${machines.get(l.machine_id)?.machine_no ?? 'removed machine'}, ${l.material.imm_code})`;
      if (!machines.has(l.machine_id)) out.push(`${at}: its machine was removed from the project.`);
      if (l.material.deleted_at) out.push(`${at}: the material was deleted.`);
      if (!l.department || l.department.deleted_at) out.push(`${at}: choose the department it comes from.`);
      else if (l.department.dept_no == null) out.push(`${at}: ${l.department.name} has no department no. yet (Administrator → Departments).`);
      if (l.material.subassembly && !l.material.subassembly.deleted_at && !l.child_revision) out.push(`${at}: no revision held.`);
    });
    return out;
  }

  return {
    MAX_TAGS,

    /** A project's BOM revisions: list, current (locked) and draft. */
    async overview(projectId) {
      const project = await loadProject(projectId);
      const boms = await repository.listBoms(projectId);
      const names = await repository.userNames(boms.flatMap((b) => [b.locked_by, b.created_by]));
      const revisions = boms.map(({ _count, ...b }) => ({
        ...b, line_count: _count.lines, tag_count: _count.items,
        locked_by_name: names.get(b.locked_by) ?? null, created_by_name: names.get(b.created_by) ?? null,
      }));
      return {
        project: { id: project.id, code: project.code, name: project.name },
        machines: project.machines,
        revisions,
        current: revisions.find((r) => r.status === 'RELEASED') ?? null,
        draft: revisions.find((r) => r.status === 'DRAFT') ?? null,
      };
    },

    /** One revision with its lines; a draft also lists what stops it from being locked. */
    async getBom(projectId, bomId) {
      const project = await loadProject(projectId);
      const b = await loadBom(projectId, bomId);
      const { _count, lines, ...rest } = b;
      const names = await repository.userNames([b.locked_by, b.created_by]);
      return {
        ...rest, line_count: _count.lines, tag_count: _count.items,
        locked_by_name: names.get(b.locked_by) ?? null, created_by_name: names.get(b.created_by) ?? null,
        lines: lines.map(shapeLine),
        problems: b.status === 'DRAFT' ? lockProblems(project, b) : [],
      };
    },

    /** Starts the BOM (Rev 1), or the next revision as a copy of the current one. */
    async startRevision(projectId, actor) {
      await loadProject(projectId);
      const boms = await repository.listBoms(projectId);
      const draft = boms.find((b) => b.status === 'DRAFT');
      if (draft) throw new ConflictError(`BOM Rev ${draft.rev} is already being drafted — finish or discard it first`);
      const current = boms.find((b) => b.status === 'RELEASED');
      const rev = (boms[0]?.rev ?? 0) + 1;
      const bomId = await repository.createDraft(projectId, rev, current?.id ?? null, actor?.id ?? null);
      await auditService.record({ action: auditService.Action.CREATE, entity: 'ProjectBom', entityId: bomId, actor, changes: { project_id: projectId, rev, from: current?.rev ?? null } });
      return this.getBom(projectId, bomId);
    },

    /** Replaces a draft's lines (all machines at once). */
    async saveDraft(projectId, bomId, dto, actor) {
      const project = await loadProject(projectId);
      const draft = await loadDraft(projectId, bomId);
      const previous = new Map(draft.lines.map((l) => [`${l.machine_id}:${l.material.id}`, l]));
      const rows = await toRows(project, dto.lines, previous);
      await repository.replaceLines(bomId, rows, actor?.id ?? null);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'ProjectBom', entityId: bomId, actor,
        changes: { project_id: projectId, rev: draft.rev, lines: { from: draft.lines.length, to: rows.length } },
      });
      return this.getBom(projectId, bomId);
    },

    /** Locks a draft (BOM → Approve): explodes it into tags and makes it the current BOM. */
    async lock(projectId, bomId, dto, actor) {
      const project = await loadProject(projectId);
      const draft = await loadDraft(projectId, bomId);
      const problems = lockProblems(project, draft);
      if (problems.length) throw new ValidationError('Validation failed', problems.map((message) => ({ field: 'lines', message })));
      const boms = await repository.listBoms(projectId);
      const previous = boms.find((b) => b.status === 'RELEASED');
      const note = (dto.change_note || '').trim();
      if (previous && !note) throw fail('change_note', 'Say what changed and why');

      const items = await explode(project, draft.lines);
      // The snapshot: each material's specification as it is now.
      const specs = new Map((await repository.materialDetails([...new Set(items.map((i) => i.material_id))])).map((m) => [m.id, m.technical_spec]));
      const rows = items.map(({ has_children, ...i }) => ({ ...i, technical_spec: specs.get(i.material_id) ?? null }));
      const ok = await repository.lock(projectId, bomId, note || 'First lock', rows, actor?.id ?? null);
      if (!ok) throw new ConflictError('This draft was locked or discarded meanwhile — reload');
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'ProjectBom', entityId: bomId, actor,
        changes: { project_id: projectId, locked: draft.rev, superseded: previous?.rev ?? null, tags: rows.length, note: note || 'First lock' },
      });
      return this.overview(projectId);
    },

    /** Discards a draft. */
    async discard(projectId, bomId, actor) {
      const draft = await loadDraft(projectId, bomId);
      await repository.deleteDraft(projectId, bomId);
      await auditService.record({ action: auditService.Action.DELETE, entity: 'ProjectBom', entityId: bomId, actor, changes: { project_id: projectId, rev: draft.rev } });
    },

    /** The tags of a revision (stored when locked; a preview while drafting), optionally for one machine. */
    async tags(projectId, bomId, machineId) {
      const project = await loadProject(projectId);
      const b = await loadBom(projectId, bomId);
      const items = await itemsOf(project, b, machineId);
      return { preview: b.status === 'DRAFT', count: items.length, items };
    },

    /** Totals of a revision: plain materials and subassemblies to build, per machine and overall. */
    async totals(projectId, bomId) {
      const project = await loadProject(projectId);
      const b = await loadBom(projectId, bomId);
      return { preview: b.status === 'DRAFT', ...totalsOf(project, await itemsOf(project, b)) };
    },

    /** A locked revision as an Excel file: its tags, and the material totals. */
    async exportXlsx(projectId, bomId) {
      const project = await loadProject(projectId);
      const b = await loadBom(projectId, bomId);
      if (b.status === 'DRAFT') throw new ConflictError('Lock the BOM before exporting it');
      const items = await storedItems(b.id);
      const machineNo = new Map(project.machines.map((m) => [m.id, m.machine_no]));
      const TYPE = { FINISHED: 'Finished', BOUGHT_OUT: 'Bought-out', CONSUMABLE: 'Consumables' };
      const sheet = (head, body) => {
        const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
        ws['!cols'] = head.map((h, ci) => ({ wch: Math.min(60, Math.max(8, h.length, ...body.map((r) => String(r[ci] ?? '').length)) + 2) }));
        return ws;
      };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet(
        ['Tag', 'Machine ID', 'Level', 'IMM code', 'Item name', 'Rev', 'Drawing no.', 'Type', 'Material', 'Technical specification', 'Dept no.', 'Department', 'Qty per parent', 'Quantity', 'Unit'],
        items.map((i) => [i.tag, machineNo.get(i.machine_id) ?? '', i.level, i.imm_code, i.item_name, i.rev ?? '', i.drawing_no ?? '', TYPE[i.material_type] ?? i.material_type,
          i.material_text, i.technical_spec ?? '', i.dept_no, i.department ?? '', Number(i.qty_per_parent), Number(i.quantity), i.uom]),
      ), 'Tags');
      const t = totalsOf(project, items);
      const mHead = t.machines.map((m) => m.machine_no);
      const totalRows = (list) => list.map((x) => [x.imm_code, x.item_name, TYPE[x.material_type] ?? x.material_type, x.material_text, x.uom, ...t.machines.map((m) => x.per_machine[m.id] ?? 0), x.quantity]);
      XLSX.utils.book_append_sheet(wb, sheet(['IMM code', 'Item name', 'Type', 'Material', 'Unit', ...mHead, 'Project total'], totalRows(t.materials)), 'Material totals');
      XLSX.utils.book_append_sheet(wb, sheet(['IMM code', 'Subassembly', 'Type', 'Material', 'Unit', ...mHead, 'Project total'], totalRows(t.subassemblies)), 'Subassemblies');
      return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), filename: `${project.code}-BOM-Rev${b.rev}.xlsx` };
    },
  };
}

const bomService = createBomService(bomRepository);

module.exports = { bomService, createBomService };
