const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const { asyncHandler } = require('../../core');
const { getRoles, getUsers, getPermissions, getModules, getDepartments } = require('./lookup.controller');

const router = Router();

/**
 * Reference data for populating form controls.
 *
 * Authentication is required but no specific permission is: these are the
 * id/label pairs any form needs, and gating them per-module would break forms
 * for users who can legitimately reach the screen. The projections in the
 * repository are kept minimal precisely because access here is broad.
 */
router.use(authenticate);

router.get('/roles',       asyncHandler(getRoles));
router.get('/users',       asyncHandler(getUsers));
router.get('/permissions', asyncHandler(getPermissions));
router.get('/modules',     asyncHandler(getModules));
router.get('/departments', asyncHandler(getDepartments));

module.exports = router;
