const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const { asyncHandler, validate } = require('../../core');
const { listQuery, idParam, subscribeBody, unsubscribeBody } = require('./notification.validation');
const {
  list, unreadCount, markRead, markAllRead,
  pushPublicKey, pushSubscribe, pushUnsubscribe,
} = require('./notification.controller');

const router = Router();

/**
 * Notification routes.
 *
 * Record tier: authentication only. Every endpoint is scoped to the caller's own
 * notifications / subscriptions in the service, so no permission gate is needed.
 * Fixed segments (`/unread-count`, `/read-all`, `/push/*`) are declared before
 * `/:id/read` so they aren't captured as ids.
 */
router.use(authenticate);

router.get('/', validate({ query: listQuery }), asyncHandler(list));
router.get('/unread-count', asyncHandler(unreadCount));
router.post('/read-all', asyncHandler(markAllRead));

// Web Push subscription management.
router.get('/push/public-key', asyncHandler(pushPublicKey));
router.post('/push/subscribe', validate({ body: subscribeBody }), asyncHandler(pushSubscribe));
router.post('/push/unsubscribe', validate({ body: unsubscribeBody }), asyncHandler(pushUnsubscribe));

router.post('/:id/read', validate({ params: idParam }), asyncHandler(markRead));

module.exports = router;
