const { serviceService } = require('./service.service');
const { parseListQuery, ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/**
 * Service (ticket) HTTP controller.
 *
 * This is a new module with no legacy frontend contract, so it uses the
 * `ApiResponse` envelope throughout — the standard for new surfaces.
 */

/**
 * `GET /service` — dashboard aggregates.
 *
 * @type {import('express').RequestHandler}
 */
const getDashboard = async (req, res) => {
  ApiResponse.ok(res, await serviceService.getDashboard());
};

/**
 * `GET /service/tickets` — paginated, searchable, filterable list.
 *
 * @type {import('express').RequestHandler}
 */
const getTickets = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...serviceService.SORTABLE_FIELDS],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    filterable: {
      status:            (v) => (['OPEN', 'IN_PROGRESS', 'CONTACTED', 'RESOLVED', 'ON_OBSERVATION', 'CLOSED', 'REOPENED'].includes(v) ? v : undefined),
      issue_severity:    (v) => (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(v) ? v : undefined),
      ticket_type:       (v) => (['CALL', 'EMAIL', 'OTHERS'].includes(v) ? v : undefined),
    },
  });

  const { items, total } = await serviceService.list(query);

  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
};

/**
 * `GET /service/tickets/inbox` — tickets assigned to the current user.
 *
 * Requires only authentication; assignment grants visibility. Must be routed
 * before `/:id` so "inbox" is not captured as an id.
 *
 * @type {import('express').RequestHandler}
 */
const getInbox = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...serviceService.SORTABLE_FIELDS],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    filterable: {
      status:         (v) => (['OPEN', 'IN_PROGRESS', 'CONTACTED', 'RESOLVED', 'ON_OBSERVATION', 'CLOSED', 'REOPENED'].includes(v) ? v : undefined),
      issue_severity: (v) => (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(v) ? v : undefined),
    },
  });

  const { items, total } = await serviceService.inbox(req.user, query);
  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
};

/**
 * `GET /service/tickets/:id` — record-level view access enforced in the service.
 *
 * @type {import('express').RequestHandler}
 */
const getTicketById = async (req, res) => {
  ApiResponse.ok(res, await serviceService.getForUser(req.params.id, req.user));
};

/** `POST /service/tickets/:id/confirm` — customer confirmed → observation. */
const confirmTicket = async (req, res) => {
  const ticket = await serviceService.confirm(req.params.id, requestContext(req), req.body?.observation_days);
  ApiResponse.ok(res, ticket);
};

/** `POST /service/tickets/:id/close` — close after observation. */
const closeTicket = async (req, res) => {
  ApiResponse.ok(res, await serviceService.close(req.params.id, requestContext(req)));
};

/** `POST /service/tickets/:id/reopen` — reopen → re-triage to the PM. */
const reopenTicket = async (req, res) => {
  ApiResponse.ok(res, await serviceService.reopen(req.params.id, requestContext(req), req.body.reason));
};

/**
 * `POST /service/tickets`
 *
 * @type {import('express').RequestHandler}
 */
const createTicket = async (req, res) => {
  const ticket = await serviceService.create(req.body, requestContext(req));
  ApiResponse.created(res, ticket);
};

/**
 * `PUT /service/tickets/:id`
 *
 * @type {import('express').RequestHandler}
 */
const updateTicket = async (req, res) => {
  const ticket = await serviceService.update(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, ticket);
};

/**
 * `DELETE /service/tickets/:id`
 *
 * @type {import('express').RequestHandler}
 */
const deleteTicket = async (req, res) => {
  await serviceService.remove(req.params.id, requestContext(req));
  ApiResponse.message(res, 'Ticket deleted successfully');
};

module.exports = {
  getDashboard,
  getTickets,
  getInbox,
  getTicketById,
  createTicket,
  updateTicket,
  confirmTicket,
  closeTicket,
  reopenTicket,
  deleteTicket,
};
