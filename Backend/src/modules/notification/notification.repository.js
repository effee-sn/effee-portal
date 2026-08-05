const prisma = require('../../lib/prisma');

/**
 * Notification data-access layer.
 *
 * The only file that touches Prisma for notifications. Also resolves the sets of
 * recipients that emit-points can't name directly — role members, department
 * members, and holders of a permission — reusing the same shape the inbox uses.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createNotificationRepository(db) {
  return {
    /**
     * Inserts many notifications in one round-trip.
     * @param {Array<object>} rows
     */
    createMany(rows) {
      return db.notification.createMany({ data: rows });
    },

    /**
     * A user's notifications, newest first.
     * @param {number} userId
     * @param {{ where?: object, skip: number, take: number }} params
     * @returns {Promise<{ items: object[], total: number, unread: number }>}
     */
    async findPage(userId, { where = {}, skip, take }) {
      const scoped = { ...where, user_id: userId };
      const [items, total, unread] = await Promise.all([
        db.notification.findMany({ where: scoped, orderBy: { created_at: 'desc' }, skip, take }),
        db.notification.count({ where: scoped }),
        db.notification.count({ where: { user_id: userId, read_at: null } }),
      ]);
      return { items, total, unread };
    },

    /** @param {number} userId */
    unreadCount(userId) {
      return db.notification.count({ where: { user_id: userId, read_at: null } });
    },

    /**
     * Marks one of the user's notifications read (scoped to the owner so a user
     * cannot mark someone else's). Returns how many rows changed.
     * @param {number} userId @param {number} id
     */
    async markRead(userId, id) {
      const res = await db.notification.updateMany({
        where: { id, user_id: userId, read_at: null },
        data: { read_at: new Date() },
      });
      return res.count;
    },

    /** Marks all of the user's unread notifications read. @param {number} userId */
    async markAllRead(userId) {
      const res = await db.notification.updateMany({
        where: { user_id: userId, read_at: null },
        data: { read_at: new Date() },
      });
      return res.count;
    },

    // ── Recipient resolution ────────────────────────────────────────────────
    /** Active members of a role. @param {number} roleId @returns {Promise<number[]>} */
    async userIdsByRole(roleId) {
      const rows = await db.user.findMany({
        where: { role_id: roleId, deleted_at: null, status: 'ACTIVE' }, select: { id: true },
      });
      return rows.map((r) => r.id);
    },

    /** Active members of a department. @param {number} deptId @returns {Promise<number[]>} */
    async userIdsByDepartment(deptId) {
      const rows = await db.user.findMany({
        where: { department_id: deptId, deleted_at: null, status: 'ACTIVE' }, select: { id: true },
      });
      return rows.map((r) => r.id);
    },

    /**
     * Active users who hold a permission — a role that grants it, or a system
     * role (which bypasses all checks). Mirrors the `canManage` authorisation.
     * @param {string} code @returns {Promise<number[]>}
     */
    async userIdsWithPermission(code) {
      const rows = await db.user.findMany({
        where: {
          deleted_at: null, status: 'ACTIVE',
          role: {
            OR: [
              { is_system: true },
              { rolePermissions: { some: { allowed: true, permission: { code } } } },
            ],
          },
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    },

    // ── Push subscriptions ──────────────────────────────────────────────────
    /**
     * Stores (or refreshes) a browser's push subscription, keyed by its unique
     * endpoint so re-subscribing the same browser updates rather than duplicates.
     * @param {{ user_id: number, endpoint: string, p256dh: string, auth: string, user_agent?: string|null }} sub
     */
    saveSubscription(sub) {
      const { endpoint, user_id, p256dh, auth, user_agent } = sub;
      return db.pushSubscription.upsert({
        where: { endpoint },
        update: { user_id, p256dh, auth, user_agent: user_agent ?? null },
        create: { endpoint, user_id, p256dh, auth, user_agent: user_agent ?? null },
      });
    },

    /** Removes a subscription by endpoint (unsubscribe, or pruning a dead one). */
    deleteSubscription(endpoint) {
      return db.pushSubscription.deleteMany({ where: { endpoint } });
    },

    /** All subscriptions for a set of users. @param {number[]} userIds */
    subscriptionsForUsers(userIds) {
      return db.pushSubscription.findMany({
        where: { user_id: { in: userIds } },
        select: { endpoint: true, p256dh: true, auth: true },
      });
    },
  };
}

const notificationRepository = createNotificationRepository(prisma);

module.exports = { notificationRepository, createNotificationRepository };
