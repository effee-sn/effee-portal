const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');
const { listWorkflowsQuery, workflowIdParam, createWorkflowBody } = require('./flow.validation');
const { getWorkflows, getWorkflowById, createWorkflow, updateWorkflow, deleteWorkflow } = require('./flow.controller');

const router = Router();

/**
 * Flow builder routes — managing workflow definitions.
 *
 * Gated by the FLOW permissions (admin tool). Building/listing workflows does
 * not touch tickets; running a workflow against tickets is a later phase.
 */
router.use(authenticate);

router.get(
  '/workflows',
  authorize('FLOW_VIEW'),
  validate({ query: listWorkflowsQuery }),
  asyncHandler(getWorkflows)
);

router.post(
  '/workflows',
  authorize('FLOW_CREATE'),
  validate({ body: createWorkflowBody }),
  asyncHandler(createWorkflow)
);

router.get(
  '/workflows/:id',
  authorize('FLOW_VIEW'),
  validate({ params: workflowIdParam }),
  asyncHandler(getWorkflowById)
);

router.put(
  '/workflows/:id',
  authorize('FLOW_EDIT'),
  validate({ params: workflowIdParam, body: createWorkflowBody }),
  asyncHandler(updateWorkflow)
);

router.delete(
  '/workflows/:id',
  authorize('FLOW_DELETE'),
  validate({ params: workflowIdParam }),
  asyncHandler(deleteWorkflow)
);

module.exports = router;
