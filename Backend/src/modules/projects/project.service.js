const { projectRepository } = require('./project.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError, buildSearchClause } = require('../../core');

/**
 * Project business logic.
 *
 *   - A project may be linked to a won enquiry. Its **cost** is entered on the
 *     project (an amount in a currency of the currency master; INR unless
 *     chosen). Later it will come from the linked enquiry's final costing value.
 *   - **Department codes** (Administrator → Configuration → Department Codes)
 *     live here too: each department's code, for project tag numbers when
 *     they are redesigned.
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
  async function assertRefs({ enquiry_id, owner_id, cost_currency, allowId }) {
    if (enquiry_id !== undefined && enquiry_id !== null && !(await repository.enquiryLinkable(enquiry_id, allowId))) {
      throw new ValidationError('Validation failed', [
        { field: 'enquiry_id', message: 'Enquiry must be won and not already linked to a project' },
      ]);
    }
    if (cost_currency !== undefined && !(await repository.currencyExists(cost_currency))) {
      throw new ValidationError('Validation failed', [{ field: 'cost_currency', message: 'Choose a currency from the currency master' }]);
    }
    if (owner_id !== undefined && owner_id !== null && !(await repository.userExists(owner_id))) {
      throw new ValidationError('Validation failed', [
        { field: 'owner_id', message: 'Selected owner does not exist' },
      ]);
    }
  }

  /** Only the writable columns, mapped from the validated DTO. */
  function pickWritable(dto, data = {}) {
    for (const f of ['name', 'description', 'status', 'enquiry_id', 'owner_id', 'start_date', 'end_date', 'cost', 'cost_currency']) {
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
      await assertRefs({ enquiry_id: dto.enquiry_id, owner_id: dto.owner_id, cost_currency: dto.cost_currency });
      // create has no current link to exempt.

      const data = pickWritable(dto, {
        code: await nextCode(),
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });

      const project = await repository.create(data);

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'Project',
        entityId: project.id,
        actor,
        changes: { code: project.code, name: project.name, enquiry_id: project.enquiry_id },
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

      await assertRefs({ enquiry_id: dto.enquiry_id, owner_id: dto.owner_id, cost_currency: dto.cost_currency, allowId: before.enquiry_id ?? undefined });

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

    /** A project's change history (audit log), newest first. */
    async history(id, { page = 1, limit = 20 } = {}) {
      const project = await repository.findById(id);
      if (!project) throw new NotFoundError('Project');
      const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const p = Math.max(Number(page) || 1, 1);
      const { items, total } = await auditService.list({
        filters: { entity: 'Project', entity_id: String(id) }, skip: (p - 1) * take, take,
      });
      return { items, total, page: p, limit: take };
    },

    // ── Department codes (Administrator → Configuration → Department Codes) ──
    /** Every live department with its code (null = none yet). */
    async listDepartmentCodes() {
      return repository.listDepartmentCodes();
    },

    /** Gives a department its code, changes it, or clears it (`code: null`). Unique among live departments. */
    async setDepartmentCode(departmentId, dto, actor) {
      const dept = await repository.findDepartment(departmentId);
      if (!dept) throw new NotFoundError('Department');
      const code = dto.code ?? null;
      if (code !== null) {
        const clash = await repository.findDepartmentByCode(code, departmentId);
        if (clash) throw new ConflictError(`Code ${code} is already used by ${clash.name}`);
      }
      if (code !== dept.dept_code) {
        await repository.setDepartmentCode(departmentId, code, actor?.id ?? null);
        await auditService.record({
          action: auditService.Action.UPDATE, entity: 'Department', entityId: departmentId, actor,
          changes: { dept_code: { from: dept.dept_code, to: code } },
        });
      }
      return repository.listDepartmentCodes();
    },
  };
}

const projectService = createProjectService(projectRepository);

module.exports = { projectService, createProjectService };
