const { rolesRepository } = require('./roles.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ForbiddenError, ValidationError } = require('../../core');

/**
 * Roles business logic.
 *
 * The rules that matter here concern system roles and referential safety:
 * a role flagged `is_system` is the permission-check bypass, so it must not be
 * editable or deletable through the API, and a role still assigned to users
 * cannot be removed without orphaning them.
 *
 * @param {ReturnType<typeof import('./roles.repository').createRolesRepository>} repository
 */
function createRolesService(repository) {
  const SORTABLE_FIELDS = Object.freeze(['name', 'slug', 'created_at']);

  /**
   * Projects a role so that every known permission appears, with `allowed`
   * defaulting to false where no grant row exists.
   *
   * The UI renders a full permission matrix; without this it would only receive
   * the permissions a role had been explicitly given at some point, and newly
   * added permissions would be invisible until someone toggled them.
   *
   * @param {object} role
   * @param {object[]} allPermissions
   * @returns {object}
   */
  function withCompletePermissionMatrix(role, allPermissions) {
    const existing = new Map(role.rolePermissions.map((rp) => [rp.permission.id, rp.allowed]));

    return {
      ...role,
      rolePermissions: allPermissions.map((permission) => ({
        allowed: existing.get(permission.id) ?? false,
        permission,
      })),
    };
  }

  /**
   * Loads a role and asserts it exists and is modifiable.
   *
   * @param {number} id
   * @param {string} action Verb used in the error message.
   * @returns {Promise<{ id: number, is_system: boolean, name: string }>}
   * @throws {NotFoundError|ForbiddenError}
   */
  async function assertModifiable(id, action) {
    const role = await repository.findMeta(id);
    if (!role) throw new NotFoundError('Role');

    if (role.is_system) {
      throw new ForbiddenError(`System roles cannot be ${action}`);
    }
    return role;
  }

  /**
   * Rejects grants that reference permissions which do not exist.
   *
   * @param {Array<{ permission_id: number }>} grants
   * @throws {ValidationError}
   */
  async function assertPermissionsExist(grants) {
    if (grants.length === 0) return;

    const ids = [...new Set(grants.map((g) => g.permission_id))];
    const existing = await repository.findExistingPermissionIds(ids);
    const unknown = ids.filter((id) => !existing.has(id));

    if (unknown.length > 0) {
      throw new ValidationError('Validation failed', [
        { field: 'permissions', message: `Unknown permission id(s): ${unknown.join(', ')}` },
      ]);
    }
  }

  return {
    SORTABLE_FIELDS,

    /**
     * Lists roles, each with a complete permission matrix.
     *
     * @param {Partial<import('../../core/http/queryOptions').ListQuery>} [query]
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async list(query = {}) {
      const [{ items, total }, allPermissions] = await Promise.all([
        repository.findPage({
          orderBy: query.orderBy,
          skip: query.skip,
          take: query.take,
        }),
        repository.findAllPermissions(),
      ]);

      return {
        items: items.map((role) => withCompletePermissionMatrix(role, allPermissions)),
        total,
      };
    },

    /**
     * @param {number} id
     * @returns {Promise<object>}
     * @throws {NotFoundError}
     */
    async getById(id) {
      const [role, allPermissions] = await Promise.all([
        repository.findById(id),
        repository.findAllPermissions(),
      ]);

      if (!role) throw new NotFoundError('Role');
      return withCompletePermissionMatrix(role, allPermissions);
    },

    /**
     * Creates a role.
     *
     * @param {object} dto
     * @param {string} dto.name
     * @param {string} dto.slug
     * @param {string} [dto.description]
     * @param {Array<{ permission_id: number, allowed: boolean }>} [dto.permissions]
     * @returns {Promise<object>}
     */
    async create(dto, actor) {
      const conflict = await repository.findConflicting({ name: dto.name, slug: dto.slug });
      if (conflict) {
        const field = conflict.name === dto.name ? 'name' : 'slug';
        throw new ConflictError(`A role with this ${field} already exists`);
      }

      const permissions = dto.permissions || [];
      await assertPermissionsExist(permissions);

      const role = await repository.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          created_by: actor?.id ?? null,
          updated_by: actor?.id ?? null,
        },
        permissions,
      });

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'Role',
        entityId: role.id,
        actor,
        changes: {
          name: role.name,
          slug: role.slug,
          granted: permissions.filter((p) => p.allowed).length,
        },
      });

      const allPermissions = await repository.findAllPermissions();
      return withCompletePermissionMatrix(role, allPermissions);
    },

    /**
     * Updates a role's descriptive fields.
     *
     * @param {number} id
     * @param {{ name?: string, slug?: string, description?: string }} dto
     * @returns {Promise<object>}
     */
    async update(id, dto, actor) {
      await assertModifiable(id, 'modified');

      if (dto.name !== undefined || dto.slug !== undefined) {
        const conflict = await repository.findConflicting({
          name: dto.name, slug: dto.slug, excludeId: id,
        });
        if (conflict) {
          const field = conflict.name === dto.name ? 'name' : 'slug';
          throw new ConflictError(`A role with this ${field} already exists`);
        }
      }

      const role = await repository.update(id, { ...dto, updated_by: actor?.id ?? null });

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Role',
        entityId: id,
        actor,
        changes: dto,
      });

      const allPermissions = await repository.findAllPermissions();
      return withCompletePermissionMatrix(role, allPermissions);
    },

    /**
     * Replaces a role's permission grants.
     *
     * @param {number} id
     * @param {Array<{ permission_id: number, allowed: boolean }>} permissions
     * @returns {Promise<object>}
     */
    async setPermissions(id, permissions, actor) {
      await assertModifiable(id, 'modified');
      await assertPermissionsExist(permissions);

      const role = await repository.replacePermissions(id, permissions);

      // Permission changes are the highest-value entries in the trail: they are
      // how privilege escalation would be carried out, so the granted set is
      // recorded in full rather than as a count.
      await auditService.record({
        action: auditService.Action.PERMISSIONS_SET,
        entity: 'Role',
        entityId: id,
        actor,
        changes: {
          allowed: permissions.filter((p) => p.allowed).map((p) => p.permission_id),
          denied:  permissions.filter((p) => !p.allowed).map((p) => p.permission_id),
        },
      });

      const allPermissions = await repository.findAllPermissions();
      return withCompletePermissionMatrix(role, allPermissions);
    },

    /**
     * Deletes a role.
     *
     * Refuses while users still hold it: the `role_id` foreign key is required,
     * so those users would be orphaned and the database would reject the delete
     * anyway — but with a constraint error rather than an explanation.
     *
     * @param {number} id
     * @returns {Promise<void>}
     */
    async remove(id, actor) {
      const role = await assertModifiable(id, 'deleted');

      const assigned = await repository.countUsers(id);
      if (assigned > 0) {
        throw new ConflictError(
          `Cannot delete a role that is still assigned to ${assigned} user(s). ` +
          'Reassign them first.'
        );
      }

      await repository.softDelete(id, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'Role',
        entityId: id,
        actor,
        changes: { name: role.name, soft_deleted: true },
      });
    },
  };
}

const rolesService = createRolesService(rolesRepository);

module.exports = { rolesService, createRolesService };
