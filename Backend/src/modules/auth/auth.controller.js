const { authService } = require('./auth.service');
const { resetLoginAttempts } = require('../../middleware/rateLimiter');
const { requestContext } = require('../../core/http/requestContext');

/**
 * Auth HTTP controller.
 *
 * Response shapes are unchanged — `{ message, token, user }` from login, the
 * bare profile object from `/me` and `/profile`, and `{ message }` from the
 * password flows. The frontend reads `data.token` and `data.user` directly
 * (Frontend/app/(auth)/login/page.js), so no envelope is applied.
 */

/**
 * `POST /auth/login`
 *
 * @type {import('express').RequestHandler}
 */
const login = async (req, res) => {
  const { token, user } = await authService.login(req.body, requestContext(req));

  // Clears the caller's failed-attempt budget now that they have proven the
  // credential. Lives in the controller because it is keyed on the request IP,
  // which is transport state the service has no business knowing about.
  resetLoginAttempts(req.ip || 'unknown');

  res.status(200).json({ message: 'Login successful', token, user });
};

/**
 * `GET /auth/me`
 *
 * @type {import('express').RequestHandler}
 */
const getMe = async (req, res) => {
  res.json(await authService.getMe(req.user.id));
};

/**
 * `GET /auth/profile`
 *
 * @type {import('express').RequestHandler}
 */
const getProfile = async (req, res) => {
  res.json(await authService.getProfile(req.user.id));
};

/**
 * `PUT /auth/profile`
 *
 * @type {import('express').RequestHandler}
 */
const updateProfile = async (req, res) => {
  res.json(await authService.updateProfile(req.user.id, req.body, req.user));
};

/**
 * `PUT /auth/change-password`
 *
 * @type {import('express').RequestHandler}
 */
const changePassword = async (req, res) => {
  await authService.changePassword(req.user.id, req.body, requestContext(req));
  res.json({ message: 'Password updated successfully' });
};

/**
 * `POST /auth/forgot-password`
 *
 * @type {import('express').RequestHandler}
 */
const forgotPassword = async (req, res) => {
  res.json(await authService.requestPasswordReset(req.body.email));
};

/**
 * `POST /auth/reset-password`
 *
 * @type {import('express').RequestHandler}
 */
const resetPassword = async (req, res) => {
  await authService.resetPassword(req.body, requestContext(req));
  res.json({ message: 'Password reset successfully. You can now log in.' });
};

module.exports = {
  login,
  getMe,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
};
