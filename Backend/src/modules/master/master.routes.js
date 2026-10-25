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

// ── Materials & their IMM code prefixes ──────────────────────────────────────
const materialValidation = require('./material.validation');
const materialController = require('./material.controller');

// Prefixes: readable by material users (the IMM code dropdown) and their
// administrators; changed only with the Material Codes permissions.
router.get('/materials/prefixes', authorize('MATERIAL_VIEW', 'MATERIAL_CONFIG_VIEW'), asyncHandler(materialController.listPrefixes));
router.post(
  '/materials/prefixes',
  authorize('MATERIAL_CONFIG_CREATE'),
  validate({ body: materialValidation.createPrefixBody }),
  asyncHandler(materialController.createPrefix)
);
router.put(
  '/materials/prefixes/:id',
  authorize('MATERIAL_CONFIG_EDIT'),
  validate({ params: materialValidation.idParam, body: materialValidation.updatePrefixBody }),
  asyncHandler(materialController.updatePrefix)
);
router.delete(
  '/materials/prefixes/:id',
  authorize('MATERIAL_CONFIG_DELETE'),
  validate({ params: materialValidation.idParam }),
  asyncHandler(materialController.deletePrefix)
);

// For the material forms' drawing no. list (before /materials/:id).
router.get('/materials/drawing-options', authorize('MATERIAL_CREATE', 'MATERIAL_EDIT'),
  validate({ query: materialValidation.drawingOptionsQuery }), asyncHandler(materialController.getDrawingOptions));
router.get(
  '/materials',
  authorize('MATERIAL_VIEW'),
  validate({ query: materialValidation.listMaterialsQuery }),
  asyncHandler(materialController.listMaterials)
);
router.post(
  '/materials/bulk',
  authorize('MATERIAL_CREATE'),
  validate({ body: materialValidation.bulkCreateBody }),
  asyncHandler(materialController.createMaterials)
);
router.get(
  '/materials/:id',
  authorize('MATERIAL_VIEW'),
  validate({ params: materialValidation.idParam }),
  asyncHandler(materialController.getMaterial)
);
router.put(
  '/materials/:id',
  authorize('MATERIAL_EDIT'),
  validate({ params: materialValidation.idParam, body: materialValidation.updateMaterialBody }),
  asyncHandler(materialController.updateMaterial)
);
router.delete(
  '/materials/:id',
  authorize('MATERIAL_DELETE'),
  validate({ params: materialValidation.idParam }),
  asyncHandler(materialController.deleteMaterial)
);

// ── BOM: subassemblies built from materials ───────────────────────────────────
const bomValidation = require('./bom.validation');
const bomController = require('./bom.controller');

router.get('/bom/subassemblies', authorize('BOM_VIEW'), validate({ query: bomValidation.listSubassembliesQuery }), asyncHandler(bomController.listSubassemblies));
// Picking materials needs only BOM access, not the material master's.
router.get('/bom/material-search', authorize('BOM_CREATE', 'BOM_EDIT'), validate({ query: bomValidation.materialSearchQuery }), asyncHandler(bomController.searchMaterials));
router.post('/bom/subassemblies', authorize('BOM_CREATE'), validate({ body: bomValidation.createSubassemblyBody }), asyncHandler(bomController.createSubassembly));
router.get('/bom/subassemblies/:id', authorize('BOM_VIEW'), validate({ params: bomValidation.idParam }), asyncHandler(bomController.getSubassembly));
router.put('/bom/subassemblies/:id', authorize('BOM_EDIT'), validate({ params: bomValidation.idParam, body: bomValidation.updateSubassemblyBody }), asyncHandler(bomController.updateSubassembly));
router.delete('/bom/subassemblies/:id', authorize('BOM_DELETE'), validate({ params: bomValidation.idParam }), asyncHandler(bomController.deleteSubassembly));

module.exports = router;
