const { z } = require('zod');
const { schemas } = require('../../core');

/**
 * Request schemas for the flow (workflow) module.
 */

const assigneeType = z.enum(['USER', 'ROLE', 'DEPARTMENT', 'DEPARTMENT_HEAD', 'CREATOR', 'MANUAL']);

const optionalId = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().positive().optional()
);

/**
 * A single workflow step. The service enforces that the id matching the
 * assignee type is present and references a live record; here we just shape
 * and bound the input.
 */
const step = z.object({
  name:          z.string().trim().min(1, 'Step name is required').max(120),
  assignee_type: assigneeType,
  assignee_user_id:       optionalId,
  assignee_role_id:       optionalId,
  assignee_department_id: optionalId,
});

const listWorkflowsQuery = schemas.listQuery.extend({
  module: z.string().trim().max(40).optional(),
});

const workflowIdParam = schemas.idParam;

const createWorkflowBody = z.object({
  name:        z.string().trim().min(1, 'Name is required').max(150),
  module:      z.string().trim().min(1).max(40).optional().default('service'),
  description: z.string().trim().max(500).optional().transform((v) => (v === '' ? undefined : v)),
  is_active:   schemas.flexibleBoolean.optional().default(false),
  steps:       z.array(step).min(1, 'A workflow needs at least one step').max(30),
});

module.exports = {
  listWorkflowsQuery,
  workflowIdParam,
  createWorkflowBody,
};
