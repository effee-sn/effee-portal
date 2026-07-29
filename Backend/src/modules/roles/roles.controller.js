const { rolesService } = require('./roles.service');
const { parseListQuery } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/**
 * Roles HTTP controller.
 *
 * ── Response shapes are unchanged ────────────────────────────────────────────
 * `GET /roles` returns a bare array because the Roles screen assigns the
 * response straight to state (`apiGet('/roles').then(setRoles)`), and `POST`
 * returns the bare created role for the same reason. Neither uses the
 * `ApiResponse` envelope, deliberately.
 */

/**
 * `GET /roles`
 *
 * Returns a bare array rather than a paginated envelope, matching the existing
 * contract. Pagination parameters are still honoured for callers that pass
 * them; role counts are small enough that the default returns everything.
 *
 * @type {import('express').RequestHandler}
 */
const getRoles = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...rolesService.SORTABLE_FIELDS],
    defaultSort: 'created_at',
    defaultOrder: 'asc',
  });

  // `take` is left unset unless explicitly requested, so the default response
  // stays the complete list the UI expects.
  const { items } = await rolesService.list({
    orderBy: query.orderBy,
    ...(req.query.page || req.query.limit ? { skip: query.skip, take: query.take } : {}),
  });

  res.json(items);
};

/**
 * `GET /roles/:id`
 *
 * @type {import('express').RequestHandler}
 */
const getRoleById = async (req, res) => {
  const role = await rolesService.getById(req.params.id);
  res.json(role);
};

/**
 * `POST /roles`
 *
 * @type {import('express').RequestHandler}
 */
const createRole = async (req, res) => {
  const role = await rolesService.create(req.body, requestContext(req));
  res.status(201).json(role);
};

/**
 * `PATCH /roles/:id` — updates descriptive fields.
 *
 * @type {import('express').RequestHandler}
 */
const updateRole = async (req, res) => {
  const role = await rolesService.update(req.params.id, req.body, requestContext(req));
  res.json(role);
};

/**
 * `PUT /roles/:id` and `PUT /roles/:id/permissions` — replaces the grants.
 *
 * Returns the updated role rather than the previous bare
 * `{ message: 'Permissions updated successfully' }`. The Roles screen awaits
 * this call without reading its result, so returning the resource is additive:
 * it follows the convention that a PUT responds with the updated entity, and
 * saves the client a follow-up fetch.
 *
 * @type {import('express').RequestHandler}
 */
const setRolePermissions = async (req, res) => {
  const role = await rolesService.setPermissions(
    req.params.id, req.body.permissions, requestContext(req)
  );
  res.json(role);
};

/**
 * `DELETE /roles/:id`
 *
 * @type {import('express').RequestHandler}
 */
const deleteRole = async (req, res) => {
  await rolesService.remove(req.params.id, requestContext(req));
  res.json({ message: 'Role deleted successfully' });
};

module.exports = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  setRolePermissions,
  deleteRole,
};
