const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');

const {
  listCustomersQuery, customerIdParam, createCustomerBody, updateCustomerBody,
} = require('./customer.validation');
const {
  getCustomers, getCustomerOptions, getCustomerById,
  createCustomer, updateCustomer, deleteCustomer,
} = require('./customer.controller');

const contactValidation = require('./contact.validation');
const {
  listContacts, createContact, updateContact, deleteContact,
} = require('./contact.controller');

const router = Router();

router.use(authenticate);

// ── Customers ────────────────────────────────────────────────────────────────
router.get(
  '/customers',
  authorize('SALES_VIEW'),
  validate({ query: listCustomersQuery }),
  asyncHandler(getCustomers)
);

// Static path before the `:id` route so "options" is not read as an id.
router.get(
  '/customers/options',
  authorize('SALES_VIEW'),
  asyncHandler(getCustomerOptions)
);

router.post(
  '/customers',
  authorize('SALES_CREATE'),
  validate({ body: createCustomerBody }),
  asyncHandler(createCustomer)
);

router.get(
  '/customers/:id',
  authorize('SALES_VIEW'),
  validate({ params: customerIdParam }),
  asyncHandler(getCustomerById)
);

router.put(
  '/customers/:id',
  authorize('SALES_EDIT'),
  validate({ params: customerIdParam, body: updateCustomerBody }),
  asyncHandler(updateCustomer)
);

router.delete(
  '/customers/:id',
  authorize('SALES_DELETE'),
  validate({ params: customerIdParam }),
  asyncHandler(deleteCustomer)
);

// ── Contacts (nested under a customer for the collection) ─────────────────────
router.get(
  '/customers/:customerId/contacts',
  authorize('SALES_VIEW'),
  validate({ params: contactValidation.customerIdParam }),
  asyncHandler(listContacts)
);

router.post(
  '/customers/:customerId/contacts',
  authorize('SALES_CREATE'),
  validate({ params: contactValidation.customerIdParam, body: contactValidation.createContactBody }),
  asyncHandler(createContact)
);

router.put(
  '/contacts/:id',
  authorize('SALES_EDIT'),
  validate({ params: contactValidation.contactIdParam, body: contactValidation.updateContactBody }),
  asyncHandler(updateContact)
);

router.delete(
  '/contacts/:id',
  authorize('SALES_DELETE'),
  validate({ params: contactValidation.contactIdParam }),
  asyncHandler(deleteContact)
);

module.exports = router;
