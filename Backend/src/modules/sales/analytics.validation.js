const { z } = require('zod');

/** Request schema for the sales dashboard (analytics) endpoint. */

const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.date().optional()
);

const analyticsQuery = z.object({
  // Inclusive calendar dates (YYYY-MM-DD). Defaults: the last 90 days.
  from: optionalDate,
  to:   optionalDate,
  owner_id: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  enquiry_type: z.enum(['GENERATED', 'INCOMING']).optional()
    .or(z.literal('').transform(() => undefined)),
}).refine((q) => !q.from || !q.to || q.from <= q.to, {
  message: '"From" must be on or before "To"',
  path: ['from'],
});

module.exports = { analyticsQuery };
