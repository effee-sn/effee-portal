const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const requireSystemRole = require('../../middleware/requireSystemRole');
const { asyncHandler, validate } = require('../../core');
const v = require('./flowengine.validation');
const c = require('./flowengine.controller');

const router = Router();

/**
 * Flow Builder flows (the flow engine). Super Admin only for now; the Flow
 * Builder View / Edit / Publish permissions replace this when the builder
 * screens arrive.
 */
router.use(authenticate, requireSystemRole);

router.get('/catalog/:module', validate({ params: v.moduleParam }), asyncHandler(c.getCatalog));

router.get('/flows', validate({ query: v.listFlowsQuery }), asyncHandler(c.listFlows));
router.post('/flows', validate({ body: v.createFlowBody }), asyncHandler(c.createFlow));
router.get('/flows/:id', validate({ params: v.flowIdParam }), asyncHandler(c.getFlow));
router.put('/flows/:id', validate({ params: v.flowIdParam, body: v.updateFlowBody }), asyncHandler(c.updateFlow));
router.delete('/flows/:id', validate({ params: v.flowIdParam }), asyncHandler(c.deleteFlow));
router.post('/flows/:id/check', validate({ params: v.flowIdParam }), asyncHandler(c.checkFlow));
router.post('/flows/:id/publish', validate({ params: v.flowIdParam }), asyncHandler(c.publishFlow));
router.post('/flows/:id/pause', validate({ params: v.flowIdParam }), asyncHandler(c.pauseFlow));
router.post('/flows/:id/resume', validate({ params: v.flowIdParam }), asyncHandler(c.resumeFlow));
router.get('/flows/:id/versions/:versionId', validate({ params: v.versionParam }), asyncHandler(c.getVersion));
router.post('/flows/:id/test', validate({ params: v.flowIdParam, body: v.testFlowBody }), asyncHandler(c.testFlow));
router.get('/flows/:id/affected', validate({ params: v.flowIdParam }), asyncHandler(c.getAffected));
router.post('/flows/:id/move-current', validate({ params: v.flowIdParam, body: v.moveCurrentBody }), asyncHandler(c.moveCurrent));

router.get('/runs', validate({ query: v.listRunsQuery }), asyncHandler(c.listRuns));
router.get('/runs/:id', validate({ params: v.flowIdParam }), asyncHandler(c.getRun));

module.exports = router;
