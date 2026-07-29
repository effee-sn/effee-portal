const { z } = require('zod');
const { schemas } = require('../../core');

/**
 * Request schemas for the roles module.
 */

/** A single permission grant as sent by the roles matrix UI. */
const permissionGrant = z.object({
  permission_id: z.coerce.number().int().positive(),
  allowed: schemas.flexibleBoolean,
});

/**
 * The grants array.
 *
 * Bounded to keep a single request from issuing an unbounded number of upserts
 * inside one transaction, which would hold locks on the authorisation table for
 * as long as it took to process.
 */
const permissionGrants = z.array(permissionGrant)
  .max(500, 'Too many permission entries in a single request');

/** `GET /roles` */
const listRolesQuery = schemas.listQuery;

/** `GET|PUT|PATCH|DELETE /roles/:id` */
const roleIdParam = schemas.idParam;

/** `POST /roles` */
const createRoleBody = z.object({
  name:        schemas.name,
  slug:        schemas.slug,
  description: schemas.description,
  permissions: permissionGrants.optional().default([]),
});

/** `PATCH /roles/:id` — descriptive fields only, never permissions. */
const updateRoleBody = z.object({
  name:        schemas.name.optional(),
  slug:        schemas.slug.optional(),
  description: schemas.description,
}).refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  { message: 'At least one field must be provided' }
);

/** `PUT /roles/:id` and `PUT /roles/:id/permissions` */
const setPermissionsBody = z.object({
  permissions: permissionGrants,
});

module.exports = {
  listRolesQuery,
  roleIdParam,
  createRoleBody,
  updateRoleBody,
  setPermissionsBody,
};
