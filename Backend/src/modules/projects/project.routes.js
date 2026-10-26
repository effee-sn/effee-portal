const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');

const {
  listProjectsQuery, projectIdParam, createProjectBody, updateProjectBody,
  machineParam, addMachinesBody, updateMachineBody, machineNumberingBody,
} = require('./project.validation');
const {
  getProjects, getEnquiryOptions, getProjectById, createProject, updateProject, deleteProject,
  addMachines, updateMachine, removeMachine, getMachineNumbering, setMachineNumbering,
} = require('./project.controller');
const bomValidation = require('./bom.validation');
const bomController = require('./bom.controller');

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('PROJECT_VIEW'),
  validate({ query: listProjectsQuery }),
  asyncHandler(getProjects)
);

router.post(
  '/',
  authorize('PROJECT_CREATE'),
  validate({ body: createProjectBody }),
  asyncHandler(createProject)
);

// Static path before the `:id` route so it is not read as an id.
router.get(
  '/enquiry-options',
  authorize('PROJECT_VIEW'),
  asyncHandler(getEnquiryOptions)
);

// Machine ID numbering: read by whoever creates projects (to preview IDs) and
// its administrators; changed with Project Config → Edit.
router.get(
  '/machine-numbering',
  authorize('PROJECT_CONFIG_VIEW', 'PROJECT_CREATE'),
  asyncHandler(getMachineNumbering)
);

router.put(
  '/machine-numbering',
  authorize('PROJECT_CONFIG_EDIT'),
  validate({ body: machineNumberingBody }),
  asyncHandler(setMachineNumbering)
);

// Picking a BOM line: materials and released subassemblies (BOM access is enough).
router.get(
  '/bom-material-search',
  authorize('BOM_EDIT'),
  validate({ query: bomValidation.searchQuery }),
  asyncHandler(bomController.searchMaterials)
);

router.get(
  '/:id',
  authorize('PROJECT_VIEW'),
  validate({ params: projectIdParam }),
  asyncHandler(getProjectById)
);

router.put(
  '/:id',
  authorize('PROJECT_EDIT'),
  validate({ params: projectIdParam, body: updateProjectBody }),
  asyncHandler(updateProject)
);

router.delete(
  '/:id',
  authorize('PROJECT_DELETE'),
  validate({ params: projectIdParam }),
  asyncHandler(deleteProject)
);

// ── Machines ──────────────────────────────────────────────────────────────────
router.post(
  '/:id/machines',
  authorize('PROJECT_EDIT'),
  validate({ params: projectIdParam, body: addMachinesBody }),
  asyncHandler(addMachines)
);

router.put(
  '/:id/machines/:machineId',
  authorize('PROJECT_EDIT'),
  validate({ params: machineParam, body: updateMachineBody }),
  asyncHandler(updateMachine)
);

router.delete(
  '/:id/machines/:machineId',
  authorize('PROJECT_EDIT'),
  validate({ params: machineParam }),
  asyncHandler(removeMachine)
);

// ── BOM: drafts are edited with BOM → Edit; locking needs BOM → Approve ───────
router.get('/:id/bom', authorize('BOM_VIEW'), validate({ params: projectIdParam }), asyncHandler(bomController.getOverview));
router.post('/:id/bom', authorize('BOM_EDIT'), validate({ params: projectIdParam }), asyncHandler(bomController.startRevision));
router.get('/:id/bom/:bomId', authorize('BOM_VIEW'), validate({ params: bomValidation.bomParam }), asyncHandler(bomController.getBom));
router.put('/:id/bom/:bomId', authorize('BOM_EDIT'), validate({ params: bomValidation.bomParam, body: bomValidation.draftBody }), asyncHandler(bomController.saveDraft));
router.delete('/:id/bom/:bomId', authorize('BOM_EDIT'), validate({ params: bomValidation.bomParam }), asyncHandler(bomController.discardDraft));
router.post('/:id/bom/:bomId/lock', authorize('BOM_APPROVE'), validate({ params: bomValidation.bomParam, body: bomValidation.lockBody }), asyncHandler(bomController.lockBom));
router.get('/:id/bom/:bomId/tags', authorize('BOM_VIEW'), validate({ params: bomValidation.bomParam, query: bomValidation.tagsQuery }), asyncHandler(bomController.getTags));
router.get('/:id/bom/:bomId/totals', authorize('BOM_VIEW'), validate({ params: bomValidation.bomParam }), asyncHandler(bomController.getTotals));
router.get('/:id/bom/:bomId/export', authorize('BOM_VIEW'), validate({ params: bomValidation.bomParam }), asyncHandler(bomController.exportBom));

module.exports = router;
