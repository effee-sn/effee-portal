const { salesConfigService } = require('./config.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Sales configuration HTTP controller (applications + stage probabilities). */

/** `GET /sales/applications` */
const listApplications = async (req, res) => {
  ApiResponse.ok(res, await salesConfigService.listApplications());
};

/** `POST /sales/applications` */
const createApplication = async (req, res) => {
  ApiResponse.created(res, await salesConfigService.createApplication(req.body, requestContext(req)));
};

/** `PUT /sales/applications/:id` */
const updateApplication = async (req, res) => {
  ApiResponse.ok(res, await salesConfigService.updateApplication(req.params.id, req.body, requestContext(req)));
};

/** `DELETE /sales/applications/:id` */
const deleteApplication = async (req, res) => {
  await salesConfigService.deleteApplication(req.params.id, requestContext(req));
  ApiResponse.ok(res, { id: req.params.id });
};

/** `GET /sales/stage-probabilities` */
const listProbabilities = async (req, res) => {
  ApiResponse.ok(res, await salesConfigService.listProbabilities());
};

/** `PUT /sales/stage-probabilities` */
const saveProbabilities = async (req, res) => {
  ApiResponse.ok(res, await salesConfigService.saveProbabilities(req.body, requestContext(req)));
};

module.exports = {
  listApplications, createApplication, updateApplication, deleteApplication,
  listProbabilities, saveProbabilities,
};
