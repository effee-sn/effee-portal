const webpush = require('web-push');

const { notificationRepository } = require('./notification.repository');
const config = require('../../config/env');
const { logger } = require('../../core/logging/logger');

/**
 * Web Push delivery.
 *
 * Sends the same events the in-app notification writes, but to the browser's
 * push service — so a recipient is notified even with the portal closed. Layered
 * on top of the notification service, which calls `sendToUsers` after storing
 * the in-app rows.
 *
 * ── Disabled without keys ────────────────────────────────────────────────────
 * When the VAPID keys are not configured, push is a no-op: `enabled` is false,
 * `publicKey()` returns null (so the client never tries to subscribe), and sends
 * do nothing. In-app notifications are unaffected.
 *
 * ── Best-effort ──────────────────────────────────────────────────────────────
 * A failed push must never fail the action that triggered it. Sends are caught;
 * a subscription the push service reports as gone (404/410) is pruned.
 *
 * @param {typeof notificationRepository} repository
 */
function createPushService(repository) {
  const { PUBLIC_KEY, PRIVATE_KEY, SUBJECT } = config.WEB_PUSH;
  const enabled = Boolean(PUBLIC_KEY && PRIVATE_KEY);

  if (enabled) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  } else {
    logger.warn('Web Push disabled: VAPID keys not configured (in-app notifications still work).');
  }

  return {
    enabled,

    /** The VAPID public key the browser needs to subscribe, or null when off. */
    publicKey() {
      return enabled ? PUBLIC_KEY : null;
    },

    /**
     * Stores a browser subscription for a user.
     * @param {number} userId
     * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} subscription
     * @param {string|null} [userAgent]
     */
    async saveSubscription(userId, subscription, userAgent = null) {
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return false;
      }
      await repository.saveSubscription({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent,
      });
      return true;
    },

    /** Removes a subscription by endpoint. */
    removeSubscription(endpoint) {
      if (!endpoint) return Promise.resolve();
      return repository.deleteSubscription(endpoint);
    },

    /**
     * Pushes a payload to every subscription of the given users. Best-effort;
     * never throws. Dead subscriptions are pruned.
     *
     * @param {number[]} userIds Already actor-filtered and de-duplicated.
     * @param {{ title: string, body?: string, url?: string }} payload
     */
    async sendToUsers(userIds, payload) {
      if (!enabled || !Array.isArray(userIds) || userIds.length === 0) return;

      try {
        const subs = await repository.subscriptionsForUsers(userIds);
        if (subs.length === 0) return;

        const body = JSON.stringify(payload);
        await Promise.all(subs.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              body,
            );
          } catch (err) {
            // 404/410 — the browser unsubscribed or the subscription expired.
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await repository.deleteSubscription(s.endpoint).catch(() => {});
            } else {
              logger.error({ err: err?.message, statusCode: err?.statusCode }, 'Web Push send failed');
            }
          }
        }));
      } catch (err) {
        logger.error({ err }, 'Web Push fan-out failed');
      }
    },
  };
}

const pushService = createPushService(notificationRepository);

module.exports = { pushService, createPushService };
