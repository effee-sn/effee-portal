const { customerService } = require('./customer.service');
const { parseListQuery, ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Sales customer HTTP controller. Uses the `ApiResponse` envelope. */

/** `GET /sales/customers` @type {import('express').RequestHandler} */
const getCustomers = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...customerService.SORTABLE_FIELDS],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
  });
  const { items, total } = await customerService.list(query);
  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
};

/** `GET /sales/customers/options` — id/name for dropdowns. */
const getCustomerOptions = async (req, res) => {
  ApiResponse.ok(res, await customerService.options());
};

/** `GET /sales/customers/:id` @type {import('express').RequestHandler} */
const getCustomerById = async (req, res) => {
  ApiResponse.ok(res, await customerService.getById(req.params.id));
};

/** `POST /sales/customers` @type {import('express').RequestHandler} */
const createCustomer = async (req, res) => {
  const customer = await customerService.create(req.body, requestContext(req));
  ApiResponse.created(res, customer);
};

/** `PUT /sales/customers/:id` @type {import('express').RequestHandler} */
const updateCustomer = async (req, res) => {
  const customer = await customerService.update(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, customer);
};

/** `DELETE /sales/customers/:id` @type {import('express').RequestHandler} */
const deleteCustomer = async (req, res) => {
  await customerService.remove(req.params.id, requestContext(req));
  ApiResponse.message(res, 'Customer deleted successfully');
};

module.exports = {
  getCustomers,
  getCustomerOptions,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
