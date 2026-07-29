const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const { asyncHandler } = require('../../core');
const { getDashboard } = require('./dashboard.controller');

const router = Router();

/**
 * The dashboard is available to every authenticated user; what it contains is
 * decided per-caller by the service, based on their permissions.
 */
router.use(authenticate);

router.get('/', asyncHandler(getDashboard));

module.exports = router;
