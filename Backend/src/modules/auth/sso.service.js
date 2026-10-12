const bcrypt = require('bcrypt');
const crypto = require('crypto');

const config = require('../../config/env');
const prisma = require('../../lib/prisma');
const { createMicrosoftSso } = require('../../lib/microsoftSso');
const { authRepository } = require('./auth.repository');
const { auditService } = require('../audit/audit.service');
const { ConflictError, ValidationError, logger } = require('../../core');

/**
 * Microsoft sign-in (SSO).
 *
 * Who may sign in is decided in layers:
 *   1. Microsoft — the app is single-tenant, and (recommended) set to
 *      "Assignment required" so only assigned users/groups reach us at all.
 *   2. MS_SSO_ALLOWED_GROUP_ID — if set, the ID token must show membership.
 *   3. The portal — the email must match an active portal user (or one is
 *      created, if the administrator enabled auto-create). Roles and
 *      permissions stay the portal's.
 *
 * Switches (Administrator → Settings) live in CompanySettings; the tenant and
 * client credentials live in .env. The browser ends on the frontend's
 * /login/sso page with the session token (or an error) in the URL fragment,
 * which never reaches any server log.
 *
 * @param {{ ms?: ReturnType<typeof createMicrosoftSso>, db?: import('@prisma/client').PrismaClient,
 *   issueSession: (user: object, context: object, method: string) => Promise<string> }} deps
 */
