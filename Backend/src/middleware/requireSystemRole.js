const { UnauthenticatedError, ForbiddenError } = require('../core');

/**
 * Restricts a route to roles flagged `is_system` (Super Admin).
 *
 * Use this for platform-level configuration that is not expressible as a
 * per-module permission — SMTP credentials, rate-limit thresholds, branding.
 * For anything that maps onto the Module/Permission model, prefer
 * `authorize('SOME_CODE')` so access stays manageable from the Roles screen.
 *
 * Reads `req.user.is_system`, which `authenticate` has already resolved from the
 * database, so this adds no additional query.
 *
 * Must be mounted after `authenticate`.
 *
 * @type {import('express').RequestHandler}
 */
module.exports = (req, res, next) => {
  if (!req.user) {
    return next(new UnauthenticatedError('Unauthorized'));
  }

  if (!req.user.is_system) {
    return next(new ForbiddenError('Forbidden — system administrator access required'));
  }

  return next();
};
