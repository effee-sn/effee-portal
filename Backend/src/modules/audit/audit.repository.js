const prisma = require('../../lib/prisma');

/**
 * Audit log data-access layer.
 *
 * Append and read only — deliberately exposes no update or delete. An audit
 * trail that the application can rewrite is not evidence of anything, so the
 * inability to modify it is a feature rather than an omission.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createAuditRepository(db) {
  return {
    /**
     * @param {object} entry
     * @returns {Promise<object>}
     */
    create(entry) {
      return db.auditLog.create({ data: entry });
    },

    /**
     * @param {object} params
     * @param {Record<string, unknown>} params.where
     * @param {Record<string, 'asc'|'desc'>} params.orderBy
     * @param {number} params.skip
     * @param {number} params.take
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async findPage({ where, orderBy, skip, take }) {
      const [items, total] = await Promise.all([
        db.auditLog.findMany({ where, orderBy, skip, take }),
        db.auditLog.count({ where }),
      ]);
      return { items, total };
    },
  };
}

const auditRepository = createAuditRepository(prisma);

module.exports = { auditRepository, createAuditRepository };
