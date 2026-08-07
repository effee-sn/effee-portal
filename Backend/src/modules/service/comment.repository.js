const prisma = require('../../lib/prisma');

/**
 * Data-access for ticket comments (part of the service module). Only this file
 * touches Prisma for TicketComment. Soft-delete scoped.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createCommentRepository(db) {
  const commentSelect = Object.freeze({
    id: true, ticket_id: true, user_id: true, user_name: true, body: true, created_at: true,
  });

  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    /** A ticket's comments, oldest first. */
    listForTicket(ticketId) {
      return db.ticketComment.findMany({
        where: active({ ticket_id: ticketId }), select: commentSelect, orderBy: { created_at: 'asc' },
      });
    },

    /** @param {object} data */
    create(data) {
      return db.ticketComment.create({ data, select: commentSelect });
    },

    /** @param {number} id */
    findById(id) {
      return db.ticketComment.findFirst({ where: active({ id }), select: commentSelect });
    },

    /** Soft-delete a comment. @param {number} id */
    softDelete(id) {
      return db.ticketComment.update({ where: { id }, data: { deleted_at: new Date() }, select: { id: true } });
    },
  };
}

const commentRepository = createCommentRepository(prisma);

module.exports = { commentRepository, createCommentRepository };
