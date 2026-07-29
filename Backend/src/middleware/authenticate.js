const jwt = require('jsonwebtoken');

const prisma = require('../lib/prisma');
const config = require('../config/env');
const { UnauthenticatedError, ForbiddenError, ErrorCode, asyncHandler } = require('../core');

/**
 * Verifies the bearer token and loads the caller onto `req.user`.
 *
 * The user is re-read from the database on every request rather than trusted
 * from the token's claims. That costs one query, and it is what makes
 * deactivation and permission changes take effect immediately — a token issued
 * before a user was disabled would otherwise keep working until it expired,
 * which on a 7-day lifetime is a week of unauthorised access.
 *
 * Populates `req.user` with the resolved permission set, which `authorize`
 * then reads without querying again.
 *
 * @type {import('express').RequestHandler}
 */
module.exports = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  // Require the Bearer scheme explicitly rather than accepting any second
  // token, so a malformed header fails closed instead of being half-parsed.
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthenticatedError('Unauthorized');
  }

  let decoded;
  try {
    // The accepted algorithm is pinned. Without this, jsonwebtoken honours the
    // algorithm named in the token's own header, which is attacker-controlled.
    decoded = jwt.verify(token, config.JWT.SECRET, { algorithms: [config.JWT.ALGORITHM] });
  } catch {
    throw new UnauthenticatedError('Invalid or expired token', ErrorCode.INVALID_TOKEN);
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      department_id: true,
      role: {
        select: {
          id: true,
          slug: true,
          is_system: true,
          rolePermissions: {
            where: { allowed: true },
            select: { permission: { select: { code: true } } },
          },
        },
      },
    },
  });

  // A token referencing a deleted user is not a server fault — it is simply no
  // longer valid, so it is reported as an authentication failure.
  if (!user) {
    throw new UnauthenticatedError('Invalid or expired token', ErrorCode.INVALID_TOKEN);
  }

  if (user.status === 'INACTIVE') {
    throw new ForbiddenError('Account is inactive', ErrorCode.ACCOUNT_INACTIVE);
  }

  req.user = {
    id:          user.id,
    name:        user.name,
    email:       user.email,
    department_id: user.department_id,
    role:        user.role.slug,
    role_id:     user.role.id,
    is_system:   user.role.is_system,
    permissions: user.role.rolePermissions.map((rp) => rp.permission.code),
  };

  next();
});
