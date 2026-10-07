const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');

const {
  listProjectsQuery, projectIdParam, createProjectBody, updateProjectBody,
} = require('./project.validation');
const {
  getProjects, getEnquiryOptions, getProjectById, createProject, updateProject, deleteProject,
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

module.exports = router;
