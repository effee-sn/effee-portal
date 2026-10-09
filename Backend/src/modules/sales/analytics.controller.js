const { analyticsService } = require('./analytics.service');
const { ApiResponse } = require('../../core');

/** Sales dashboard HTTP controller. */

/** `GET /sales/analytics` */
const getAnalytics = async (req, res) => {
  ApiResponse.ok(res, await analyticsService.overview(req.query));
};

module.exports = { getAnalytics };
