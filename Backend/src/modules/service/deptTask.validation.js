const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for per-department tasks (nested under a ticket). */

const ticketIdParam = schemas.idParam;
const taskParams = z.object({
  id:     z.coerce.number().int().positive(),
  taskId: z.coerce.number().int().positive(),
});

const optionalCategory = z.string().trim().max(120).optional().transform((v) => (v === '' ? undefined : v));

const addTaskBody = z.object({
  department_id:      z.coerce.number().int().positive(),
  issue_note:         z.string().trim().min(1, 'An issue note is required').max(5000),
  technical_category: optionalCategory,
});

const updateTaskBody = z.object({
  issue_note:         z.string().trim().min(1).max(5000).optional(),
  technical_category: optionalCategory,
}).refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

const assignResolverBody = z.object({ assignee_user_id: z.coerce.number().int().positive() });

const submitBody = z.object({ resolution_note: z.string().trim().min(1, 'Describe what was done').max(10000) });

const resolveBody = z.preprocess(
  (v) => (v == null ? {} : v),
  z.object({ resolution_note: z.string().trim().max(10000).optional() })
);

const declineBody = z.object({ reason: z.string().trim().min(1, 'A reason is required').max(2000) });

/**
 * `PUT …/dept-tasks/:taskId/report` — the rich work report for this issue.
 * `resolution_note_json` is the block-editor document; `resolution_note` is its
 * plain-text mirror. Both optional so an empty save (clearing) is allowed.
 */
const reportBody = z.object({
  resolution_note:      z.string().max(20000).optional(),
  resolution_note_json: z.any().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Nothing to save' });

const redirectBody = z.object({
  department_id:      z.coerce.number().int().positive().optional(),
  issue_note:         z.string().trim().min(1).max(5000).optional(),
  technical_category: optionalCategory,
});

module.exports = {
  ticketIdParam, taskParams, addTaskBody, updateTaskBody,
  assignResolverBody, submitBody, resolveBody, declineBody, redirectBody, reportBody,
};
