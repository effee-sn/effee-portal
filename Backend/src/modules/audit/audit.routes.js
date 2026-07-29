const { Router } = require('express');

const authenticate      = require('../../middleware/authenticate');
const requireSystemRole = require('../../middleware/requireSystemRole');
const { asyncHandler, validate, schemas } = require('../../core');
const { getAuditLogs } = require('./audit.controller');

const router = Router();

/**
 * The audit trail is restricted to system administrators.
 *
 * It records who acted on what, including failed logins with the submitted
 * email address — enough to reconstruct organisational activity and to spot
 * which accounts are being targeted. That is exactly the material that must not
 * be broadly readable, so it sits behind the strongest gate available rather
 * than a per-module permission.
 *
 * Exposed as read-only by design: there is no route to create, edit, or delete
 * an entry, because a trail the application can rewrite proves nothing.
 */
router.use(authenticate, requireSystemRole);

router.get(
  '/',
  validate({ query: schemas.listQuery.passthrough() }),
  asyncHandler(getAuditLogs)
);

module.exports = router;
