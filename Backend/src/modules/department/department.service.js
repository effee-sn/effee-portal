const { departmentRepository } = require('./department.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError, buildSearchClause } = require('../../core');

/**
 * Department business logic.
 *
 * @param {ReturnType<typeof import('./department.repository').createDepartmentRepository>} repository
 */
function createDepartmentService(repository) {
  const SORTABLE_FIELDS   = Object.freeze(['name', 'created_at']);
  const SEARCHABLE_FIELDS = Object.freeze(['name', 'description']);

  /**
   * Rejects a duplicate name.
   * @param {{ name: string, excludeId?: number }} params
   * @throws {ConflictError}
   */
  async function assertUnique({ name, excludeId }) {
    const conflict = await repository.findConflicting({ name, excludeId });
    if (conflict) throw new ConflictError('A department with this name already exists');
  }

  /**
   * Asserts the chosen head is a real user, when one is supplied.
   * @param {number|null|undefined} headUserId
   * @throws {ValidationError}
   */
  async function assertHeadExists(headUserId) {
    if (headUserId === null || headUserId === undefined) return;
    if (!(await repository.userExists(headUserId))) {
      throw new ValidationError('Validation failed', [
        { field: 'head_user_id', message: 'Selected head user does not exist' },
      ]);
    }
  }

  return {
    SORTABLE_FIELDS,

    /** @param {import('../../core/http/queryOptions').ListQuery} query */
    async list(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const where = { ...query.filters, ...(search || {}) };
      return repository.findPage({ where, orderBy: query.orderBy, skip: query.skip, take: query.take });
    },

    /** Active departments for select inputs. */
    options() {
      return repository.findActiveOptions();
    },

    /** @param {number} id @throws {NotFoundError} */
    async getById(id) {
      const dept = await repository.findById(id);
      if (!dept) throw new NotFoundError('Department');
      return dept;
    },

    /**
     * @param {{ name: string, code?: string, description?: string }} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async create(dto, actor) {
      await assertUnique({ name: dto.name });
      await assertHeadExists(dto.head_user_id);

      const dept = await repository.create({
        name: dto.name,
        description: dto.description ?? null,
        head_user_id: dto.head_user_id ?? null,
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'Department',
        entityId: dept.id,
        actor,
        changes: { name: dept.name },
      });

      return dept;
    },

    /**
     * @param {number} id
     * @param {{ name?: string, code?: string, description?: string }} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async update(id, dto, actor) {
      if (!(await repository.existsById(id))) throw new NotFoundError('Department');

      if (dto.name !== undefined) {
        await assertUnique({ name: dto.name, excludeId: id });
      }
      if (dto.head_user_id !== undefined && dto.head_user_id !== null) {
        await assertHeadExists(dto.head_user_id);
      }

      /** @type {Record<string, unknown>} */
      const data = {};
      if (dto.name         !== undefined) data.name = dto.name;
      if (dto.description  !== undefined) data.description = dto.description;
      // `head_user_id` accepts null to clear the head.
      if (dto.head_user_id !== undefined) data.head_user_id = dto.head_user_id;
      data.updated_by = actor?.id ?? null;

      const dept = await repository.update(id, data);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Department',
        entityId: id,
        actor,
        changes: { fields: Object.keys(data).filter((k) => k !== 'updated_by') },
      });

      return dept;
    },

    /**
     * Soft-deletes a department. Refuses while users are still assigned to it —
     * they would be left pointing at a department nobody can see.
     *
     * @param {number} id
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     * @throws {NotFoundError|ConflictError}
     */
    async remove(id, actor) {
      const dept = await repository.findById(id);
      if (!dept) throw new NotFoundError('Department');

      const members = await repository.countMembers(id);
      if (members > 0) {
        throw new ConflictError(
          `Cannot delete a department with ${members} assigned user(s). Reassign them first.`
        );
      }

      await repository.softDelete(id, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'Department',
        entityId: id,
        actor,
        changes: { name: dept.name, soft_deleted: true },
      });
    },
  };
}

const departmentService = createDepartmentService(departmentRepository);

module.exports = { departmentService, createDepartmentService };
