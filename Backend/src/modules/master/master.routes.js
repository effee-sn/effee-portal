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

const currencyValidation = require('./currency.validation');
const currencyController = require('./currency.controller');

const contactValidation = require('./contact.validation');
const {
  listContacts, createContact, updateContact, deleteContact,
} = require('./contact.controller');

/**
 * Master data — shared reference entities (customers, contacts, currencies)
 * used across modules. Each has its own permissions (CUSTOMER_*, CURRENCY_*)
 * rather than SALES_*, since they are not owned by the sales module.
 */
const router = Router();

router.use(authenticate);

// ── Customers ────────────────────────────────────────────────────────────────
router.get(
  '/customers',
  authorize('CUSTOMER_VIEW'),
  validate({ query: listCustomersQuery }),
  asyncHandler(getCustomers)
);

// Static path before the `:id` route so "options" is not read as an id.
router.get(
  '/customers/options',
  authorize('CUSTOMER_VIEW'),
  asyncHandler(getCustomerOptions)
);

router.post(
  '/customers',
  authorize('CUSTOMER_CREATE'),
  validate({ body: createCustomerBody }),
  asyncHandler(createCustomer)
);

router.get(
  '/customers/:id',
  authorize('CUSTOMER_VIEW'),
  validate({ params: customerIdParam }),
  asyncHandler(getCustomerById)
);

router.put(
  '/customers/:id',
  authorize('CUSTOMER_EDIT'),
  validate({ params: customerIdParam, body: updateCustomerBody }),
  asyncHandler(updateCustomer)
);

router.delete(
  '/customers/:id',
  authorize('CUSTOMER_DELETE'),
  validate({ params: customerIdParam }),
  asyncHandler(deleteCustomer)
);

// ── Contacts (nested under a customer for the collection) ─────────────────────
router.get(
  '/customers/:customerId/contacts',
  authorize('CUSTOMER_VIEW'),
  validate({ params: contactValidation.customerIdParam }),
  asyncHandler(listContacts)
);

router.post(
  '/customers/:customerId/contacts',
  authorize('CUSTOMER_CREATE'),
  validate({ params: contactValidation.customerIdParam, body: contactValidation.createContactBody }),
  asyncHandler(createContact)
);

router.put(
  '/contacts/:id',
  authorize('CUSTOMER_EDIT'),
  validate({ params: contactValidation.contactIdParam, body: contactValidation.updateContactBody }),
  asyncHandler(updateContact)
);

router.delete(
  '/contacts/:id',
  authorize('CUSTOMER_DELETE'),
  validate({ params: contactValidation.contactIdParam }),
  asyncHandler(deleteContact)
);

// ── Currencies (manually maintained rates with history) ──────────────────────
// Options are open to any signed-in user: forms in other modules (e.g. a sales
// enquiry) need the active currencies and their rates.
router.get('/currencies/options', asyncHandler(currencyController.getCurrencyOptions));
router.get('/currencies', authorize('CURRENCY_VIEW'), asyncHandler(currencyController.listCurrencies));
router.post(
  '/currencies',
  authorize('CURRENCY_CREATE'),
  validate({ body: currencyValidation.createCurrencyBody }),
  asyncHandler(currencyController.createCurrency)
);
router.get(
  '/currencies/:code',
  authorize('CURRENCY_VIEW'),
  validate({ params: currencyValidation.currencyCodeParam }),
  asyncHandler(currencyController.getCurrency)
);
router.put(
  '/currencies/:code',
  authorize('CURRENCY_EDIT'),
  validate({ params: currencyValidation.currencyCodeParam, body: currencyValidation.updateCurrencyBody }),
  asyncHandler(currencyController.updateCurrency)
);
router.post(
  '/currencies/:code/rates',
  authorize('CURRENCY_EDIT'),
  validate({ params: currencyValidation.currencyCodeParam, body: currencyValidation.addRateBody }),
  asyncHandler(currencyController.addRate)
);
router.post(
  '/currencies/:code/default',
  authorize('CURRENCY_EDIT'),
  validate({ params: currencyValidation.currencyCodeParam }),
  asyncHandler(currencyController.setDefaultCurrency)
);
router.delete(
  '/currencies/:code/rates/:rateId',
  authorize('CURRENCY_EDIT'),
  validate({ params: currencyValidation.rateIdParam }),
  asyncHandler(currencyController.deleteRate)
);
router.delete(
  '/currencies/:code',
  authorize('CURRENCY_DELETE'),
  validate({ params: currencyValidation.currencyCodeParam }),
  asyncHandler(currencyController.deleteCurrency)
);

module.exports = router;
