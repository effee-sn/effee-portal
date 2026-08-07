const { z } = require('zod');

/** Request schemas for ticket comments (nested under a ticket). */

const commentParams = z.object({
  id:        z.coerce.number().int().positive(),
  commentId: z.coerce.number().int().positive(),
});

const addCommentBody = z.object({
  body: z.string().trim().min(1, 'A comment is required').max(5000),
});

module.exports = { commentParams, addCommentBody };
