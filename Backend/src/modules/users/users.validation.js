const { z } = require('zod');

const { schemas } = require('../../core');
const { validatePassword } = require('../../lib/passwordPolicy');

/**
 * Request schemas for the users module — the module's input contract.
 *
 * Having these in one file makes the accepted shape of every endpoint readable
 * without tracing through controller code, and guarantees the controller and
 * service receive values already coerced to the right types.
 *
 * Unknown keys are stripped by default, so a caller cannot set `is_system`,
 * `is_verified`, or any other column simply by including it in the payload.
 */

/**
 * Password field, delegating to the shared policy so the rules stay identical
 * across user creation, self-service change, and reset-by-token.
 *
 * `superRefine` is used rather than a chain of `.min()`/`.regex()` calls so the
 * policy has exactly one definition; changing it in `passwordPolicy.js` changes
 * it everywhere at once.
 */
const password = z.string().superRefine((value, ctx) => {
  const result = validatePassword(value);
  if (!result.valid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
  }
});

/** `GET /users` — pagination, search, sorting. */
const listUsersQuery = schemas.listQuery.extend({
  status:  schemas.userStatus.optional(),
  role_id: z.coerce.number().int().positive().optional(),
});

/** `GET|PUT|DELETE /users/:id` */
const userIdParam = schemas.idParam;

/**
 * Optional department id. A blank select value ("") is treated as "no
 * department" and omitted rather than coerced to 0.
 */
const createDepartmentId = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().positive().optional()
);

/** Optional free-text designation. */
const designation = z.string().trim().max(120).optional().transform((v) => (v === '' ? undefined : v));

/** `POST /users` */
const createUserBody = z.object({
  name:    schemas.name,
  email:   schemas.email,
  phone:   schemas.phone,
  password,
  role_id: z.coerce.number().int().positive('role_id must be a positive integer'),
  status:  schemas.userStatus.optional(),
  department_id: createDepartmentId,
  designation,
});

/**
 * `PUT /users/:id`
 *
 * Every field is optional — this is a partial update. `.strict()` is not used
 * because the frontend sends a full form payload including keys the API does
 * not accept; stripping them silently is the intended behaviour.
 */
const updateUserBody = z.object({
  name:        schemas.name.optional(),
  email:       schemas.email.optional(),
  phone:       schemas.phone.optional(),
  password:    password.optional(),
  role_id:     z.coerce.number().int().positive().optional(),
  status:      schemas.userStatus.optional(),
  is_verified: schemas.flexibleBoolean.optional(),
  // On update a blank value clears the assignment (null), rather than being
  // ignored, so a user can be removed from a department through the edit form.
  department_id: z.preprocess(
    (v) => (v === '' || v === null ? null : v),
    z.coerce.number().int().positive().nullable().optional()
  ),
  designation: z.preprocess(
    (v) => (v === '' || v === null ? null : v),
    z.string().trim().max(120).nullable().optional()
  ),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

module.exports = {
  listUsersQuery,
  userIdParam,
  createUserBody,
  updateUserBody,
};
