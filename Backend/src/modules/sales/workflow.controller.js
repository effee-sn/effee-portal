const { workflowService } = require('./workflow.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Sales workflow config HTTP controller. */

/** `GET /sales/workflow` */
const getWorkflow = async (req, res) => {
  ApiResponse.ok(res, await workflowService.get());
};

/** `PUT /sales/workflow` */
const updateWorkflow = async (req, res) => {
  ApiResponse.ok(res, await workflowService.update(req.body, requestContext(req)));
};

module.exports = { getWorkflow, updateWorkflow };
