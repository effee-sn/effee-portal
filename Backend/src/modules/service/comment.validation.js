const { z } = require('zod');

/** Request schemas for ticket comments (nested under a ticket). */

const commentParams = z.object({
  id:        z.coerce.number().int().positive(),
  commentId: z.coerce.number().int().positive(),
});

const addCommentBody = z.object({
  body: z.string().trim().min(1, 'A comment is required').max(5000),
  // Optional: the comment being replied to (threading).
  parent_id: z.coerce.number().int().positive().optional(),
  // Optional: user ids @-mentioned in the body (validated against the ticket's
  // people in the service). Bounded so a request can't carry an unbounded list.
  mentions: z.array(z.coerce.number().int().positive()).max(50).optional(),
});

module.exports = { commentParams, addCommentBody };
