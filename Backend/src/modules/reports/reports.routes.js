const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');

const { reportParams, reportQuery } = require('./reports.validation');
const { getCatalog, getReport, exportReport } = require('./reports.controller');

/**
 * Reports (MIS). REPORT_VIEW opens the module; each report set additionally
 * needs its business module's view permission (checked in the service).
 * Downloading needs REPORT_EXPORT.
 */
const router = Router();

router.use(authenticate);

router.get('/', authorize('REPORT_VIEW'), asyncHandler(getCatalog));

router.get(
  '/:module/:key/export',
  authorize('REPORT_EXPORT'),
  validate({ params: reportParams, query: reportQuery }),
  asyncHandler(exportReport)
);

router.get(
  '/:module/:key',
  authorize('REPORT_VIEW'),
  validate({ params: reportParams, query: reportQuery }),
  asyncHandler(getReport)
);

module.exports = router;
