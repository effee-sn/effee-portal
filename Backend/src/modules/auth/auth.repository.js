const prisma = require('../../lib/prisma');

/**
 * Auth data-access layer.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createAuthRepository(db) {
  return {
    /**
     * Loads a user for credential verification.
     *
     * Includes the password hash — the only projection in the codebase that
     * does, and the reason it is a distinct method rather than a flag on a
     * shared one. Its result must never be returned to a client unfiltered.
     *
     * @param {string} email
     * @returns {Promise<object|null>}
     */
    findForLogin(email) {
      return db.user.findUnique({
        where: { email },
        include: { role: { select: { name: true, slug: true } } },
      });
    },

    /**
     * @param {number} id
     * @returns {Promise<{ id: number, password: string }|null>}
     */
    findCredentials(id) {
      return db.user.findUnique({ where: { id }, select: { id: true, password: true } });
    },

    /**
     * @param {string} email
     * @returns {Promise<{ id: number, name: string, email: string }|null>}
     */
    findByEmail(email) {
      return db.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true },
      });
    },

    /**
     * The caller's identity plus their allowed permission codes.
     *
     * @param {number} id
     * @returns {Promise<object|null>}
     */
    findWithPermissions(id) {
      return db.user.findUnique({
        where: { id },
        select: {
          id: true, name: true, email: true, department_id: true,
          role: {
            select: {
              id: true, name: true, slug: true, is_system: true,
              rolePermissions: {
                where: { allowed: true },
                select: { permission: { select: { code: true } } },
              },
            },
          },
        },
      });
    },

    /**
     * The caller's full profile, with permissions grouped for display.
     *
     * @param {number} id
     * @returns {Promise<object|null>}
     */
    findProfile(id) {
      return db.user.findUnique({
        where: { id },
        select: {
          id: true, name: true, email: true, phone: true,
          status: true, is_verified: true, created_at: true,
          role: {
            select: {
              id: true, name: true, slug: true, is_system: true,
              rolePermissions: {
                where: { allowed: true },
                select: {
                  permission: {
                    select: { code: true, action: true, module: { select: { name: true } } },
                  },
                },
              },
            },
          },
        },
      });
    },

    /**
     * @param {object} params
     * @param {string} params.email
     * @param {string} [params.phone]
     * @param {number} params.excludeId
     * @returns {Promise<{ id: number, email: string, phone: string|null }|null>}
     */
    findConflicting({ email, phone, excludeId }) {
      /** @type {Array<Record<string, unknown>>} */
      const or = [];
      if (email) or.push({ email });
      if (phone) or.push({ phone });
      if (or.length === 0) return Promise.resolve(null);

      return db.user.findFirst({
        where: { OR: or, NOT: { id: excludeId } },
        select: { id: true, email: true, phone: true },
      });
    },

    /**
     * @param {number} id
     * @param {Record<string, unknown>} data
     * @returns {Promise<object>}
     */
    updateProfile(id, data) {
      return db.user.update({
        where: { id },
        data,
        select: { id: true, name: true, email: true, phone: true },
      });
    },

    /**
     * Sets a new password and invalidates outstanding reset links atomically.
     *
     * The two writes must land together: changing a password without consuming
     * live reset tokens would leave a redeemable link in an inbox an attacker
     * may control.
     *
     * @param {number} userId
     * @param {string} passwordHash
     * @returns {Promise<void>}
     */
    async setPassword(userId, passwordHash) {
      await db.$transaction([
        db.user.update({ where: { id: userId }, data: { password: passwordHash } }),
        db.passwordResetToken.updateMany({
          where: { user_id: userId, used: false },
          data:  { used: true },
        }),
      ]);
    },

    /**
     * Invalidates outstanding tokens and issues a new one atomically.
     *
     * @param {object} params
     * @param {number} params.userId
     * @param {string} params.token
     * @param {Date} params.expiresAt
     * @returns {Promise<void>}
     */
    async issueResetToken({ userId, token, expiresAt }) {
      await db.$transaction([
        db.passwordResetToken.updateMany({
          where: { user_id: userId, used: false },
          data:  { used: true },
        }),
        db.passwordResetToken.create({
          data: { user_id: userId, token, expires_at: expiresAt },
        }),
      ]);
    },

    /**
     * @param {string} token
     * @returns {Promise<object|null>}
     */
    findResetToken(token) {
      return db.passwordResetToken.findUnique({ where: { token } });
    },

    /**
     * Redeems a reset token and sets the new password atomically.
     *
     * @param {object} params
     * @param {string} params.token
     * @param {number} params.userId
     * @param {string} params.passwordHash
     * @returns {Promise<void>}
     */
    async redeemResetToken({ token, userId, passwordHash }) {
      await db.$transaction([
        db.user.update({ where: { id: userId }, data: { password: passwordHash } }),
        db.passwordResetToken.update({ where: { token }, data: { used: true } }),
      ]);
    },
  };
}

const authRepository = createAuthRepository(prisma);

module.exports = { authRepository, createAuthRepository };
