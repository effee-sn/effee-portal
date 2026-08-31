const { activityService } = require('./activity.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Enquiry activity HTTP controller. */

/** `GET /sales/enquiries/:enquiryId/activities?review=true|false` */
const listActivities = async (req, res) => {
  const { review } = req.query;
  const isReview = review === undefined ? undefined : review === 'true';
  ApiResponse.ok(res, await activityService.listForEnquiry(req.params.enquiryId, isReview));
};

/** `POST /sales/enquiries/:enquiryId/activities` */
const createActivity = async (req, res) => {
  const activity = await activityService.create(req.params.enquiryId, req.body, requestContext(req));
  ApiResponse.created(res, activity);
};

/** `PUT /sales/activities/:id` */
const updateActivity = async (req, res) => {
  const activity = await activityService.update(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, activity);
};

/** `DELETE /sales/activities/:id` */
const deleteActivity = async (req, res) => {
  await activityService.remove(req.params.id, requestContext(req));
  ApiResponse.message(res, 'Activity deleted successfully');
};

module.exports = {
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity,
};
