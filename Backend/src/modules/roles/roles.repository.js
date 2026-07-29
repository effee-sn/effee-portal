const prisma = require('../../lib/prisma');

/**
 * Roles data-access layer.
 *
 * The only file in the roles module that touches Prisma.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createRolesRepository(db) {
  /** Permission projection shared by every role query. */
  const permissionSelect = Object.freeze({
    id: true,
    code: true,
    action: true,
    module: { select: { name: true, slug: true } },
  });

  /** Full role projection including its stored permission grants. */
  const roleSelect = Object.freeze({
    id: true,
    name: true,
    slug: true,
    description: true,
    is_system: true,
    created_at: true,
    rolePermissions: {
      select: { allowed: true, permission: { select: permissionSelect } },
    },
  });

  /**
   * Restricts a query to roles that have not been soft-deleted.
   *
   * @param {Record<string, unknown>} [where]
   * @returns {Record<string, unknown>}
   */
  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    roleSelect,
    permissionSelect,
    active,

    /**
     * @param {object} [params]
     * @param {Record<string, unknown>} [params.where]
     * @param {Record<string, 'asc'|'desc'>} [params.orderBy]
     * @param {number} [params.skip]
     * @param {number} [params.take]
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async findPage({ where = {}, orderBy = { created_at: 'asc' }, skip, take } = {}) {
      const scoped = active(where);

      const [items, total] = await Promise.all([
        db.role.findMany({ where: scoped, select: roleSelect, orderBy, skip, take }),
        db.role.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /**
     * @param {number} id
     * @returns {Promise<object|null>}
     */
    findById(id) {
      return db.role.findFirst({ where: active({ id }), select: roleSelect });
    },

    /**
     * Reads a role's identity flags without its permission set.
     *
     * @param {number} id
     * @returns {Promise<{ id: number, is_system: boolean, name: string }|null>}
     */
    findMeta(id) {
      return db.role.findFirst({
        where: active({ id }),
        select: { id: true, is_system: true, name: true },
      });
    },

    /**
     * @param {object} params
     * @param {string} [params.name]
     * @param {string} [params.slug]
     * @param {number} [params.excludeId]
     * @returns {Promise<{ id: number, name: string, slug: string }|null>}
     */
    findConflicting({ name, slug, excludeId }) {
      /** @type {Array<Record<string, unknown>>} */
      const or = [];
      if (name) or.push({ name });
      if (slug) or.push({ slug });
      if (or.length === 0) return Promise.resolve(null);

      return db.role.findFirst({
        where: {
          OR: or,
          ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true, name: true, slug: true },
      });
    },

    /** @returns {Promise<object[]>} Every permission, ordered for display. */
    findAllPermissions() {
      return db.permission.findMany({
        select: permissionSelect,
        orderBy: [{ module_id: 'asc' }, { action: 'asc' }],
      });
    },

    /**
     * Returns the ids among `permissionIds` that actually exist.
     *
     * Used to reject grants referencing unknown permissions before writing,
     * rather than letting a foreign-key violation surface as a generic error.
     *
     * @param {number[]} permissionIds
     * @returns {Promise<Set<number>>}
     */
    async findExistingPermissionIds(permissionIds) {
      if (permissionIds.length === 0) return new Set();

      const found = await db.permission.findMany({
        where: { id: { in: permissionIds } },
        select: { id: true },
      });
      return new Set(found.map((p) => p.id));
    },

    /**
     * Creates a role and its initial grants in one transaction.
     *
     * @param {object} params
     * @param {{ name: string, slug: string, description?: string }} params.data
     * @param {Array<{ permission_id: number, allowed: boolean }>} params.permissions
     * @returns {Promise<object>} The created role, fully loaded.
     */
    create({ data, permissions }) {
      return db.role.create({
        data: {
          ...data,
          is_system: false,
          ...(permissions.length > 0 ? { rolePermissions: { create: permissions } } : {}),
        },
        select: roleSelect,
      });
    },

    /**
     * @param {number} id
     * @param {{ name?: string, slug?: string, description?: string }} data
     * @returns {Promise<object>}
     */
    update(id, data) {
      return db.role.update({ where: { id }, data, select: roleSelect });
    },

    /**
     * Replaces a role's permission grants atomically.
     *
     * ── The bug this fixes ────────────────────────────────────────────────────
     * The previous implementation issued N independent upserts through
     * `Promise.all`, outside any transaction. A failure part-way — a dropped
     * connection, a deadlock, one bad id — left the role holding a partially
     * applied permission set, with no error indicating which half had been
     * written. For an authorisation table that means silently incorrect access
     * that persists until somebody notices.
     *
     * Wrapping the upserts in `$transaction` makes the change all-or-nothing.
     *
     * @param {number} roleId
     * @param {Array<{ permission_id: number, allowed: boolean }>} grants
     * @returns {Promise<object>} The role after the update.
     */
    async replacePermissions(roleId, grants) {
      const operations = grants.map(({ permission_id, allowed }) =>
        db.rolePermission.upsert({
          where:  { role_id_permission_id: { role_id: roleId, permission_id } },
          update: { allowed },
          create: { role_id: roleId, permission_id, allowed },
        })
      );

      await db.$transaction(operations);
      return db.role.findUnique({ where: { id: roleId }, select: roleSelect });
    },

    /**
     * Soft-deletes a role.
     *
     * The permission grants are left in place rather than destroyed. If the
     * role is ever restored it comes back configured, and until then the grants
     * are unreachable because every read filters the role out.
     *
     * @param {number} id
     * @param {number|null} [actorId]
     * @returns {Promise<{ id: number }>}
     */
    softDelete(id, actorId = null) {
      return db.role.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    /**
     * Permanently removes a role and its grants.
     *
     * Not reachable from the API; retained for data-retention duties.
     *
     * @param {number} id
     * @returns {Promise<void>}
     */
    async hardDelete(id) {
      await db.$transaction([
        db.rolePermission.deleteMany({ where: { role_id: id } }),
        db.role.delete({ where: { id } }),
      ]);
    },

    /**
     * Counts live users holding this role.
     *
     * Soft-deleted users are excluded: they are invisible to the application,
     * so they must not block deletion of a role nobody can actually be using.
     *
     * @param {number} roleId
     * @returns {Promise<number>}
     */
    countUsers(roleId) {
      return db.user.count({ where: { role_id: roleId, deleted_at: null } });
    },
  };
}

const rolesRepository = createRolesRepository(prisma);

module.exports = { rolesRepository, createRolesRepository };
