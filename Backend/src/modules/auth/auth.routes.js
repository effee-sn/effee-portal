const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const { asyncHandler, validate } = require('../../core');
const {
  createRateLimiter,
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
const { getSsoConfig, startMicrosoft, microsoftCallback } = require('./sso.controller');

// Microsoft sign-in hops: generous for real users, a ceiling for scripted abuse.
const ssoRateLimiter = createRateLimiter({ name: 'sso', max: 30, windowMs: 15 * 60 * 1000 });

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

// Microsoft sign-in (SSO). Browser navigations, not API calls: both answer
// with a redirect.
router.get('/sso/config', asyncHandler(getSsoConfig));
router.get('/sso/microsoft/start', ssoRateLimiter, asyncHandler(startMicrosoft));
router.get('/sso/microsoft/callback', ssoRateLimiter, asyncHandler(microsoftCallback));

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
