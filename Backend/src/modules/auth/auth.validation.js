const { z } = require('zod');
const { schemas } = require('../../core');

/**
 * Request schemas for the auth module.
 *
 * Note what is deliberately *not* validated: the `password` field on login is
 * checked only for presence, never against the password policy. Applying policy
 * rules at login would reject a legitimate credential set before the current
 * policy existed, locking out every user whose password predates a tightening.
 * Policy belongs at the point a password is *set*.
 */

/** `POST /auth/login` */
const loginBody = z.object({
  email:    schemas.email,
  password: z.string().min(1, 'Password is required').max(200),
});

/** `PUT /auth/profile` */
const updateProfileBody = z.object({
  name:  schemas.name.optional(),
  email: schemas.email.optional(),
  phone: schemas.phone.optional(),
}).refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  { message: 'At least one field must be provided' }
);

/**
 * `PUT /auth/change-password`
 *
 * The new password is only checked for presence and length here; the shared
 * policy is applied in the service so that its rules have exactly one
 * definition across create, change, and reset.
 */
const changePasswordBody = z.object({
  current_password: z.string().min(1, 'Current password is required').max(200),
  new_password:     z.string().min(1, 'New password is required').max(200),
});

/** `POST /auth/forgot-password` */
const forgotPasswordBody = z.object({
  email: schemas.email,
});

/** `POST /auth/reset-password` */
const resetPasswordBody = z.object({
  // 32 random bytes rendered as hex by the service.
  token:        z.string().trim().min(1, 'Token is required').max(200),
  new_password: z.string().min(1, 'New password is required').max(200),
});

module.exports = {
  loginBody,
  updateProfileBody,
  changePasswordBody,
  forgotPasswordBody,
  resetPasswordBody,
};
