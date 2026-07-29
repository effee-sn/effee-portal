const { resolutionService } = require('./resolution.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/**
 * Resolution-plan HTTP controller. Plans are scoped to a department task:
 * `req.params.id` is the ticket, `req.params.taskId` is the department task.
 */

/** `GET …/dept-tasks/:taskId/plans` */
const listPlans = async (req, res) => {
  ApiResponse.ok(res, await resolutionService.list(req.params.id, req.params.taskId, req.user));
};

/** `GET …/dept-tasks/:taskId/plans/:planId` */
const getPlan = async (req, res) => {
  ApiResponse.ok(res, await resolutionService.getOne(req.params.id, req.params.taskId, req.params.planId, req.user));
};

/** `POST …/dept-tasks/:taskId/plans` — ensure (return or create) the draft. */
const startPlan = async (req, res) => {
  ApiResponse.ok(res, await resolutionService.ensureDraft(req.params.id, req.params.taskId, requestContext(req)));
};

/** `PUT …/dept-tasks/:taskId/plans/:planId` — save draft content. */
const savePlan = async (req, res) => {
  ApiResponse.ok(res, await resolutionService.saveDraft(req.params.id, req.params.taskId, req.params.planId, req.body, requestContext(req)));
};

/** `POST …/dept-tasks/:taskId/plans/:planId/finalize` — lock the plan. */
const finalizePlan = async (req, res) => {
  ApiResponse.ok(res, await resolutionService.finalize(req.params.id, req.params.taskId, req.params.planId, requestContext(req)));
};

/** `POST …/dept-tasks/:taskId/plans/:planId/clone` — fork a new draft. */
const clonePlan = async (req, res) => {
  ApiResponse.created(res, await resolutionService.clone(req.params.id, req.params.taskId, req.params.planId, requestContext(req)));
};

/** `DELETE …/dept-tasks/:taskId/plans/:planId` — discard a draft revision. */
const discardPlan = async (req, res) => {
  await resolutionService.discard(req.params.id, req.params.taskId, req.params.planId, requestContext(req));
  ApiResponse.message(res, 'Draft discarded');
};

/** `POST …/dept-tasks/:taskId/plans/:planId/restore` — roll back to this version. */
const restorePlan = async (req, res) => {
  ApiResponse.ok(res, await resolutionService.restore(req.params.id, req.params.taskId, req.params.planId, requestContext(req)));
};

module.exports = { listPlans, getPlan, startPlan, savePlan, finalizePlan, clonePlan, discardPlan, restorePlan };
