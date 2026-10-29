const { flowEngineService } = require('./flowengine.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Flow Builder flows — HTTP only; the rules live in the service. */

const paging = (q) => ({ skip: (q.page - 1) * q.limit, take: q.limit });

/** `GET /flow-engine/catalog/:module` */
const getCatalog = async (req, res) => {
  ApiResponse.ok(res, flowEngineService.catalog(req.params.module));
};

/** `GET /flow-engine/flows` */
const listFlows = async (req, res) => {
  const { items, total } = await flowEngineService.list({ module: req.query.module, status: req.query.status, ...paging(req.query) });
  ApiResponse.paginated(res, items, { page: req.query.page, limit: req.query.limit, total });
};

/** `GET /flow-engine/flows/:id` */
const getFlow = async (req, res) => {
  ApiResponse.ok(res, await flowEngineService.getById(req.params.id));
};

/** `POST /flow-engine/flows` */
const createFlow = async (req, res) => {
  ApiResponse.created(res, await flowEngineService.create(req.body, requestContext(req)));
};

/** `PUT /flow-engine/flows/:id` */
const updateFlow = async (req, res) => {
  ApiResponse.ok(res, await flowEngineService.update(req.params.id, req.body, requestContext(req)));
};

/** `POST /flow-engine/flows/:id/check` */
const checkFlow = async (req, res) => {
  ApiResponse.ok(res, await flowEngineService.check(req.params.id));
};

/** `POST /flow-engine/flows/:id/publish` */
const publishFlow = async (req, res) => {
  ApiResponse.ok(res, await flowEngineService.publish(req.params.id, requestContext(req)));
};

/** `POST /flow-engine/flows/:id/pause` */
const pauseFlow = async (req, res) => {
  ApiResponse.ok(res, await flowEngineService.pause(req.params.id, requestContext(req)));
};

/** `POST /flow-engine/flows/:id/resume` */
const resumeFlow = async (req, res) => {
  ApiResponse.ok(res, await flowEngineService.resume(req.params.id, requestContext(req)));
};

/** `DELETE /flow-engine/flows/:id` */
const deleteFlow = async (req, res) => {
  await flowEngineService.remove(req.params.id, requestContext(req));
  ApiResponse.noContent(res);
};

/** `GET /flow-engine/flows/:id/versions/:versionId` */
const getVersion = async (req, res) => {
  ApiResponse.ok(res, await flowEngineService.getVersion(req.params.id, req.params.versionId));
};

/** `GET /flow-engine/runs` */
const listRuns = async (req, res) => {
  const { items, total } = await flowEngineService.runs({
    flowId: req.query.flow_id, entityType: req.query.entity_type, entityId: req.query.entity_id, ...paging(req.query),
  });
  ApiResponse.paginated(res, items, { page: req.query.page, limit: req.query.limit, total });
};

/** `GET /flow-engine/runs/:id` */
const getRun = async (req, res) => {
  ApiResponse.ok(res, await flowEngineService.getRun(req.params.id));
};

module.exports = {
  getCatalog, listFlows, getFlow, createFlow, updateFlow, checkFlow, publishFlow, pauseFlow, resumeFlow, deleteFlow,
  getVersion, listRuns, getRun,
};
