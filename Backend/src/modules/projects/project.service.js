const { projectRepository } = require('./project.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError, buildSearchClause } = require('../../core');

/**
 * Project business logic.
 *
 *   - **Machines**: a project has one or more machines (units) — what its BOM
 *     will be built and tagged for. Each gets a **Machine ID** when it is
 *     added (the first ones when the project is created), from the numbering
 *     in Administrator → Configuration → Machine IDs: prefix + separator +
 *     zero-padded number (e.g. M0001). A Machine ID never changes and is never
 *     reused. Once any machine exists the numbering's format is fixed and its
 *     counter only moves forward.
 *
 * @param {ReturnType<typeof import('./project.repository').createProjectRepository>} repository
 */
function createProjectService(repository) {
  const SORTABLE_FIELDS   = Object.freeze(['code', 'name', 'status', 'created_at']);
  const SEARCHABLE_FIELDS = Object.freeze(['code', 'name']);

  const FILTERABLE = Object.freeze({
    status:     (v) => v,
    owner_id:   (v) => Number(v) || undefined,
    enquiry_id: (v) => Number(v) || undefined,
  });

  /** Next `PRJ-YYYY-NNNN` code for the current year. */
  async function nextCode() {
    const year = new Date().getFullYear();
    const prefix = `PRJ-${year}-`;
    const latest = await repository.maxCodeForPrefix(prefix);
    const seq = latest ? Number(latest.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  /**
   * Validates the optional enquiry / owner references on a write. A linked
   * enquiry must be WON and not already linked to another project; `allowId`
   * (the project's current link, on edit) is exempt so re-saving is fine.
   */
  async function assertRefs({ enquiry_id, owner_id, allowId }) {
    if (enquiry_id !== undefined && enquiry_id !== null && !(await repository.enquiryLinkable(enquiry_id, allowId))) {
      throw new ValidationError('Validation failed', [
        { field: 'enquiry_id', message: 'Enquiry must be won and not already linked to a project' },
      ]);
    }
    if (owner_id !== undefined && owner_id !== null && !(await repository.userExists(owner_id))) {
      throw new ValidationError('Validation failed', [
        { field: 'owner_id', message: 'Selected owner does not exist' },
      ]);
    }
  }

  /** prefix + separator + zero-padded number, e.g. M0001. */
  const formatMachineNo = (p, n) => `${p.machine_prefix}${p.machine_separator || ''}${String(n).padStart(p.machine_digits, '0')}`;

  /** Runs a machine-adding save, turning an ID clash into a readable conflict. */
  async function addingMachines(fn) {
    try { return await fn(); } catch (err) {
      if (err.code === 'MACHINE_NO_TAKEN') throw new ConflictError(`${err.message} — raise the next number in Administrator → Configuration → Machine IDs`);
      throw err;
    }
  }

  const shapeNumbering = (n) => ({
    prefix: n.machine_prefix, separator: n.machine_separator, digits: n.machine_digits, next_number: n.machine_next,
    preview: formatMachineNo(n, n.machine_next), machine_count: n.used,
  });

  /** Only the writable columns, mapped from the validated DTO. */
  function pickWritable(dto, data = {}) {
    for (const f of ['name', 'description', 'status', 'enquiry_id', 'owner_id', 'start_date', 'end_date']) {
      if (dto[f] !== undefined) data[f] = dto[f];
    }
    return data;
  }

  return {
    SORTABLE_FIELDS,
    FILTERABLE,

    /** @param {import('../../core/http/queryOptions').ListQuery} query */
    async list(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const where = { ...query.filters, ...(search || {}) };
      return repository.findPage({ where, orderBy: query.orderBy, skip: query.skip, take: query.take });
    },

    /** @param {number} id @throws {NotFoundError} */
    async getById(id) {
      const project = await repository.findById(id);
      if (!project) throw new NotFoundError('Project');
      return project;
    },

    /**
     * Won enquiries available to link, for the picker. `allowId` keeps the
     * edited project's current link in the list.
     * @param {{ search?: string, allowId?: number }} params
     */
    enquiryOptions({ search, allowId }) {
      return repository.availableWonEnquiries({ search: (search || '').trim(), allowId, take: 20 });
    },

    /**
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async create(dto, actor) {
      await assertRefs({ enquiry_id: dto.enquiry_id, owner_id: dto.owner_id });
      // create has no current link to exempt.

      const data = pickWritable(dto, {
        code: await nextCode(),
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });

      const project = await addingMachines(() => repository.create(data, dto.machines ?? 1, formatMachineNo));

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'Project',
        entityId: project.id,
        actor,
        changes: { code: project.code, name: project.name, enquiry_id: project.enquiry_id, machines: project.machines.map((m) => m.machine_no) },
      });

      return project;
    },

    /**
     * @param {number} id
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async update(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Project');

      await assertRefs({ enquiry_id: dto.enquiry_id, owner_id: dto.owner_id, allowId: before.enquiry_id ?? undefined });

      const data = pickWritable(dto, { updated_by: actor?.id ?? null });
      const project = await repository.update(id, data);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Project',
        entityId: id,
        actor,
        changes: auditService.diff(before, data),
      });

      return project;
    },

    /**
     * @param {number} id
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async remove(id, actor) {
      const project = await repository.findById(id);
      if (!project) throw new NotFoundError('Project');

      await repository.softDelete(id, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'Project',
        entityId: id,
        actor,
        changes: { code: project.code, name: project.name, soft_deleted: true },
      });
    },

    // ── Machines ─────────────────────────────────────────────────────────────
    /** Adds machines (each with its new Machine ID). @param {{ count?: number, name?: string|null }} dto */
    async addMachines(id, dto, actor) {
      const project = await repository.findById(id);
      if (!project) throw new NotFoundError('Project');
      const nos = await addingMachines(() => repository.addMachines(id, dto.count ?? 1, formatMachineNo, { name: dto.name ?? null, actorId: actor?.id ?? null }));
      await auditService.record({ action: auditService.Action.UPDATE, entity: 'Project', entityId: id, actor, changes: { machines_added: nos } });
      return repository.findById(id);
    },

    /** A machine's name / description (its Machine ID never changes). */
    async updateMachine(id, machineId, dto, actor) {
      const before = await repository.findMachine(id, machineId);
      if (!before) throw new NotFoundError('Machine');
      const data = { updated_by: actor?.id ?? null };
      for (const k of ['name', 'description']) if (dto[k] !== undefined) data[k] = dto[k];
      const m = await repository.updateMachine(machineId, data);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'ProjectMachine', entityId: machineId, actor,
        changes: { machine_no: before.machine_no, ...auditService.diff(before, data) },
      });
      return m;
    },

    /** Removes a machine; its Machine ID is not given out again. */
    async removeMachine(id, machineId, actor) {
      const before = await repository.findMachine(id, machineId);
      if (!before) throw new NotFoundError('Machine');
      const revs = await repository.machineBomRevs(machineId);
      if (revs.some((r) => r.status !== 'DRAFT')) {
        throw new ConflictError(`${before.machine_no} is on the project's locked BOM (Rev ${revs.filter((r) => r.status !== 'DRAFT').map((r) => r.rev).join(', ')}) — it can't be removed`);
      }
      if (revs.length) throw new ConflictError(`${before.machine_no} has lines in the BOM draft — remove them there first`);
      await repository.softDeleteMachine(machineId, actor?.id ?? null);
      await auditService.record({ action: auditService.Action.DELETE, entity: 'ProjectMachine', entityId: machineId, actor, changes: { machine_no: before.machine_no } });
    },

    // ── Machine ID numbering (Administrator → Configuration → Machine IDs) ───
    async getMachineNumbering() {
      return shapeNumbering(await repository.machineNumbering());
    },

    async setMachineNumbering(dto, actor) {
      const before = await repository.machineNumbering();
      const format = { prefix: 'machine_prefix', separator: 'machine_separator', digits: 'machine_digits' };
      const changed = Object.keys(format).filter((k) => dto[k] !== undefined && dto[k] !== before[format[k]]);
      if (before.used && changed.length) {
        throw new ConflictError(`${before.used} Machine ID(s) are already given out — the prefix, separator and digits can no longer change`);
      }
      if (before.used && dto.next_number !== undefined && dto.next_number < before.machine_next) {
        throw new ValidationError('Validation failed', [{ field: 'next_number', message: `Can't go back below ${before.machine_next} — those numbers may already be used` }]);
      }
      const data = { updated_by: actor?.id ?? null };
      for (const k of Object.keys(format)) if (dto[k] !== undefined) data[format[k]] = dto[k];
      if (dto.next_number !== undefined) data.machine_next = dto.next_number;
      await repository.setMachineNumbering(before.id, data);
      await auditService.record({ action: auditService.Action.UPDATE, entity: 'CompanySettings', entityId: before.id, actor, changes: auditService.diff(before, data) });
      return this.getMachineNumbering();
    },
  };
}

const projectService = createProjectService(projectRepository);

module.exports = { projectService, createProjectService };
