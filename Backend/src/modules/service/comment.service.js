const { commentRepository } = require('./comment.repository');
const { serviceRepository } = require('./service.repository');
const { canView, hasPermission } = require('./ticketPolicy');
const { auditService } = require('../audit/audit.service');
const { notificationService } = require('../notification/notification.service');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../../core');

const ticketLink = (id) => `/dashboard/service/tickets/${id}`;
const snippet = (text, max = 100) => {
  const t = String(text ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/**
 * Ticket comment business logic.
 *
 * Access mirrors the ticket's own view rule: anyone who may VIEW a ticket may
 * read and post to its thread. Posting (and removing) is blocked once the ticket
 * is CLOSED — the thread becomes read-only, matching the rest of the ticket.
 *
 * @param {ReturnType<typeof import('./comment.repository').createCommentRepository>} repository
 * @param {typeof serviceRepository} tickets
 */
function createCommentService(repository, tickets) {
  /** Loads the ticket and asserts the actor may view it (a non-viewer gets 404). */
  async function ticketForView(ticketId, user) {
    const ticket = await tickets.findById(ticketId);
    if (!ticket || !canView(user, ticket)) throw new NotFoundError('Ticket');
    return ticket;
  }

  return {
    /** The ticket's comment thread (view access). */
    async list(ticketId, user) {
      await ticketForView(ticketId, user);
      return repository.listForTicket(ticketId);
    },

    /**
     * Posts a comment (or a reply, when `parent_id` is given). Any viewer may
     * comment while the ticket is open; a closed ticket's thread is read-only.
     *
     * Notifies:
     *   - anyone @-mentioned (restricted to the ticket's people) → TICKET_MENTION;
     *   - everyone else involved — the ticket's participants and, for a reply,
     *     the parent comment's author → TICKET_COMMENT.
     * The author is never notified of their own comment (handled in notify()).
     *
     * @param {number} ticketId
     * @param {{ body: string, parent_id?: number, mentions?: number[] }} input
     * @param {object} user
     */
    async add(ticketId, { body, parent_id, mentions }, user) {
      const ticket = await ticketForView(ticketId, user);
      if (ticket.status === 'CLOSED') {
        throw new BadRequestError('This ticket is closed — comments are read-only');
      }

      // A reply must point at a live comment on this same ticket.
      let parent = null;
      if (parent_id) {
        parent = await repository.findById(parent_id);
        if (!parent || parent.ticket_id !== ticketId) {
          throw new BadRequestError('The comment being replied to does not exist');
        }
      }

      const comment = await repository.create({
        ticket_id: ticketId,
        parent_id: parent_id ?? null,
        user_id: user?.id ?? null,
        user_name: user?.name ?? null,
        body,
      });

      // Mentions are restricted to the ticket's people (participants).
      const participantIds = (ticket.participants || []).map((p) => p.user_id);
      const participantSet = new Set(participantIds);
      const mentionIds = [...new Set(mentions || [])].filter((mid) => participantSet.has(mid));
      const mentionSet = new Set(mentionIds);

      // Everyone else to keep in the loop: participants + the parent author.
      const commentIds = [...participantIds, parent?.user_id].filter(
        (uid) => uid && !mentionSet.has(uid),
      );

      await notificationService.notify({
        userIds: mentionIds,
        type: notificationService.Type.TICKET_MENTION,
        title: `${user?.name || 'Someone'} mentioned you on ${ticket.ticket_id}`,
        body: snippet(body),
        entityType: 'ServiceTicket', entityId: ticketId, link: ticketLink(ticketId), actorId: user?.id,
      });
      await notificationService.notify({
        userIds: commentIds,
        type: notificationService.Type.TICKET_COMMENT,
        title: `${parent ? 'New reply' : 'New comment'} on ${ticket.ticket_id}`,
        body: `${user?.name || 'Someone'}: ${snippet(body)}`,
        entityType: 'ServiceTicket', entityId: ticketId, link: ticketLink(ticketId), actorId: user?.id,
      });

      await auditService.record({
        action: 'COMMENTED', entity: 'ServiceTicket', entityId: ticketId,
        actor: user, changes: { ticket_id: ticket.ticket_id, reply: Boolean(parent) },
      });
      return comment;
    },

    /**
     * Removes a comment. The author may remove their own; an editor/admin may
     * remove any. Not allowed once the ticket is closed.
     */
    async remove(ticketId, commentId, user) {
      const ticket = await ticketForView(ticketId, user);
      const comment = await repository.findById(commentId);
      if (!comment || comment.ticket_id !== ticketId) throw new NotFoundError('Comment');

      const isAuthor = comment.user_id === user?.id;
      if (!isAuthor && !hasPermission(user, 'SERVICE_EDIT')) {
        throw new ForbiddenError('You can only remove your own comment');
      }
      if (ticket.status === 'CLOSED') {
        throw new BadRequestError('This ticket is closed — comments are read-only');
      }

      await repository.softDelete(commentId);
      return repository.listForTicket(ticketId);
    },
  };
}

const commentService = createCommentService(commentRepository, serviceRepository);

module.exports = { commentService, createCommentService };
