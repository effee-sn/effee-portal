const { z } = require('zod');
const { MAX_LIMIT, DEFAULT_LIMIT } = require('../http/queryOptions');

/**
 * Reusable Zod schemas for patterns that recur across modules.
 *
 * Defining these once keeps validation consistent — every `:id` route rejects
 * `abc` the same way — and means a rule change (say, moving identifiers from
 * integers to UUIDs) happens in one file rather than in every module.
 */

/**
 * A positive integer route parameter, coerced from its string form.
 * Route params always arrive as strings, hence `coerce`.
 */
const idParam = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

/** The standard list-query string, shared by every collection endpoint. */
const listQuery = z.object({
  page:   z.coerce.number().int().positive().optional().default(1),
  limit:  z.coerce.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  search: z.string().trim().max(200).optional().default(''),
  sort:   z.string().trim().max(60).optional(),
  order:  z.enum(['asc', 'desc']).optional(),
});

/**
 * Email, normalised to lowercase.
 *
 * Addresses are stored and compared case-insensitively so `User@x.com` and
 * `user@x.com` cannot become two accounts. Normalising at the boundary means
 * no downstream code has to remember to do it.
 */
const email = z.string()
  .trim()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Must be a valid email address')
  .toLowerCase();

/**
 * Phone number. Deliberately permissive on format — international numbering is
 * varied enough that strict patterns reject valid input — while still bounding
 * length and character set.
 */
const phone = z.string()
  .trim()
  .min(6, 'Phone number is too short')
  .max(20, 'Phone number is too long')
  .regex(/^[+\d][\d\s()-]*$/, 'Phone number contains invalid characters');

/** A human name or label. */
const name = z.string()
  .trim()
  .min(1, 'Name is required')
  .max(120, 'Name must be 120 characters or fewer');

/** A URL-safe slug. */
const slug = z.string()
  .trim()
  .min(1, 'Slug is required')
  .max(80, 'Slug must be 80 characters or fewer')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase words separated by hyphens');

/** Optional free-text description; empty strings normalise to undefined. */
const description = z.string()
  .trim()
  .max(500, 'Description must be 500 characters or fewer')
  .optional()
  .transform((value) => (value === '' ? undefined : value));

/** Account status, matching the Prisma `UserStatus` enum. */
const userStatus = z.enum(['ACTIVE', 'INACTIVE']);

/**
 * A boolean that tolerates the string forms an HTML form or query string
 * produces. Prevents the `"false"` -> truthy class of bug at the boundary.
 */
const flexibleBoolean = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
  z.literal('1').transform(() => true),
  z.literal('0').transform(() => false),
]);

module.exports = {
  idParam,
  listQuery,
  email,
  phone,
  name,
  slug,
  description,
  userStatus,
  flexibleBoolean,
};
