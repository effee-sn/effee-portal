const { Router } = require('express');
const { z } = require('zod');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate, schemas } = require('../../core');
const {
  listTicketsQuery, ticketIdParam, createTicketBody, updateTicketBody,
} = require('./service.validation');
const {
  getDashboard, getTickets, getInbox, getTicketById,
  createTicket, updateTicket, advanceTicket, declineTicket, reassignTicket,
  confirmTicket, closeTicket, reopenTicket, deleteTicket,
} = require('./service.controller');
const { taskPlansParam, planParams, saveDraftBody } = require('./resolution.validation');
const {
  listPlans, getPlan, startPlan, savePlan, finalizePlan, clonePlan, discardPlan, restorePlan,
} = require('./resolution.controller');
const dt = require('./deptTask.validation');
const dtc = require('./deptTask.controller');

const router = Router();

/**
 * Service module routes.
 *
 * ── Two authorisation tiers ──────────────────────────────────────────────────
 * Collection endpoints (browse all tickets, dashboard) require the static
 * SERVICE permissions — the oversight tier.
 *
 * Single-ticket endpoints (view one, update one, advance one) require only
 * authentication; the service layer then enforces record-level access, so a
 * flow-assigned user with no SERVICE permission can work the ticket assigned to
 * them and nothing else. The inbox is the same: assignment alone grants it.
 */
router.use(authenticate);

// Dashboard aggregates — oversight tier.
router.get('/', authorize('SERVICE_VIEW'), asyncHandler(getDashboard));

// Browse all tickets — oversight tier.
router.get(
  '/tickets',
  authorize('SERVICE_VIEW'),
  validate({ query: listTicketsQuery }),
  asyncHandler(getTickets)
);

// My assigned tickets — record tier (no permission needed). Declared before
// `/tickets/:id` so "inbox" is not captured as an id.
router.get(
  '/tickets/inbox',
  validate({ query: schemas.listQuery.passthrough() }),
  asyncHandler(getInbox)
);

router.post(
  '/tickets',
  authorize('SERVICE_CREATE'),
  validate({ body: createTicketBody }),
  asyncHandler(createTicket)
);

// View one — record tier; the service enforces canView.
router.get(
  '/tickets/:id',
  validate({ params: ticketIdParam }),
  asyncHandler(getTicketById)
);

// Update one — record tier; the service enforces canAct.
router.put(
  '/tickets/:id',
  validate({ params: ticketIdParam, body: updateTicketBody }),
  asyncHandler(updateTicket)
);

// Advance to the next stage (also the head's "accept") — record tier; only the
// current assignee may.
router.post(
  '/tickets/:id/advance',
  validate({
    params: ticketIdParam,
    // A non-manual stage carries no body; normalise a missing body to {} so the
    // object schema does not reject `undefined`.
    body: z.preprocess(
      (v) => (v == null ? {} : v),
      z.object({ assignee_user_id: z.coerce.number().int().positive().optional() })
    ),
  }),
  asyncHandler(advanceTicket)
);

// Decline the current stage — record tier; only the current assignee may.
router.post(
  '/tickets/:id/decline',
  validate({
    params: ticketIdParam,
    body: z.object({ reason: z.string().trim().min(1, 'A reason is required').max(2000) }),
  }),
  asyncHandler(declineTicket)
);

// Reassign the current stage — to a department's head or a specific person.
// Record tier; only the current holder may.
router.post(
  '/tickets/:id/reassign',
  validate({
    params: ticketIdParam,
    body: z.object({
      department_id:    z.coerce.number().int().positive().optional(),
      assignee_user_id: z.coerce.number().int().positive().optional(),
    }).refine((b) => b.department_id || b.assignee_user_id, { message: 'Choose a department or a person' }),
  }),
  asyncHandler(reassignTicket)
);

// Customer confirmation → observation. Record tier.
router.post(
  '/tickets/:id/confirm',
  validate({
    params: ticketIdParam,
    body: z.preprocess(
      (v) => (v == null ? {} : v),
      z.object({ observation_days: z.coerce.number().int().min(0).max(365).optional() })
    ),
  }),
  asyncHandler(confirmTicket)
);

