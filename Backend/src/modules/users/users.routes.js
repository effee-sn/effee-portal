const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');
const { listUsersQuery, userIdParam, createUserBody, updateUserBody } = require('./users.validation');
const { getUsers, getOrgChart, getUserById, createUser, updateUser, deleteUser, resendInvite } = require('./users.controller');

const router = Router();

/**
 * Users routes.
 *
 * Each route reads as a pipeline, and the order is a security property:
 *
 *   authenticate → authorize → validate → handler
 *
 * Authentication precedes authorisation because permissions are resolved from
 * the authenticated user. Validation runs after both so an unauthenticated
 * caller cannot use error messages to probe the accepted shape of a payload —
 * a rejected request should reveal nothing beyond "not allowed".
 *
 * `asyncHandler` guarantees a rejected promise reaches the central error
 * handler rather than hanging the request.
 */

router.use(authenticate);

router.get(
  '/',
  authorize('USER_VIEW'),
  validate({ query: listUsersQuery }),
  asyncHandler(getUsers)
);

// Before /:id, which would otherwise take "org-chart" for an id.
router.get('/org-chart', authorize('USER_VIEW'), asyncHandler(getOrgChart));

router.get(
  '/:id',
  authorize('USER_VIEW'),
  validate({ params: userIdParam }),
  asyncHandler(getUserById)
);

router.post(
  '/',
  authorize('USER_CREATE'),
  validate({ body: createUserBody }),
  asyncHandler(createUser)
);

router.post(
  '/:id/invite',
  authorize('USER_EDIT'),
  validate({ params: userIdParam }),
  asyncHandler(resendInvite)
);

router.put(
  '/:id',
  authorize('USER_EDIT'),
  validate({ params: userIdParam, body: updateUserBody }),
  asyncHandler(updateUser)
);

router.delete(
  '/:id',
  authorize('USER_DELETE'),
  validate({ params: userIdParam }),
  asyncHandler(deleteUser)
);

module.exports = router;
