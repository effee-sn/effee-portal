const { settingsRepository } = require('./settings.repository');

/**
 * Settings business logic.
 *
 * **Role-based projection.** `GET /settings` is readable by every authenticated
 * user because the application shell renders the company name and logo. Only
 * system administrators may see login-security configuration, so the response
 * is filtered by role here.
 *
 * SMTP is not stored here — it is configured from the environment (`SMTP_*` in
 * `.env`, see `config.MAIL` and `lib/mailer`).
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
    if (!isSystemAdmin) {
      return Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, settings[field] ?? null]));
    }
    return { ...settings };
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
     * @returns {Promise<{ maxAttempts: number, windowMs: number }>}
     */
    async getRateLimitConfig() {
      const config = await repository.findRateLimitConfig();
      return {
        maxAttempts: config?.login_max_attempts ?? 5,
        windowMs: (config?.login_window_minutes ?? 15) * 60 * 1000,
      };
    },
  };
}

const settingsService = createSettingsService(settingsRepository);

module.exports = { settingsService, createSettingsService };
