const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

const config = require('../../config/env');
const { authRepository } = require('./auth.repository');
const { serviceRepository } = require('../service/service.repository');
const { auditService } = require('../audit/audit.service');
const { createSsoService } = require('./sso.service');
const { validatePassword } = require('../../lib/passwordPolicy');
const { sendMailCritical, isSmtpConfigured } = require('../../lib/mailer');
const { forgotPassword: forgotPasswordTemplate, invite: inviteTemplate } = require('../../lib/emailTemplates');
const {
  UnauthenticatedError, ForbiddenError, NotFoundError,
  ConflictError, ValidationError, ErrorCode, logger,
} = require('../../core');

/**
 * Authentication business logic.
 *
 * Several behaviours here exist specifically to avoid leaking whether an
 * account exists. An unauthenticated endpoint that responds differently for a
 * known and an unknown email is an account-enumeration oracle, and the fix has
 * to be uniform across status code, message body, *and* response time.
 *
 * @param {ReturnType<typeof import('./auth.repository').createAuthRepository>} repository
 * @param {{ passwordLoginAllowed?: (user: object) => Promise<boolean> }} [policy]
 *   Whether a user may sign in with a password (Microsoft SSO can switch it
 *   off for everyone but the Super Admin). Allowed when not supplied.
 */
