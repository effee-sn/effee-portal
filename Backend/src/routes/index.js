const { Router } = require('express');

const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
const authRoutes      = require('../modules/auth/auth.routes');
const lookupRoutes    = require('../modules/lookup/lookup.routes');
const usersRoutes     = require('../modules/users/users.routes');
const rolesRoutes     = require('../modules/roles/roles.routes');
const settingsRoutes  = require('../modules/settings/settings.routes');
const auditRoutes     = require('../modules/audit/audit.routes');
const notificationRoutes = require('../modules/notification/notification.routes');
const serviceRoutes   = require('../modules/service/service.routes');
const flowRoutes      = require('../modules/flow/flow.routes');
const departmentRoutes = require('../modules/department/department.routes');

const router = Router();

/**
 * Module registry.
 *
 * Adding a feature means adding one `<name>.routes.js` under `src/modules/` and
 * one line here — the Odoo-style layout this boilerplate is built around. Each
 * module owns its own routes, validation, controller, service, and repository.
 */
router.use('/dashboard',  dashboardRoutes);
router.use('/auth',       authRoutes);
router.use('/lookup',     lookupRoutes);
router.use('/users',      usersRoutes);
router.use('/roles',      rolesRoutes);
router.use('/settings',   settingsRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/notifications', notificationRoutes);
router.use('/service',     serviceRoutes);
router.use('/flow',        flowRoutes);
router.use('/departments', departmentRoutes);

module.exports = router;
