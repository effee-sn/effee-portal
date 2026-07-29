/**
 * Extracts the actor and request metadata that services need for audit
 * logging.
 *
 * Services must not receive the Express request object — that would couple
 * business logic to the transport and make it untestable outside HTTP. This
 * flattens the few fields they legitimately need into a plain object the
 * controller passes down.
 *
 * @typedef {object} ActorContext
 * @property {number|null} id Authenticated user id, null for public endpoints.
 * @property {string|null} name
 * @property {string|null} email
 * @property {boolean} is_system
 * @property {string[]} permissions
 * @property {string|null} ip
 * @property {string|null} user_agent
 * @property {string|null} request_id Correlates with the X-Request-Id header.
 */

/**
 * Builds an actor context from a request.
 *
 * Safe to call on unauthenticated routes: identity fields come back null while
 * the network metadata is still captured, which is exactly what a failed-login
 * audit entry needs.
 *
 * @param {import('express').Request} req
 * @returns {ActorContext}
 */
function requestContext(req) {
  const userAgent = req.headers['user-agent'];

  return {
    id:          req.user?.id ?? null,
    name:        req.user?.name ?? null,
    email:       req.user?.email ?? null,
    department_id: req.user?.department_id ?? null,
    role_id:     req.user?.role_id ?? null,
    is_system:   Boolean(req.user?.is_system),
    permissions: req.user?.permissions ?? [],
    ip:          req.ip || null,
    // Bounded before storage: this is an unvalidated client-supplied header
    // and the column, while TEXT, should not carry arbitrary bulk.
    user_agent:  typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
    request_id:  req.id ? String(req.id) : null,
  };
}

module.exports = { requestContext };