// Close after observation. Record tier.
router.post('/tickets/:id/close', validate({ params: ticketIdParam }), asyncHandler(closeTicket));

// Reopen → re-triage. Record tier.
router.post(
  '/tickets/:id/reopen',
  validate({
    params: ticketIdParam,
    body: z.object({ reason: z.string().trim().min(1, 'A reason is required').max(2000) }),
  }),
  asyncHandler(reopenTicket)
);

// ── Department tasks (record tier; the service enforces manage/work access) ───
// `/dispatch` is declared before `/:taskId` so it isn't captured as an id.
router.get('/tickets/:id/dept-tasks', validate({ params: dt.ticketIdParam }), asyncHandler(dtc.listTasks));
router.post('/tickets/:id/dept-tasks', validate({ params: dt.ticketIdParam, body: dt.addTaskBody }), asyncHandler(dtc.addTask));
router.post('/tickets/:id/dept-tasks/dispatch', validate({ params: dt.ticketIdParam }), asyncHandler(dtc.dispatchTasks));
router.put('/tickets/:id/dept-tasks/:taskId', validate({ params: dt.taskParams, body: dt.updateTaskBody }), asyncHandler(dtc.updateTask));
router.delete('/tickets/:id/dept-tasks/:taskId', validate({ params: dt.taskParams }), asyncHandler(dtc.removeTask));
router.post('/tickets/:id/dept-tasks/:taskId/assign', validate({ params: dt.taskParams, body: dt.assignResolverBody }), asyncHandler(dtc.assignResolver));
router.post('/tickets/:id/dept-tasks/:taskId/submit', validate({ params: dt.taskParams, body: dt.submitBody }), asyncHandler(dtc.submitTask));
router.post('/tickets/:id/dept-tasks/:taskId/return', validate({ params: dt.taskParams }), asyncHandler(dtc.returnTask));
router.post('/tickets/:id/dept-tasks/:taskId/resolve', validate({ params: dt.taskParams, body: dt.resolveBody }), asyncHandler(dtc.resolveTask));
router.post('/tickets/:id/dept-tasks/:taskId/decline', validate({ params: dt.taskParams, body: dt.declineBody }), asyncHandler(dtc.declineTask));
router.post('/tickets/:id/dept-tasks/:taskId/redirect', validate({ params: dt.taskParams, body: dt.redirectBody }), asyncHandler(dtc.redirectTask));
// The rich work report for one issue — authored by the task's current holder.
router.put('/tickets/:id/dept-tasks/:taskId/report', validate({ params: dt.taskParams, body: dt.reportBody }), asyncHandler(dtc.saveReport));

// ── Resolution plans — scoped per department task (record tier) ───────────────
// Viewing follows canView; authoring/finalising/cloning is the task LEAD only —
// all enforced in the resolution service. `/:planId` sub-routes come after the
// collection so a fixed segment is never captured as a plan id.
router.get('/tickets/:id/dept-tasks/:taskId/plans', validate({ params: taskPlansParam }), asyncHandler(listPlans));
router.post('/tickets/:id/dept-tasks/:taskId/plans', validate({ params: taskPlansParam }), asyncHandler(startPlan));
router.get('/tickets/:id/dept-tasks/:taskId/plans/:planId', validate({ params: planParams }), asyncHandler(getPlan));
router.put('/tickets/:id/dept-tasks/:taskId/plans/:planId', validate({ params: planParams, body: saveDraftBody }), asyncHandler(savePlan));
router.post('/tickets/:id/dept-tasks/:taskId/plans/:planId/finalize', validate({ params: planParams }), asyncHandler(finalizePlan));
router.post('/tickets/:id/dept-tasks/:taskId/plans/:planId/clone', validate({ params: planParams }), asyncHandler(clonePlan));
router.post('/tickets/:id/dept-tasks/:taskId/plans/:planId/restore', validate({ params: planParams }), asyncHandler(restorePlan));
router.delete('/tickets/:id/dept-tasks/:taskId/plans/:planId', validate({ params: planParams }), asyncHandler(discardPlan));

// Delete — oversight tier.
router.delete(
  '/tickets/:id',
  authorize('SERVICE_DELETE'),
  validate({ params: ticketIdParam }),
  asyncHandler(deleteTicket)
);

module.exports = router;
