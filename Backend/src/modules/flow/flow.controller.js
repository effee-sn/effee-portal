const { flowService } = require('./flow.service');
const { parseListQuery, ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/**
 * Flow (workflow) HTTP controller.
 *
 * New module — uses the `ApiResponse` envelope throughout.
 */

/**
 * `GET /flow/workflows` — paginated list of workflows.
 *
 * @type {import('express').RequestHandler}
 */
const getWorkflows = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...flowService.SORTABLE_FIELDS],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    filterable: {
      module: (v) => (typeof v === 'string' && v ? v : undefined),
    },
  });

  const { items, total } = await flowService.list(query);
  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
};

/**
 * `GET /flow/workflows/:id`
 *
 * @type {import('express').RequestHandler}
 */
const getWorkflowById = async (req, res) => {
  ApiResponse.ok(res, await flowService.getById(req.params.id));
};

/**
 * `POST /flow/workflows`
 *
 * @type {import('express').RequestHandler}
 */
const createWorkflow = async (req, res) => {
  const workflow = await flowService.create(req.body, requestContext(req));
  ApiResponse.created(res, workflow);
};

/**
 * `PUT /flow/workflows/:id` — replaces the workflow's definition.
 *
 * @type {import('express').RequestHandler}
 */
const updateWorkflow = async (req, res) => {
  const workflow = await flowService.update(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, workflow);
};

/**
 * `DELETE /flow/workflows/:id`
 *
 * @type {import('express').RequestHandler}
 */
const deleteWorkflow = async (req, res) => {
  await flowService.remove(req.params.id, requestContext(req));
  ApiResponse.message(res, 'Workflow deleted successfully');
};

module.exports = { getWorkflows, getWorkflowById, createWorkflow, updateWorkflow, deleteWorkflow };
