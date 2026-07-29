const { settingsRepository } = require('./settings.repository');
const { encrypt, decrypt } = require('../../lib/crypto');
const { BadRequestError } = require('../../core');

/**
 * Settings business logic.
 *
 * Two responsibilities dominate this module, and both are security rather than
 * domain concerns:
 *
 *   1. **Role-based projection.** `GET /settings` is readable by every
 *      authenticated user because the application shell renders the company
 *      name and logo. Only system administrators may see SMTP and login
 *      configuration, so the response is filtered by role here.
 *   2. **Secret handling.** `smtp_pass` is encrypted at rest and never leaves
 *      this layer in either form — callers receive a `smtp_pass_set` boolean.
 *
 * @param {ReturnType<typeof import('./settings.repository').createSettingsRepository>} repository
 */
function createSettingsService(repository) {
  /**
   * Fields any authenticated user may read.
   *
   * Everything outside this list is operational configuration disclosed only
   * to system administrators.
   */
  const PUBLIC_FIELDS = Object.freeze(['company_name', 'company_logo']);

  /**
   * Shapes a settings record for the response.
   *
   * @param {import('@prisma/client').CompanySettings} settings
   * @param {boolean} isSystemAdmin
   * @returns {Record<string, unknown>}
   */
  function project(settings, isSystemAdmin) {
    const { smtp_pass, ...rest } = settings;

    if (!isSystemAdmin) {
      return Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, rest[field] ?? null]));
    }

    // The secret itself is never returned, even to an administrator — knowing
    // one is configured is all the settings form needs to render correctly.
    return { ...rest, smtp_pass_set: Boolean(smtp_pass) };
  }

  return {
    /**
     * @param {{ is_system?: boolean }} [actor]
     * @returns {Promise<Record<string, unknown>>}
     */
    async get(actor) {
      const settings = await repository.getOrCreate();
      return project(settings, Boolean(actor?.is_system));
    },

    /**
     * Updates company identity fields.
     *
     * @param {object} dto
     * @returns {Promise<Record<string, unknown>>}
     */
    async updateCompanyInfo(dto) {
      const settings = await repository.getOrCreate();
      const updated = await repository.update(settings.id, dto);
      return project(updated, true);
    },

    /**
     * Updates SMTP configuration.
     *
     * The password is written only when a non-empty value is supplied, so
     * saving the form without retyping the secret preserves it. When supplied,
     * it is encrypted before it reaches the database.
     *
     * @param {object} dto
     * @returns {Promise<Record<string, unknown>>}
     */
    async updateEmailSettings(dto) {
      const settings = await repository.getOrCreate();

      const { smtp_pass, ...rest } = dto;
      /** @type {Record<string, unknown>} */
      const data = { ...rest };

      if (typeof smtp_pass === 'string' && smtp_pass.trim()) {
        data.smtp_pass = encrypt(smtp_pass.trim());
      }

      const updated = await repository.update(settings.id, data);
      return project(updated, true);
    },

    /**
     * Updates login-security and upload limits.
     *
     * @param {object} dto
     * @returns {Promise<Record<string, unknown>>}
     */
    async updateSecuritySettings(dto) {
      const settings = await repository.getOrCreate();
      const updated = await repository.update(settings.id, dto);
      return project(updated, true);
    },

    /**
     * Records an uploaded logo path.
     *
     * @param {string} logoPath
     * @returns {Promise<{ logo: string }>}
     */
    async setLogo(logoPath) {
      const settings = await repository.getOrCreate();
      await repository.update(settings.id, { company_logo: logoPath });
      return { logo: logoPath };
    },

    /**
     * Returns the mail configuration with the password decrypted.
     *
     * Consumed by the mailer only. Kept separate from `get` so a decrypted
     * secret is never reachable from an HTTP-facing path.
     *
     * @returns {Promise<object|null>}
     */
    async getMailConfig() {
      const config = await repository.findMailConfig();
      if (!config) return null;
      return { ...config, smtp_pass: decrypt(config.smtp_pass) };
    },

    /**
     * @returns {Promise<{ maxAttempts: number, windowMs: number }>}
     */
    async getRateLimitConfig() {
      const config = await repository.findRateLimitConfig();
      return {
        maxAttempts: config?.login_max_attempts ?? 5,
        windowMs: (config?.login_window_minutes ?? 15) * 60 * 1000,
      };
    },

    /**
     * Asserts SMTP is configured before an operation that depends on it.
     *
     * @returns {Promise<object>} The decrypted mail configuration.
     * @throws {BadRequestError}
     */
    async requireMailConfig() {
      const config = await this.getMailConfig();

      if (!config?.smtp_host || !config?.smtp_user || !config?.smtp_pass) {
        throw new BadRequestError('SMTP is not configured. Please save SMTP settings first.');
      }
      return config;
    },
  };
}

const settingsService = createSettingsService(settingsRepository);

module.exports = { settingsService, createSettingsService };
