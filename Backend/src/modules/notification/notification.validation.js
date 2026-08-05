const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for notifications. */

/** `GET /notifications` — standard list query plus an `unread` toggle. */
const listQuery = schemas.listQuery.passthrough();

/** `POST /notifications/:id/read` */
const idParam = schemas.idParam;

/**
 * `POST /notifications/push/subscribe` — the browser's PushSubscription.
 * `endpoint` is bounded to the column width; extra fields (expirationTime) are
 * tolerated but ignored.
 */
const subscribeBody = z.object({
  endpoint: z.string().url().max(500),
  keys: z.object({
    p256dh: z.string().min(1),
    auth:   z.string().min(1),
  }),
}).passthrough();

/** `POST /notifications/push/unsubscribe` */
const unsubscribeBody = z.object({ endpoint: z.string().min(1).max(500) });

module.exports = { listQuery, idParam, subscribeBody, unsubscribeBody };
