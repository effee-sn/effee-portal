const { Router } = require('express');
const { z } = require('zod');

const authenticate = require('../../middleware/authenticate');
const { asyncHandler, validate, ApiResponse, schemas } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');
const { approvalsService } = require('./approvals.service');

/**
 * My Approvals — approvals Flow Builder flows ask for. Open to every signed-in
 * user: what each person sees and may decide is limited in the service (their
 * own requests and the ones they approve; everything for a Super Admin).
 */
const router = Router();
router.use(authenticate);

const listQuery = schemas.listQuery.extend({
  tab: z.enum(['waiting', 'decided', 'requested', 'all']).optional().default('waiting'),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});
const decideBody = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().trim().max(1000).optional(),
});

router.get('/', validate({ query: listQuery }), asyncHandler(async (req, res) => {
  const q = req.query;
  const { items, total } = await approvalsService.list({ tab: q.tab, status: q.status, skip: (q.page - 1) * q.limit, take: q.limit }, requestContext(req));
  ApiResponse.paginated(res, items, { page: q.page, limit: q.limit, total });
}));

router.get('/count', asyncHandler(async (req, res) => {
  ApiResponse.ok(res, { waiting: await approvalsService.count(requestContext(req)) });
}));

router.get('/:id', validate({ params: schemas.idParam }), asyncHandler(async (req, res) => {
  ApiResponse.ok(res, await approvalsService.get(req.params.id, requestContext(req)));
}));

router.post('/:id/decide', validate({ params: schemas.idParam, body: decideBody }), asyncHandler(async (req, res) => {
  ApiResponse.ok(res, await approvalsService.decide(req.params.id, req.body, requestContext(req)));
}));

module.exports = router;
