const { projectRepository } = require('./project.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ValidationError, buildSearchClause } = require('../../core');

/**
 * Project business logic.
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

  /** Validates the optional enquiry / owner references on a write. */
  async function assertRefs({ enquiry_id, owner_id }) {
    if (enquiry_id !== undefined && enquiry_id !== null && !(await repository.enquiryExists(enquiry_id))) {
      throw new ValidationError('Validation failed', [
        { field: 'enquiry_id', message: 'Selected enquiry does not exist' },
      ]);
    }
    if (owner_id !== undefined && owner_id !== null && !(await repository.userExists(owner_id))) {
      throw new ValidationError('Validation failed', [
        { field: 'owner_id', message: 'Selected owner does not exist' },
      ]);
    }
  }

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
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async create(dto, actor) {
      await assertRefs({ enquiry_id: dto.enquiry_id, owner_id: dto.owner_id });

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

      await assertRefs({ enquiry_id: dto.enquiry_id, owner_id: dto.owner_id });

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
  };
}

const projectService = createProjectService(projectRepository);

module.exports = { projectService, createProjectService };
