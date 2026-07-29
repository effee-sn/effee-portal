const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const { asyncHandler, validate } = require('../../core');
const {
  loginRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
} = require('../../middleware/rateLimiter');
const {
  loginBody, updateProfileBody, changePasswordBody,
  forgotPasswordBody, resetPasswordBody,
} = require('./auth.validation');
const {
  login, getMe, getProfile, updateProfile,
  changePassword, forgotPassword, resetPassword,
} = require('./auth.controller');

const router = Router();

/**
 * ── Public endpoints ─────────────────────────────────────────────────────────
 * Every unauthenticated route is rate limited without exception. Each is
 * reachable by anyone on the internet, and each either sends mail or tests a
 * credential — an unbounded request rate on any of them is directly abusable.
 *
 * The limiter runs before validation so a flood of malformed requests is
 * rejected as cheaply as possible.
 */
router.post(
  '/login',
  loginRateLimiter,
  validate({ body: loginBody }),
  asyncHandler(login)
);

router.post(
  '/forgot-password',
  forgotPasswordRateLimiter,
  validate({ body: forgotPasswordBody }),
  asyncHandler(forgotPassword)
);

router.post(
  '/reset-password',
  resetPasswordRateLimiter,
  validate({ body: resetPasswordBody }),
  asyncHandler(resetPassword)
);

// ── Authenticated endpoints ──────────────────────────────────────────────────

router.get('/me',      authenticate, asyncHandler(getMe));
router.get('/profile', authenticate, asyncHandler(getProfile));

router.put(
  '/profile',
  authenticate,
  validate({ body: updateProfileBody }),
  asyncHandler(updateProfile)
);

router.put(
  '/change-password',
  authenticate,
  validate({ body: changePasswordBody }),
  asyncHandler(changePassword)
);

module.exports = router;
