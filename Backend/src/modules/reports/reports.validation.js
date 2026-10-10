const { z } = require('zod');

/** Request schemas for the Reports (MIS) module. */

const blankToUndefined = (schema) => z.preprocess((v) => (v === '' || v === null ? undefined : v), schema);
const optionalId = blankToUndefined(z.coerce.number().int().positive().optional());

const reportParams = z.object({
  module: z.string().trim().regex(/^[a-z-]+$/),
  key: z.string().trim().regex(/^[a-z0-9-]+$/),
});

const STAGES = ['NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW',
  'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST'];

const reportQuery = z.object({
  // Inclusive calendar dates (YYYY-MM-DD). Default: this financial year to date.
  from: blankToUndefined(z.coerce.date().optional()),
  to: blankToUndefined(z.coerce.date().optional()),
  owner_id: optionalId,
  application_id: optionalId,
  customer_id: optionalId,
  enquiry_type: blankToUndefined(z.enum(['GENERATED', 'INCOMING']).optional()),
  stage: blankToUndefined(z.enum(STAGES).optional()),
  format: blankToUndefined(z.enum(['xlsx', 'csv']).optional()),
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"From" must be on or before "To"', path: ['from'] })
  .refine(
    (q) => !q.from || !q.to || (q.to.getTime() - q.from.getTime()) <= 5 * 366 * 24 * 60 * 60 * 1000,
    { message: 'A report can cover at most 5 years', path: ['from'] },
  );

module.exports = { reportParams, reportQuery };
