const prisma = require('../../lib/prisma');

/**
 * Sales workflow configuration data-access. A single row holds the selected
 * Internal Sales handler; it is created lazily on first read.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createWorkflowRepository(db) {
  const configSelect = Object.freeze({
    id: true,
    internal_user_id: true,
    internal_user: { select: { id: true, name: true, email: true } },
    updated_at: true,
  });

  return {
    /** The single config row, created empty if it does not exist yet. */
    async get() {
      const row = await db.salesWorkflowConfig.findFirst({ select: configSelect });
      if (row) return row;
      return db.salesWorkflowConfig.create({ data: {}, select: configSelect });
    },

    /** Just the internal handler's user id (or null when unset). */
    async internalUserId() {
      const row = await db.salesWorkflowConfig.findFirst({ select: { internal_user_id: true } });
      return row?.internal_user_id ?? null;
    },

    /** @param {number|null} internalUserId @param {number|null} actorId */
    async setInternalUser(internalUserId, actorId = null) {
      const existing = await db.salesWorkflowConfig.findFirst({ select: { id: true } });
      const data = { internal_user_id: internalUserId, updated_by: actorId };
      if (existing) {
        return db.salesWorkflowConfig.update({ where: { id: existing.id }, data, select: configSelect });
      }
      return db.salesWorkflowConfig.create({ data, select: configSelect });
    },

    async userExists(id) {
      const row = await db.user.findFirst({ where: { id, deleted_at: null }, select: { id: true } });
      return row !== null;
    },
  };
}

const workflowRepository = createWorkflowRepository(prisma);

module.exports = { workflowRepository, createWorkflowRepository };
