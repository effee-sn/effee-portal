const { dashboardService } = require('./dashboard.service');

/**
 * Dashboard HTTP controller.
 *
 * Returns `{ user, orgStats? }` unchanged from the original contract; `orgStats`
 * gains a `total_users` field, which is additive and ignored by existing
 * clients.
 *
 * @type {import('express').RequestHandler}
 */
const getDashboard = async (req, res) => {
  const overview = await dashboardService.getOverview(req.user, typeof req.query.currency === 'string' ? req.query.currency.toUpperCase() : undefined);
  res.json(overview);
};

module.exports = { getDashboard };
