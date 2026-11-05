const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');

const {
  listProjectsQuery, projectIdParam, createProjectBody, updateProjectBody, departmentCodeParam, departmentCodeBody, historyQuery,
} = require('./project.validation');
const {
  getProjects, getEnquiryOptions, getProjectById, createProject, updateProject, deleteProject,
  getDepartmentCodes, setDepartmentCode, getProjectHistory,
} = require('./project.controller');

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

// Department codes (Configuration → Department Codes): Project Config → View / Edit.
router.get(
  '/department-codes',
  authorize('PROJECT_CONFIG_VIEW'),
  asyncHandler(getDepartmentCodes)
);

router.put(
  '/department-codes/:departmentId',
  authorize('PROJECT_CONFIG_EDIT'),
  validate({ params: departmentCodeParam, body: departmentCodeBody }),
  asyncHandler(setDepartmentCode)
);

router.get(
  '/:id',
  authorize('PROJECT_VIEW'),
  validate({ params: projectIdParam }),
  asyncHandler(getProjectById)
);

router.get(
  '/:id/history',
  authorize('PROJECT_VIEW'),
  validate({ params: projectIdParam, query: historyQuery }),
  asyncHandler(getProjectHistory)
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

module.exports = router;