function createAuthService(repository, policy = {}) {
  const passwordLoginAllowed = policy.passwordLoginAllowed || (async () => true);

  /**
   * A bcrypt hash of a throwaway value, used to keep the failed-login path's
   * timing comparable to the success path.
   *
   * Without it, an unknown email returns immediately while a known email pays
   * for a bcrypt comparison. That measurable difference defeats the generic
   * "Invalid credentials" message this code otherwise takes care to return.
   */
  const TIMING_SAFE_DUMMY_HASH = bcrypt.hashSync(
    'timing-equalisation-placeholder',
    config.BCRYPT_ROUNDS
  );

  /** How long a reset link remains redeemable. */
  const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

  /** How long a new user's "set your password" link remains redeemable. */
  const INVITE_TTL_HOURS = 48;

  /**
   * Returned by `requestPasswordReset` in every outcome.
   *
   * Held as a constant because uniformity is the security property: the
   * original implementation returned three different messages depending on
   * whether the account existed and whether SMTP was configured, which let an
   * unauthenticated caller enumerate registered addresses. Operational problems
   * go to the log, where an administrator sees them, not to the caller.
   */
  const RESET_RESPONSE = 'If that email exists, a reset link has been sent.';

  /**
   * Applies the shared password policy.
   *
   * @param {string} password
   * @throws {ValidationError}
   */
  function assertPasswordPolicy(password) {
    const result = validatePassword(password);
    if (!result.valid) {
      throw new ValidationError('Validation failed', [
        { field: 'new_password', message: result.message },
      ]);
    }
  }

  const service = {
    /**
     * Verifies credentials and issues a token.
     *
     * @param {{ email: string, password: string }} credentials
     * @returns {Promise<{ token: string, user: object }>}
     * @throws {UnauthenticatedError|ForbiddenError}
     */
    async login({ email, password }, context) {
      const user = await repository.findForLogin(email);

      // Always run a comparison, even with no user, so both paths cost the same.
      const matches = await bcrypt.compare(password, user?.password ?? TIMING_SAFE_DUMMY_HASH);

      if (!user || !matches) {
        // Recorded with the submitted address so repeated failures against one
        // account, or one source IP sweeping many accounts, are both visible in
        // the trail. This is the signal a brute-force attempt actually leaves.
        await auditService.record({
          action: auditService.Action.LOGIN_FAILED,
          entity: 'User',
          entityId: user?.id,
          actor: { ...context, id: user?.id ?? null, email },
          changes: { reason: user ? 'bad_password' : 'unknown_email' },
        });

        throw new UnauthenticatedError('Invalid credentials', ErrorCode.INVALID_CREDENTIALS);
      }

      // Checked only after the password verifies, so account status is not
      // disclosed to someone who does not hold the credentials.
      if (user.status === 'INACTIVE') {
        await auditService.record({
          action: auditService.Action.LOGIN_FAILED,
          entity: 'User',
          entityId: user.id,
          actor: { ...context, id: user.id, email: user.email },
          changes: { reason: 'account_inactive' },
        });

        throw new ForbiddenError('Account is inactive', ErrorCode.ACCOUNT_INACTIVE);
      }

      // With Microsoft sign-in on and password sign-in switched off, only the
      // Super Admin may use a password (emergency access). Checked after the
      // password verifies, like the status check above.
      if (!(await passwordLoginAllowed(user))) {
        await auditService.record({
          action: auditService.Action.LOGIN_FAILED,
          entity: 'User',
          entityId: user.id,
          actor: { ...context, id: user.id, email: user.email },
          changes: { reason: 'password_login_disabled' },
        });
        throw new ForbiddenError('Password sign-in is turned off — use “Sign in with Microsoft”.', ErrorCode.SSO_REQUIRED);
      }

      const token = await service.issueSession(user, context, 'password');
      const { password: _discarded, ...safeUser } = user;
      return { token, user: safeUser };
    },

    /**
     * Issues a session token for an authenticated user and records the login.
     * Shared by password and Microsoft sign-in.
     * @param {{ id: number, email: string, role: { slug: string } }} user
     * @param {object} context request context (ip, user agent, …)
     * @param {'password'|'microsoft'} method
     * @returns {Promise<string>}
     */
    async issueSession(user, context, method) {
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role.slug },
        config.JWT.SECRET,
        { expiresIn: config.JWT.EXPIRES_IN, algorithm: config.JWT.ALGORITHM }
      );

      await auditService.record({
        action: auditService.Action.LOGIN,
        entity: 'User',
        entityId: user.id,
        actor: { ...context, id: user.id, email: user.email },
        ...(method === 'microsoft' ? { changes: { method } } : {}),
      });
      return token;
    },

    /**
     * The caller's identity and flattened permission codes.
     *
     * `service_access` says whether to show the Service app: any service
     * permission, or service work assigned to them (a ticket in "My Tickets",
     * a department task) — someone the flow involves needs no permission.
     *
     * @param {number} userId
     * @returns {Promise<object>}
     * @throws {NotFoundError}
     */
    async getMe(userId) {
      const user = await repository.findWithPermissions(userId);
      if (!user) throw new NotFoundError('User');

      const permissions = user.role.rolePermissions.map((rp) => rp.permission.code);
      const service_access = user.role.is_system
        || permissions.some((code) => code.startsWith('SERVICE_'))
        || await serviceRepository.hasServiceWork({ id: user.id, department_id: user.department_id, role_id: user.role.id });

      return {
        ...user,
        is_system: user.role.is_system,
        permissions,
        service_access,
      };
    },

    /**
     * Saves the caller's own display preferences: the theme, and which
     * release's "What's new" they have seen. Anyone may set their own; not
     * audited — it changes no business data.
     * @param {number} userId
     * @param {{ theme?: 'LIGHT'|'DARK'|'SYSTEM', seen_version?: string }} dto
     */
    async setPreferences(userId, dto) {
      const data = {};
      if (dto.theme !== undefined) data.theme = dto.theme;
      if (dto.seen_version !== undefined) data.last_seen_version = dto.seen_version;
      return repository.setPreferences(userId, data);
    },

    /**
     * The caller's profile with permissions grouped by module for display.
     *
     * @param {number} userId
     * @returns {Promise<object>}
     * @throws {NotFoundError}
     */
    async getProfile(userId) {
      const user = await repository.findProfile(userId);
      if (!user) throw new NotFoundError('User');

      /** @type {Record<string, string[]>} */
      const permsByModule = {};

      if (user.role.is_system) {
        permsByModule._system = ['Full access — all permissions granted'];
      } else {
        for (const { permission } of user.role.rolePermissions) {
          const moduleName = permission.module.name;
          if (!permsByModule[moduleName]) permsByModule[moduleName] = [];
          permsByModule[moduleName].push(permission.action);
        }
      }

      return { ...user, permsByModule };
    },

    /**
     * Updates the caller's own profile. Name, email and phone are identity
     * fields managed centrally: only a super admin (is_system) may change them,
     * whether on their own profile or anyone else's (via the users module).
     * Everyone else changes their password only.
     *
     * @param {number} userId
     * @param {{ name?: string, email?: string, phone?: string }} dto
     * @param {{ is_system?: boolean }} actor  The authenticated caller.
     * @returns {Promise<object>}
     * @throws {ForbiddenError|ConflictError}
     */
    async updateProfile(userId, dto, actor) {
      const touchesIdentity = dto.name !== undefined || dto.email !== undefined || dto.phone !== undefined;
      if (touchesIdentity && !actor?.is_system) {
        throw new ForbiddenError('Only a super admin can change name, email or phone');
      }

      if (dto.email !== undefined || dto.phone !== undefined) {
        const conflict = await repository.findConflicting({
          email: dto.email, phone: dto.phone, excludeId: userId,
        });

        if (conflict) {
          const field = conflict.email === dto.email ? 'Email' : 'Phone';
          throw new ConflictError(`${field} already in use`);
        }
      }

      return repository.updateProfile(userId, dto);
    },

    /**
     * Changes the caller's password, given their current one.
     *
     * @param {number} userId
     * @param {{ current_password: string, new_password: string }} dto
     * @returns {Promise<void>}
     * @throws {ValidationError}
     */
    async changePassword(userId, { current_password, new_password }, context) {
      assertPasswordPolicy(new_password);

      const user = await repository.findCredentials(userId);
      if (!user) throw new NotFoundError('User');

      const matches = await bcrypt.compare(current_password, user.password);
      if (!matches) {
        throw new ValidationError('Validation failed', [
          { field: 'current_password', message: 'Current password is incorrect' },
        ]);
      }

      if (current_password === new_password) {
        throw new ValidationError('Validation failed', [
          { field: 'new_password', message: 'New password must be different from the current one' },
        ]);
      }

      const hash = await bcrypt.hash(new_password, config.BCRYPT_ROUNDS);
      await repository.setPassword(userId, hash);

      await auditService.record({
        action: auditService.Action.PASSWORD_CHANGED,
        entity: 'User',
        entityId: userId,
        actor: context,
        changes: { self_service: true },
      });
    },

    /**
     * Issues a password-reset link.
     *
     * Always resolves to the same message regardless of whether the account
     * exists or mail delivery succeeded.
     *
     * @param {string} email
     * @returns {Promise<{ message: string }>}
     */
    async requestPasswordReset(email) {
      const user = await repository.findByEmail(email);

      // Unknown address: respond exactly as for a known one, do no further work.
      if (!user) return { message: RESET_RESPONSE };
      // Password sign-in switched off for this user (Microsoft SSO): a reset
      // link would be useless, so send none — but answer the same way.
      if (!(await passwordLoginAllowed(await repository.findForLogin(user.email)))) {
        return { message: RESET_RESPONSE };
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await repository.issueResetToken({ userId: user.id, token, expiresAt });

      const resetUrl = `${config.ALLOWED_ORIGINS[0]}/reset-password?token=${token}`;

      if (!(await isSmtpConfigured())) {
        logger.warn('SMTP not configured — password reset link could not be delivered');
        if (!config.IS_PRODUCTION) logger.warn({ resetUrl }, 'Development reset URL');
        return { message: RESET_RESPONSE };
      }

      const mail = await forgotPasswordTemplate({
        to: user.email, userName: user.name, resetUrl,
      });
      const result = await sendMailCritical(mail);

      if (result?.skipped || result?.sent === false) {
        logger.warn({ reason: result.reason }, 'Password reset email delivery failed');
        if (!config.IS_PRODUCTION) logger.warn({ resetUrl }, 'Development reset URL');
      }

      return { message: RESET_RESPONSE };
    },

    /**
     * Redeems a reset token and sets a new password.
     *
     * The failure message is identical for an unknown, used, and expired token
     * so the endpoint cannot be used to probe which tokens exist.
     *
     * @param {{ token: string, new_password: string }} dto
     * @returns {Promise<void>}
     * @throws {ValidationError}
     */
    /**
     * Emails a new (or re-invited) user a one-time "set your password" link —
     * the same token mechanism as password reset, valid for 48 hours. Any
     * earlier unused link for the user stops working. Never throws.
     *
     * @param {{ id: number, name: string, email: string, role?: { name?: string } }} user
     * @param {object} [actor] the administrator, for the audit trail
     * @returns {Promise<{ sent: boolean, reason?: string }>}
     */
    async sendInvite(user, actor) {
      try {
        if (!(await isSmtpConfigured())) {
          return { sent: false, reason: 'Email (SMTP) is not configured on the server' };
        }
        const token = crypto.randomBytes(32).toString('hex');
        await repository.issueResetToken({
          userId: user.id, token, expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000),
        });
        const origin = config.ALLOWED_ORIGINS[0];
        const mail = await inviteTemplate({
          to: user.email,
          userName: user.name,
          email: user.email,
          role: user.role?.name,
          setUrl: `${origin}/reset-password?token=${token}&invite=1`,
          loginUrl: `${origin}/login`,
          expiresHours: INVITE_TTL_HOURS,
        });
        const result = await sendMailCritical(mail);
        const sent = Boolean(result?.sent);
        await auditService.record({
          action: 'INVITE_SENT',
          entity: 'User',
          entityId: user.id,
          actor,
          changes: { to: user.email, sent, ...(sent ? {} : { reason: result?.reason }) },
        });
        if (sent) logger.info({ to: user.email }, 'Invite email sent');
        else logger.warn({ to: user.email, reason: result?.reason }, 'Invite email not sent');
        return sent ? { sent: true } : { sent: false, reason: result?.reason || 'Email could not be sent' };
      } catch (err) {
        logger.error({ err, userId: user?.id }, 'Failed to send invite');
        return { sent: false, reason: err.message };
      }
    },

    /**
     * Whether a reset / invite link can still be used — so the page can say
     * "already used" or "expired" before the person types a new password.
     * Reveals nothing about the account.
     * @param {string} token
     * @returns {Promise<{ valid: boolean, reason?: 'used'|'expired'|'invalid' }>}
     */
    async checkResetToken(token) {
      const record = token ? await repository.findResetToken(token) : null;
      if (!record) return { valid: false, reason: 'invalid' };
      if (record.used) return { valid: false, reason: 'used' };
      if (Date.now() > record.expires_at.getTime()) return { valid: false, reason: 'expired' };
      return { valid: true };
    },

    async resetPassword({ token, new_password }, context) {
      assertPasswordPolicy(new_password);

      const record = await repository.findResetToken(token);

      if (!record || record.used || Date.now() > record.expires_at.getTime()) {
        throw new ValidationError(
          'Reset link is invalid or has expired. Please request a new one.'
        );
      }

      const hash = await bcrypt.hash(new_password, config.BCRYPT_ROUNDS);
      const redeemed = await repository.redeemResetToken({ token, userId: record.user_id, passwordHash: hash });
      if (!redeemed) {
        throw new ValidationError('This link has already been used. Please request a new one.');
      }

      await auditService.record({
        action: auditService.Action.PASSWORD_RESET,
        entity: 'User',
        entityId: record.user_id,
        actor: { ...context, id: record.user_id },
        changes: { via: 'reset_token' },
      });
    },
  };
  return service;
}

// The two services reference each other (SSO issues sessions; password login
// asks SSO whether passwords are allowed), so they are bound late.
let ssoService = null;
const authService = createAuthService(authRepository, {
  passwordLoginAllowed: (user) => ssoService.passwordLoginAllowed(user),
});
ssoService = createSsoService({ issueSession: (user, context, method) => authService.issueSession(user, context, method) });

module.exports = { authService, createAuthService, ssoService };