function createSsoService({ ms = createMicrosoftSso(config.MS_SSO), db = prisma, issueSession }) {
  const STATE_TTL_MS = 10 * 60 * 1000;

  const settings = () => db.companySettings.findFirst();
  const frontend = () => config.ALLOWED_ORIGINS[0];
  const groupId = () => config.MS_SSO.ALLOWED_GROUP_ID;

  /** SSO usable right now: credentials present and switched on. */
  async function isActive(s) {
    const row = s ?? (await settings());
    return Boolean(row?.sso_microsoft_enabled && ms.isConfigured());
  }

  const fail = (message) => `${frontend()}/login/sso#error=${encodeURIComponent(message)}`;

  async function denied(context, email, reason, message) {
    await auditService.record({
      action: auditService.Action.LOGIN_FAILED,
      entity: 'User',
      actor: { ...context, id: null, email: email || null },
      changes: { method: 'microsoft', reason },
    });
    return fail(message);
  }

  return {
    isActive,

    /**
     * What the login page should offer. `password_login`: 'all' or
     * 'admin_only' (SSO on and password sign-in switched off for users).
     */
    async publicConfig() {
      const s = await settings();
      const active = await isActive(s);
      return {
        microsoft: active,
        password_login: active && s?.sso_password_login === false ? 'admin_only' : 'all',
      };
    },

    /** May this user sign in with a password? The Super Admin always may. */
    async passwordLoginAllowed(user) {
      if (user?.role?.is_system) return true;
      const s = await settings();
      return !(await isActive(s)) || s.sso_password_login !== false;
    },

    /** Settings + configuration status for the administrator. */
    async adminStatus() {
      const s = await settings();
      return {
        enabled: Boolean(s?.sso_microsoft_enabled),
        password_login: s?.sso_password_login !== false,
        auto_create: Boolean(s?.sso_auto_create),
        default_role_id: s?.sso_default_role_id ?? null,
        configured: ms.isConfigured(),
        missing: ms.missingSettings(),
        redirect_uri: config.MS_SSO.REDIRECT_URI || null,
        tenant_id: config.MS_SSO.TENANT_ID || null,
        client_id: config.MS_SSO.CLIENT_ID || null,
        group_restricted: Boolean(groupId()),
        active: await isActive(s),
      };
    },

    /**
     * @param {{ enabled?: boolean, password_login?: boolean, auto_create?: boolean, default_role_id?: number|null }} dto
     */
    async updateSettings(dto, actor) {
      const s = await settings();
      if (dto.enabled && !ms.isConfigured()) {
        throw new ConflictError(`Microsoft sign-in isn't configured yet — set ${ms.missingSettings().join(', ')} in the backend .env`);
      }
      const autoCreate = dto.auto_create ?? s.sso_auto_create;
      const roleId = dto.default_role_id !== undefined ? dto.default_role_id : s.sso_default_role_id;
      if (autoCreate) {
        if (!roleId) {
          throw new ValidationError('Validation failed', [{ field: 'default_role_id', message: 'Choose the role new users get' }]);
        }
        const role = await authRepository.roleExists(roleId);
        if (!role) {
          throw new ValidationError('Validation failed', [{ field: 'default_role_id', message: 'Selected role does not exist' }]);
        }
        // Never hand out full system access automatically.
        if (role.is_system) {
          throw new ValidationError('Validation failed', [{ field: 'default_role_id', message: 'New users cannot get the Super Admin role automatically' }]);
        }
      }
      const data = { updated_by: actor?.id ?? null };
      if (dto.enabled !== undefined) data.sso_microsoft_enabled = dto.enabled;
      if (dto.password_login !== undefined) data.sso_password_login = dto.password_login;
      if (dto.auto_create !== undefined) data.sso_auto_create = dto.auto_create;
      if (dto.default_role_id !== undefined) data.sso_default_role_id = dto.default_role_id;
      await db.companySettings.update({ where: { id: s.id }, data });

      await auditService.record({
        action: auditService.Action.SETTINGS_UPDATED, entity: 'CompanySettings', entityId: s.id, actor,
        changes: { sso: dto },
      });
      return this.adminStatus();
    },

    /** Starts a sign-in: remembers state/nonce/verifier, returns Microsoft's URL. */
    async start() {
      if (!(await isActive())) return fail('Microsoft sign-in is not enabled.');
      // Housekeeping: drop abandoned sign-ins.
      await db.ssoLoginState.deleteMany({ where: { created_at: { lt: new Date(Date.now() - STATE_TTL_MS) } } });
      const req = ms.beginSignIn();
      await db.ssoLoginState.create({ data: { state: req.state, nonce: req.nonce, code_verifier: req.codeVerifier } });
      return req.url;
    },

    /**
     * Finishes a sign-in. Always returns the frontend URL to redirect to —
     * with the session token on success, or a message on failure.
     * @param {{ code?: string, state?: string, error?: string, error_description?: string }} query
     */
    async callback(query, context) {
      if (query.error) {
        // e.g. the user cancelled, or Microsoft refused (not assigned to the app).
        const message = query.error === 'access_denied'
          ? 'Sign-in was cancelled or your Microsoft account is not allowed to use the portal.'
          : 'Microsoft sign-in failed. Please try again.';
        logger.warn({ error: query.error, description: query.error_description }, 'Microsoft sign-in returned an error');
        return denied(context, null, `microsoft_${query.error}`, message);
      }
      if (!query.code || !query.state) return fail('Microsoft sign-in failed. Please try again.');
      if (!(await isActive())) return fail('Microsoft sign-in is not enabled.');

      // One-time state: consume it whatever happens next.
      const pending = await db.ssoLoginState.findUnique({ where: { state: query.state } });
      if (pending) await db.ssoLoginState.delete({ where: { state: query.state } });
      if (!pending || Date.now() - pending.created_at.getTime() > STATE_TTL_MS) {
        return denied(context, null, 'sso_state_invalid', 'Your sign-in expired. Please try again.');
      }

      let claims;
      try {
        claims = await ms.completeSignIn({ code: query.code, codeVerifier: pending.code_verifier, nonce: pending.nonce });
      } catch (err) {
        logger.warn({ err: err.message }, 'Microsoft sign-in could not be verified');
        return denied(context, null, 'sso_token_invalid', 'Microsoft sign-in could not be verified. Please try again.');
      }

      const email = ms.emailOf(claims);
      if (!email) return denied(context, null, 'sso_no_email', 'Your Microsoft account has no email address.');

      if (groupId()) {
        const status = ms.groupStatus(claims, groupId());
        if (status === 'not_member') {
          return denied(context, email, 'sso_not_in_group', 'Your Microsoft account is not in the group allowed to use the portal.');
        }
        if (status === 'unknown') {
          logger.warn('Microsoft ID token has no groups claim — add it in Entra (Token configuration → groups claim)');
          return denied(context, email, 'sso_no_groups_claim',
            'Group membership could not be confirmed. Ask your administrator to check the Microsoft sign-in setup.');
        }
      }

      let user = await authRepository.findForLogin(email);
      if (user?.deleted_at) user = null;

      if (!user) {
        const s = await settings();
        if (!s?.sso_auto_create || !s.sso_default_role_id) {
          return denied(context, email, 'sso_no_portal_user',
            `There's no portal account for ${email}. Ask an administrator to add you.`);
        }
        user = await authRepository.createSsoUser({
          name: String(claims.name || email.split('@')[0]).slice(0, 191),
          email,
          password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), config.BCRYPT_ROUNDS),
          role_id: s.sso_default_role_id,
        });
        await auditService.record({
          action: auditService.Action.CREATE, entity: 'User', entityId: user.id,
          actor: { ...context, id: user.id, email },
          changes: { via: 'microsoft_sso', role_id: s.sso_default_role_id },
        });
      }

      if (user.status === 'INACTIVE') {
        return denied(context, email, 'account_inactive', 'Your portal account is inactive. Contact an administrator.');
      }

      const token = await issueSession(user, context, 'microsoft');
      return `${frontend()}/login/sso#token=${encodeURIComponent(token)}`;
    },
  };
}

module.exports = { createSsoService };
