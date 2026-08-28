const { contactService } = require('./contact.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Customer contact HTTP controller. */

/** `GET /sales/customers/:customerId/contacts` */
const listContacts = async (req, res) => {
  ApiResponse.ok(res, await contactService.listForCustomer(req.params.customerId));
};

/** `POST /sales/customers/:customerId/contacts` */
const createContact = async (req, res) => {
  const contact = await contactService.create(req.params.customerId, req.body, requestContext(req));
  ApiResponse.created(res, contact);
};

/** `PUT /sales/contacts/:id` */
const updateContact = async (req, res) => {
  const contact = await contactService.update(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, contact);
};

/** `DELETE /sales/contacts/:id` */
const deleteContact = async (req, res) => {
  await contactService.remove(req.params.id, requestContext(req));
  ApiResponse.message(res, 'Contact deleted successfully');
};

module.exports = {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
};
