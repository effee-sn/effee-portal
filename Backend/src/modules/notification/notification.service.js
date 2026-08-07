const { notificationRepository } = require('./notification.repository');
const { pushService } = require('./push.service');
const { logger } = require('../../core/logging/logger');

/**
 * Notification business logic.
 *
 * Two halves:
 *   - **Emit** (`notify`) — called from other services at each hand-off. Like
 *     the audit service it is *best-effort and never throws*: a ticket action
 *     must not fail because a notification insert did. Failures are logged.
 *   - **Read** — a user lists / counts / marks their own notifications, all
 *     scoped to the caller in the repository.
 *
 * A notification is stored per-recipient (one hand-off concerning three people
 * writes three rows), so the read side is a trivial owner-scoped query.
 *
 * @param {ReturnType<typeof import('./notification.repository').createNotificationRepository>} repository
 */
function createNotificationService(repository) {
  /** Standard event verbs. Strings, so modules can add their own. */
  const Type = Object.freeze({
    TICKET_ASSIGNED:            'TICKET_ASSIGNED',
    TICKET_REOPENED:            'TICKET_REOPENED',
    TICKET_READY_CONFIRMATION:  'TICKET_READY_CONFIRMATION',
    TICKET_COMMENT:             'TICKET_COMMENT',
    TICKET_MENTION:             'TICKET_MENTION',
    DEPT_TASK_DISPATCHED:       'DEPT_TASK_DISPATCHED',
    DEPT_TASK_ASSIGNED:         'DEPT_TASK_ASSIGNED',
    DEPT_TASK_SUBMITTED:        'DEPT_TASK_SUBMITTED',
    DEPT_TASK_RETURNED:         'DEPT_TASK_RETURNED',
    DEPT_TASK_DECLINED:         'DEPT_TASK_DECLINED',
    DEPT_TASK_REDIRECTED:       'DEPT_TASK_REDIRECTED',
  });

  return {
    Type,

    /**
     * Emits a notification to one or more recipients. Best-effort; never throws.
     *
     * The actor is filtered out — you are not notified of your own action — and
     * recipients are de-duplicated, so passing a mixed/overlapping list is safe.
     *
     * @param {object} params
     * @param {Array<number|null|undefined>} params.userIds Recipient ids.
     * @param {string} params.type One of `Type`.
     * @param {string} params.title
     * @param {string} [params.body]
     * @param {string} [params.entityType]
     * @param {string|number} [params.entityId]
     * @param {string} [params.link] Where clicking it should go.
     * @param {number|null} [params.actorId] Excluded from recipients.
     * @returns {Promise<void>}
     */
    async notify({ userIds, type, title, body, entityType, entityId, link, actorId }) {
      try {
        const recipients = [...new Set(userIds)].filter((id) => id && id !== actorId);
        if (recipients.length === 0) return;

        await repository.createMany(recipients.map((user_id) => ({
          user_id,
          type,
          title,
          body: body ?? null,
          entity_type: entityType ?? null,
          entity_id: entityId !== undefined && entityId !== null ? String(entityId) : null,
          link: link ?? null,
        })));

        // Fan the same event out to any browser push subscriptions (best-effort,
        // no-op when push is not configured).
        await pushService.sendToUsers(recipients, { title, body, url: link });
      } catch (err) {
        logger.error({ err, type, title }, 'Failed to write notification(s)');
      }
    },

    /**
     * Resolves a ticket's current assignment into the set of user ids to notify —
     * a specific user, or every active member of the assigned role/department.
     * Mirrors the inbox's visibility rule.
     *
     * @param {{ assigned_user_id?: number|null, assigned_role_id?: number|null, assigned_department_id?: number|null }} ticket
     * @returns {Promise<number[]>}
     */
    async recipientsForAssignment(ticket) {
      const ids = [];
      if (ticket?.assigned_user_id) ids.push(ticket.assigned_user_id);
      if (ticket?.assigned_role_id) ids.push(...await repository.userIdsByRole(ticket.assigned_role_id));
      if (ticket?.assigned_department_id) ids.push(...await repository.userIdsByDepartment(ticket.assigned_department_id));
      return ids;
    },

    /**
     * Active users who can act on a permission (used to route decline/oversight
     * events to whoever may redirect a declined task).
     * @param {string} code @returns {Promise<number[]>}
     */
    recipientsWithPermission(code) {
      return repository.userIdsWithPermission(code);
    },

    /**
     * The caller's notifications, newest first, with the unread count.
     * @param {{ id: number }} user
     * @param {{ where?: object, skip: number, take: number, page: number, limit: number }} query
     */
    async list(user, { where, skip, take }) {
      const { items, total, unread } = await repository.findPage(user.id, { where, skip, take });
      return { items, total, unread };
    },

    /** @param {{ id: number }} user */
    unreadCount(user) {
      return repository.unreadCount(user.id);
    },

    /** @param {{ id: number }} user @param {number} id */
    markRead(user, id) {
      return repository.markRead(user.id, id);
    },

    /** @param {{ id: number }} user */
    markAllRead(user) {
      return repository.markAllRead(user.id);
    },
  };
}

const notificationService = createNotificationService(notificationRepository);

module.exports = { notificationService, createNotificationService };
