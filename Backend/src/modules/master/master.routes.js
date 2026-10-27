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

// Units of measure: same access pattern as the prefixes.
router.get('/materials/units', authorize('MATERIAL_VIEW', 'MATERIAL_CONFIG_VIEW'), asyncHandler(materialController.listUnits));
router.post(
  '/materials/units',
  authorize('MATERIAL_CONFIG_CREATE'),
  validate({ body: materialValidation.createUnitBody }),
  asyncHandler(materialController.createUnit)
);
router.put(
  '/materials/units/:id',
  authorize('MATERIAL_CONFIG_EDIT'),
  validate({ params: materialValidation.idParam, body: materialValidation.updateUnitBody }),
  asyncHandler(materialController.updateUnit)
);
router.delete(
  '/materials/units/:id',
  authorize('MATERIAL_CONFIG_DELETE'),
  validate({ params: materialValidation.idParam }),
  asyncHandler(materialController.deleteUnit)
);

// For the bulk entry: drawing numbers already taken (before /materials/:id).
router.get('/materials/drawing-check', authorize('MATERIAL_CREATE', 'MATERIAL_EDIT'),
  validate({ query: materialValidation.drawingCheckQuery }), asyncHandler(materialController.getDrawingCheck));
router.get(
  '/materials',
  authorize('MATERIAL_VIEW'),
  validate({ query: materialValidation.listMaterialsQuery }),
  asyncHandler(materialController.listMaterials)
);
router.get(
  '/materials/export',
  authorize('MATERIAL_VIEW'),
  validate({ query: materialValidation.listMaterialsQuery }),
  asyncHandler(materialController.exportMaterials)
);
router.post(
  '/materials/duplicates',
  authorize('MATERIAL_CREATE'),
  validate({ body: materialValidation.duplicatesBody }),
  asyncHandler(materialController.findDuplicates)
);
router.post(
  '/materials/bulk',
  authorize('MATERIAL_CREATE'),
  validate({ body: materialValidation.bulkCreateBody }),
  asyncHandler(materialController.createMaterials)
);
router.get(
  '/materials/:id/where-used',
  authorize('MATERIAL_VIEW'),
  validate({ params: materialValidation.idParam }),
  asyncHandler(materialController.getWhereUsed)
);
router.get(
  '/materials/:id/revisions',
  authorize('MATERIAL_VIEW'),
  validate({ params: materialValidation.idParam }),
  asyncHandler(materialController.listRevisions)
);
router.post(
  '/materials/:id/revisions',
  authorize('MATERIAL_EDIT'),
  validate({ params: materialValidation.idParam }),
  asyncHandler(materialController.newRevision)
);
router.put(
  '/materials/:id/revisions/:revId',
  authorize('MATERIAL_EDIT'),
  validate({ params: materialValidation.revisionParam, body: materialValidation.revisionDraftBody }),
  asyncHandler(materialController.saveRevisionDraft)
);
router.post(
  '/materials/:id/revisions/:revId/release',
  authorize('MATERIAL_APPROVE'),
  validate({ params: materialValidation.revisionParam, body: materialValidation.revisionReleaseBody }),
  asyncHandler(materialController.releaseRevision)
);
router.delete(
  '/materials/:id/revisions/:revId',
  authorize('MATERIAL_EDIT'),
  validate({ params: materialValidation.revisionParam }),
  asyncHandler(materialController.discardRevisionDraft)
);
router.get(
  '/materials/:id/history',
  authorize('MATERIAL_VIEW'),
  validate({ params: materialValidation.idParam, query: materialValidation.historyQuery }),
  asyncHandler(materialController.getHistory)
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

// ── Subassemblies: drawing-wise parts built from materials and other subassemblies ──
const subassemblyValidation = require('./subassembly.validation');
const subassemblyController = require('./subassembly.controller');
const sv = subassemblyValidation;
const sc = subassemblyController;

router.get('/subassemblies', authorize('SUBASSEMBLY_VIEW'), validate({ query: sv.listSubassembliesQuery }), asyncHandler(sc.listSubassemblies));
// Building one needs only subassembly access, not the material master's (these come before /subassemblies/:id).
router.get('/subassemblies/material-search', authorize('SUBASSEMBLY_CREATE', 'SUBASSEMBLY_EDIT'), validate({ query: sv.searchQuery }), asyncHandler(sc.searchMaterials));
router.get('/subassemblies/item-options', authorize('SUBASSEMBLY_CREATE', 'SUBASSEMBLY_EDIT'), validate({ query: sv.searchQuery }), asyncHandler(sc.getItemOptions));
router.get('/subassemblies/item-setup', authorize('SUBASSEMBLY_CREATE', 'SUBASSEMBLY_EDIT'), asyncHandler(sc.getItemSetup));
// How revisions are labelled: a material-master setting (Administrator → Configuration → Revisions).
router.get('/subassemblies/revision-scheme', authorize('SUBASSEMBLY_VIEW', 'MATERIAL_CONFIG_VIEW'), asyncHandler(sc.getRevisionScheme));
router.put('/subassemblies/revision-scheme', authorize('MATERIAL_CONFIG_EDIT'), validate({ body: sv.schemeBody }), asyncHandler(sc.setRevisionScheme));
router.post('/subassemblies', authorize('SUBASSEMBLY_CREATE'), validate({ body: sv.createSubassemblyBody }), asyncHandler(sc.createSubassembly));
router.get('/subassemblies/:id', authorize('SUBASSEMBLY_VIEW'), validate({ params: sv.idParam }), asyncHandler(sc.getSubassembly));
router.get('/subassemblies/:id/tree', authorize('SUBASSEMBLY_VIEW'), validate({ params: sv.idParam, query: sv.treeQuery }), asyncHandler(sc.getTree));
router.get('/subassemblies/:id/compare', authorize('SUBASSEMBLY_VIEW'), validate({ params: sv.idParam, query: sv.compareQuery }), asyncHandler(sc.compareRevisions));
router.put('/subassemblies/:id', authorize('SUBASSEMBLY_EDIT'), validate({ params: sv.idParam, body: sv.updateSubassemblyBody }), asyncHandler(sc.updateSubassembly));
router.delete('/subassemblies/:id', authorize('SUBASSEMBLY_DELETE'), validate({ params: sv.idParam }), asyncHandler(sc.deleteSubassembly));
// Revisions: drafts are edited with Edit; releasing needs Approve.
router.post('/subassemblies/:id/revisions', authorize('SUBASSEMBLY_EDIT'), validate({ params: sv.idParam }), asyncHandler(sc.newRevision));
router.get('/subassemblies/:id/revisions/:revId', authorize('SUBASSEMBLY_VIEW'), validate({ params: sv.revParam }), asyncHandler(sc.getRevision));
router.put('/subassemblies/:id/revisions/:revId', authorize('SUBASSEMBLY_EDIT'), validate({ params: sv.revParam, body: sv.draftBody }), asyncHandler(sc.saveDraft));
router.post('/subassemblies/:id/revisions/:revId/release', authorize('SUBASSEMBLY_APPROVE'), validate({ params: sv.revParam, body: sv.releaseBody }), asyncHandler(sc.releaseRevision));
router.delete('/subassemblies/:id/revisions/:revId', authorize('SUBASSEMBLY_EDIT'), validate({ params: sv.revParam }), asyncHandler(sc.discardDraft));

module.exports = router;
