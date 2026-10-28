const { followupsService } = require('./followups.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** `GET /sales/followups?tab=overdue|today|upcoming|done|all&…` — Sales → Follow-ups. */
const listFollowups = async (req, res) => {
  ApiResponse.ok(res, await followupsService.list(req.query, requestContext(req)));
};

/** `POST /sales/followups/mark-done` — Super Admin: mark several follow-ups done. */
const markFollowupsDone = async (req, res) => {
  ApiResponse.ok(res, await followupsService.markDone(req.body, requestContext(req)));
};

module.exports = { listFollowups, markFollowupsDone };
