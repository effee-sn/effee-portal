const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');
const v = require('./flowengine.validation');
const c = require('./flowengine.controller');

const router = Router();

/**
 * Flow Builder flows (the flow engine), by permission (Super Admin: all):
 *   Flow Builder → View     see flows, their versions and the run log;
 *   Flow Builder → Create   start a flow;
 *   Flow Builder → Edit     change drafts, check and test-run them;
 *   Flow Builder → Publish  make a draft live, pause / resume, move current records;
 *   Flow Builder → Delete   delete a paused or never-published flow.
 */
router.use(authenticate);

const VIEW = authorize('FLOW_VIEW');
const EDIT = authorize('FLOW_EDIT');
const PUBLISH = authorize('FLOW_PUBLISH');

router.get('/catalog/:module', VIEW, validate({ params: v.moduleParam }), asyncHandler(c.getCatalog));

router.get('/flows', VIEW, validate({ query: v.listFlowsQuery }), asyncHandler(c.listFlows));
router.post('/flows', authorize('FLOW_CREATE'), validate({ body: v.createFlowBody }), asyncHandler(c.createFlow));
router.get('/flows/:id', VIEW, validate({ params: v.flowIdParam }), asyncHandler(c.getFlow));
router.put('/flows/:id', EDIT, validate({ params: v.flowIdParam, body: v.updateFlowBody }), asyncHandler(c.updateFlow));
router.delete('/flows/:id', authorize('FLOW_DELETE'), validate({ params: v.flowIdParam }), asyncHandler(c.deleteFlow));
router.post('/flows/:id/check', VIEW, validate({ params: v.flowIdParam }), asyncHandler(c.checkFlow));
router.post('/flows/:id/test', EDIT, validate({ params: v.flowIdParam, body: v.testFlowBody }), asyncHandler(c.testFlow));
router.post('/flows/:id/publish', PUBLISH, validate({ params: v.flowIdParam }), asyncHandler(c.publishFlow));
router.post('/flows/:id/pause', PUBLISH, validate({ params: v.flowIdParam }), asyncHandler(c.pauseFlow));
router.post('/flows/:id/resume', PUBLISH, validate({ params: v.flowIdParam }), asyncHandler(c.resumeFlow));
router.get('/flows/:id/affected', PUBLISH, validate({ params: v.flowIdParam }), asyncHandler(c.getAffected));
router.post('/flows/:id/move-current', PUBLISH, validate({ params: v.flowIdParam, body: v.moveCurrentBody }), asyncHandler(c.moveCurrent));
router.get('/flows/:id/versions/:versionId', VIEW, validate({ params: v.versionParam }), asyncHandler(c.getVersion));

router.get('/runs', VIEW, validate({ query: v.listRunsQuery }), asyncHandler(c.listRuns));
router.get('/runs/:id', VIEW, validate({ params: v.flowIdParam }), asyncHandler(c.getRun));

module.exports = router;
