const { departmentService } = require('./department.service');
const { parseListQuery, ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/**
 * Department HTTP controller.
 *
 * New module, no legacy frontend contract — uses the `ApiResponse` envelope.
 */

/** `GET /departments` @type {import('express').RequestHandler} */
const getDepartments = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...departmentService.SORTABLE_FIELDS],
    defaultSort: 'name',
    defaultOrder: 'asc',
  });
  const { items, total } = await departmentService.list(query);
  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
};

/** `GET /departments/:id` @type {import('express').RequestHandler} */
const getDepartmentById = async (req, res) => {
  ApiResponse.ok(res, await departmentService.getById(req.params.id));
};

/** `POST /departments` @type {import('express').RequestHandler} */
const createDepartment = async (req, res) => {
  const dept = await departmentService.create(req.body, requestContext(req));
  ApiResponse.created(res, dept);
};

/** `PUT /departments/:id` @type {import('express').RequestHandler} */
const updateDepartment = async (req, res) => {
  const dept = await departmentService.update(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, dept);
};

/** `DELETE /departments/:id` @type {import('express').RequestHandler} */
const deleteDepartment = async (req, res) => {
  await departmentService.remove(req.params.id, requestContext(req));
  ApiResponse.message(res, 'Department deleted successfully');
};

module.exports = {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
