const { reportsService } = require('./reports.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Reports (MIS) HTTP controller. */

/** `GET /reports` — the report sets this user can open. */
const getCatalog = async (req, res) => {
  ApiResponse.ok(res, reportsService.catalog(req.user));
};

/** `GET /reports/:module/:key` — a report built for on-screen viewing. */
const getReport = async (req, res) => {
  ApiResponse.ok(res, await reportsService.run(req.params.module, req.params.key, req.query, req.user));
};

/** `GET /reports/:module/:key/export?format=xlsx|csv` — the report as a file. */
const exportReport = async (req, res) => {
  const ctx = { ...requestContext(req), is_system: req.user.is_system, permissions: req.user.permissions };
  const file = await reportsService.export(req.params.module, req.params.key, req.query, req.query.format || 'xlsx', ctx);
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
};

module.exports = { getCatalog, getReport, exportReport };
