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
     * Posts a comment. Any viewer may comment while the ticket is open; a closed
     * ticket's thread is read-only. Notifies everyone involved (the ticket's
     * participants) except the author.
     */
    async add(ticketId, body, user) {
      const ticket = await ticketForView(ticketId, user);
      if (ticket.status === 'CLOSED') {
        throw new BadRequestError('This ticket is closed — comments are read-only');
      }

      const comment = await repository.create({
        ticket_id: ticketId,
        user_id: user?.id ?? null,
        user_name: user?.name ?? null,
        body,
      });

      const recipients = (ticket.participants || []).map((p) => p.user_id);
      await notificationService.notify({
        userIds: recipients,
        type: notificationService.Type.TICKET_COMMENT,
        title: `New comment on ${ticket.ticket_id}`,
        body: `${user?.name || 'Someone'}: ${snippet(body)}`,
        entityType: 'ServiceTicket', entityId: ticketId, link: ticketLink(ticketId), actorId: user?.id,
      });

      await auditService.record({
        action: 'COMMENTED', entity: 'ServiceTicket', entityId: ticketId,
        actor: user, changes: { ticket_id: ticket.ticket_id },
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
