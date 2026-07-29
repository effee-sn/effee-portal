const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');
const {
  listRolesQuery, roleIdParam, createRoleBody, updateRoleBody, setPermissionsBody,
} = require('./roles.validation');
const {
  getRoles, getRoleById, createRole, updateRole, setRolePermissions, deleteRole,
} = require('./roles.controller');

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('ROLE_VIEW'),
  validate({ query: listRolesQuery }),
  asyncHandler(getRoles)
);

router.get(
  '/:id',
  authorize('ROLE_VIEW'),
  validate({ params: roleIdParam }),
  asyncHandler(getRoleById)
);

router.post(
  '/',
  authorize('ROLE_CREATE'),
  validate({ body: createRoleBody }),
  asyncHandler(createRole)
);

/**
 * Permission grants.
 *
 * `PUT /:id/permissions` states the intent plainly and is the route new clients
 * should use. `PUT /:id` is kept as an alias because the Roles screen calls it
 * (Frontend/app/dashboard/roles/page.js), and changing the frontend and backend
 * in lockstep is not worth the risk for a rename.
 */
router.put(
  '/:id/permissions',
  authorize('ROLE_EDIT'),
  validate({ params: roleIdParam, body: setPermissionsBody }),
  asyncHandler(setRolePermissions)
);

router.put(
  '/:id',
  authorize('ROLE_EDIT'),
  validate({ params: roleIdParam, body: setPermissionsBody }),
  asyncHandler(setRolePermissions)
);

/** Descriptive fields only — permissions are never changed through this route. */
router.patch(
  '/:id',
  authorize('ROLE_EDIT'),
  validate({ params: roleIdParam, body: updateRoleBody }),
  asyncHandler(updateRole)
);

router.delete(
  '/:id',
  authorize('ROLE_DELETE'),
  validate({ params: roleIdParam }),
  asyncHandler(deleteRole)
);

module.exports = router;
