const { notificationService } = require('./notification.service');
const { pushService } = require('./push.service');
const { parseListQuery, ApiResponse } = require('../../core');

/**
 * Notification HTTP controller.
 *
 * All endpoints act on the authenticated caller's own notifications — there is
 * no cross-user access. New surface, so it uses the `ApiResponse` envelope.
 */

/**
 * `GET /notifications` — the caller's notifications, newest first, with the
 * unread count in the meta so the bell needs a single request. `?unread=true`
 * limits to unread.
 *
 * @type {import('express').RequestHandler}
 */
const list = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: ['created_at'],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
  });

  const where = String(req.query.unread) === 'true' ? { read_at: null } : {};
  const { items, total, unread } = await notificationService.list(req.user, {
    where, skip: query.skip, take: query.take, page: query.page, limit: query.limit,
  });

  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total }, { unread });
};

/** `GET /notifications/unread-count` — just the badge number. */
const unreadCount = async (req, res) => {
  ApiResponse.ok(res, { unread: await notificationService.unreadCount(req.user) });
};

/** `POST /notifications/:id/read` — mark one read. */
const markRead = async (req, res) => {
  await notificationService.markRead(req.user, Number(req.params.id));
  ApiResponse.ok(res, { unread: await notificationService.unreadCount(req.user) });
};

/** `POST /notifications/read-all` — mark all read. */
const markAllRead = async (req, res) => {
  await notificationService.markAllRead(req.user);
  ApiResponse.ok(res, { unread: 0 });
};

// ── Web Push ──────────────────────────────────────────────────────────────────

/** `GET /notifications/push/public-key` — the VAPID key the browser subscribes with. */
const pushPublicKey = async (req, res) => {
  ApiResponse.ok(res, { publicKey: pushService.publicKey(), enabled: pushService.enabled });
};

/** `POST /notifications/push/subscribe` — store this browser's subscription. */
const pushSubscribe = async (req, res) => {
  const saved = await pushService.saveSubscription(req.user.id, req.body, req.headers['user-agent'] || null);
  ApiResponse.ok(res, { saved, enabled: pushService.enabled });
};

/** `POST /notifications/push/unsubscribe` — forget this browser's subscription. */
const pushUnsubscribe = async (req, res) => {
  await pushService.removeSubscription(req.body.endpoint);
  ApiResponse.ok(res, { ok: true });
};

module.exports = { list, unreadCount, markRead, markAllRead, pushPublicKey, pushSubscribe, pushUnsubscribe };
