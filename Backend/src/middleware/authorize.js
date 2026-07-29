const { ForbiddenError, ErrorCode } = require('../core');

/**
 * Permission-based authorisation.
 *
 * ── Why this no longer queries the database ──────────────────────────────────
 * The previous implementation issued two queries per call: one to re-read the
 * user's role, another to look up the specific role-permission row. Both were
 * redundant — `authenticate` has already read the user and attached the full
 * resolved permission set to `req.user` in the same request. Every authorised
 * endpoint was therefore paying three round-trips where one suffices.
 *
 * Freshness is unchanged: `authenticate` reads from the database on every
 * request, so `req.user.permissions` is exactly as current as a query issued
 * here would be. A permission revoked mid-session takes effect on the user's
 * next request either way.
 *
 * Roles flagged `is_system` bypass all checks, matching the behaviour relied on
 * by the frontend (`usePermissions`) and the seeded Super Admin role.
 *
 * Must be mounted after `authenticate`.
 */

/**
 * Requires that the caller holds a permission.
 *
 * @param {...string} codes One or more permission codes. Holding **any** of
 *   them satisfies the check — the common case being an endpoint reachable
 *   through more than one legitimate role.
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.get('/', authorize('USER_VIEW'), handler);
 * router.post('/', authorize('USER_CREATE', 'USER_MANAGE'), handler);
 */
function authorize(...codes) {
  if (codes.length === 0) {
    throw new Error('authorize() requires at least one permission code');
  }

  return (req, res, next) => {
    const user = req.user;

    // Defensive: reaching here without `authenticate` is a wiring mistake, and
    // failing closed is the only safe response to it.
    if (!user) {
      return next(new ForbiddenError('Forbidden', ErrorCode.FORBIDDEN));
    }

    if (user.is_system) return next();

    const granted = Array.isArray(user.permissions) ? user.permissions : [];
    if (codes.some((code) => granted.includes(code))) return next();

    return next(new ForbiddenError(
      `Permission denied: ${codes.join(' or ')}`,
      ErrorCode.PERMISSION_DENIED
    ));
  };
}

/**
 * Requires **all** of the given permissions rather than any.
 *
 * @param {...string} codes
 * @returns {import('express').RequestHandler}
 */
function authorizeAll(...codes) {
  if (codes.length === 0) {
    throw new Error('authorizeAll() requires at least one permission code');
  }

  return (req, res, next) => {
    const user = req.user;
    if (!user) return next(new ForbiddenError('Forbidden', ErrorCode.FORBIDDEN));
    if (user.is_system) return next();

    const granted = Array.isArray(user.permissions) ? user.permissions : [];
    const missing = codes.filter((code) => !granted.includes(code));

    if (missing.length === 0) return next();

    return next(new ForbiddenError(
      `Permission denied: ${missing.join(', ')}`,
      ErrorCode.PERMISSION_DENIED
    ));
  };
}

module.exports = authorize;
module.exports.authorize = authorize;
module.exports.authorizeAll = authorizeAll;
