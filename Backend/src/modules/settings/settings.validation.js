const { z } = require('zod');
const { schemas } = require('../../core');

/**
 * Request schemas for the settings module.
 *
 * Bounded numeric ranges here are the fix for a real bug class: the previous
 * hand-rolled checks compared raw body values directly, so a string such as
 * `"abc"` passed both `< 1` and `> 100` as false, cleared validation, and
 * reached the database as `NaN`. Coercing and constraining at the boundary
 * makes that unrepresentable.
 */

/** Optional text field that normalises empty strings to undefined. */
const optionalText = (max) => z.string().trim().max(max).optional()
  .transform((value) => (value === '' ? undefined : value));

/** `PUT /settings/company` */
const updateCompanyBody = z.object({
  company_name:    z.string().trim().min(1).max(120).optional(),
  company_address: optionalText(500),
  company_phone:   optionalText(30),
  company_email:   z.union([schemas.email, z.literal('')]).optional()
                     .transform((value) => (value === '' ? undefined : value)),
  company_website: z.union([z.string().trim().url('Must be a valid URL').max(200), z.literal('')])
                     .optional().transform((value) => (value === '' ? undefined : value)),
  company_gstin:   optionalText(20),
});

/** `PUT /settings/email` */
const updateEmailBody = z.object({
  smtp_host:       optionalText(200),
  smtp_port:       z.coerce.number().int()
                     .min(1, 'SMTP port must be between 1 and 65535')
                     .max(65535, 'SMTP port must be between 1 and 65535')
                     .optional(),
  smtp_user:       optionalText(200),
  smtp_pass:       z.string().max(200).optional(),
  smtp_from_name:  optionalText(120),
  smtp_from_email: z.union([schemas.email, z.literal('')]).optional()
                     .transform((value) => (value === '' ? undefined : value)),
  email_notifications: schemas.flexibleBoolean.optional(),
});

/** `PUT /settings/security` */
const updateSecurityBody = z.object({
  login_max_attempts:   z.coerce.number().int()
                          .min(1, 'Max attempts must be between 1 and 100')
                          .max(100, 'Max attempts must be between 1 and 100')
                          .optional(),
  login_window_minutes: z.coerce.number().int()
                          .min(1, 'Window must be between 1 and 1440 minutes')
                          .max(1440, 'Window must be between 1 and 1440 minutes')
                          .optional(),
  max_upload_mb:        z.coerce.number().int()
                          .min(1, 'Upload size must be between 1 and 50 MB')
                          .max(50, 'Upload size must be between 1 and 50 MB')
                          .optional(),
});

/** `POST /settings/test-email` */
const testEmailBody = z.object({
  test_to: schemas.email,
});

module.exports = {
  updateCompanyBody,
  updateEmailBody,
  updateSecurityBody,
  testEmailBody,
};
