const prisma = require('../../lib/prisma');

/**
 * Settings data-access layer.
 *
 * `CompanySettings` is a singleton table — exactly one row is expected — so
 * every accessor funnels through `getOrCreate` rather than each caller
 * repeating a find-then-create dance.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createSettingsRepository(db) {
  return {
    /**
     * Returns the settings row, creating it on first access.
     *
     * NOTE — nothing in the schema constrains this table to a single row, so
     * two concurrent first-time requests could each insert one. The seeder
     * creates the row up front, which closes the window in practice; the
     * durable fix is a fixed primary key with a check constraint, which is a
     * migration rather than part of this layer.
     *
     * @returns {Promise<import('@prisma/client').CompanySettings>}
     */
    async getOrCreate() {
      const existing = await db.companySettings.findFirst();
      if (existing) return existing;
      return db.companySettings.create({ data: {} });
    },

    /**
     * @param {number} id
     * @param {Record<string, unknown>} data
     * @returns {Promise<import('@prisma/client').CompanySettings>}
     */
    update(id, data) {
      return db.companySettings.update({ where: { id }, data });
    },

    /**
     * Reads only the fields the mailer needs.
     *
     * @returns {Promise<object|null>}
     */
    findMailConfig() {
      return db.companySettings.findFirst({
        select: {
          smtp_host: true, smtp_port: true, smtp_user: true, smtp_pass: true,
          smtp_from_name: true, smtp_from_email: true,
          email_notifications: true, company_name: true,
        },
      });
    },

    /**
     * Reads only the fields the login rate limiter needs.
     *
     * @returns {Promise<{ login_max_attempts: number, login_window_minutes: number }|null>}
     */
    findRateLimitConfig() {
      return db.companySettings.findFirst({
        select: { login_max_attempts: true, login_window_minutes: true },
      });
    },
  };
}

const settingsRepository = createSettingsRepository(prisma);

module.exports = { settingsRepository, createSettingsRepository };
