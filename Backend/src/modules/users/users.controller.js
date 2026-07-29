const { usersService } = require('./users.service');
const { parseListQuery } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/**
 * Users HTTP controller.
 *
 * Translates between HTTP and the service, and does nothing else — no Prisma,
 * no bcrypt, no uniqueness checks, no status-code branching. Input has already
 * been validated and coerced by the route's `validate` middleware; failures are
 * thrown by the service and shaped by the central error handler. Each function
 * reduces to: read the request, call the service, write the response.
 *
 * ── Response shapes are unchanged ────────────────────────────────────────────
 * These endpoints deliberately do NOT use the `ApiResponse` envelope. The
 * existing frontend reads `data.users`, `data.total`, and bare user objects
 * directly (Frontend/app/dashboard/users/page.js), so wrapping them would break
 * the Users screen. Migrating to the envelope is a coordinated backend and
 * frontend change, not a side effect of this refactor.
 */

/**
 * `GET /users` — paginated, searchable, sortable, filterable.
 *
 * @type {import('express').RequestHandler}
 */
const getUsers = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...usersService.SORTABLE_FIELDS],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    filterable: {
      status:  (value) => (['ACTIVE', 'INACTIVE'].includes(value) ? value : undefined),
      role_id: (value) => (Number.isInteger(Number(value)) ? Number(value) : undefined),
    },
  });

  const { items, total } = await usersService.list(query);

  res.json({
    users: items,
    total,
    page: query.page,
    limit: query.limit,
    pages: Math.ceil(total / query.limit),
  });
};

/**
 * `GET /users/:id`
 *
 * @type {import('express').RequestHandler}
 */
const getUserById = async (req, res) => {
  const user = await usersService.getById(req.params.id);
  res.json(user);
};

/**
 * `POST /users`
 *
 * @type {import('express').RequestHandler}
 */
const createUser = async (req, res) => {
  const user = await usersService.create(req.body, requestContext(req));
  res.status(201).json(user);
};

/**
 * `PUT /users/:id`
 *
 * @type {import('express').RequestHandler}
 */
const updateUser = async (req, res) => {
  const user = await usersService.update(req.params.id, req.body, requestContext(req));
  res.json(user);
};

/**
 * `DELETE /users/:id`
 *
 * @type {import('express').RequestHandler}
 */
const deleteUser = async (req, res) => {
  await usersService.remove(req.params.id, requestContext(req));
  res.json({ message: 'User deleted successfully' });
};

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser };
