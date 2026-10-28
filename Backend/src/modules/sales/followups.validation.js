const { z } = require('zod');

/** Request schemas for Sales → Follow-ups. */

const blank = (schema) => z.preprocess((v) => (v === '' || v === null ? undefined : v), schema);

const STAGES = ['NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW',
  'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST'];
const MEDIUMS = ['CALL', 'MEETING', 'TEAMS', 'SITE_VISIT', 'EMAIL'];

const listQuery = z.object({
  tab: blank(z.enum(['overdue', 'today', 'upcoming', 'done', 'all']).optional()),
  // Inclusive calendar dates (YYYY-MM-DD) on the follow-up's date.
  from: blank(z.coerce.date().optional()),
  to: blank(z.coerce.date().optional()),
  added_by: blank(z.coerce.number().int().positive().optional()),
  stage: blank(z.enum(STAGES).optional()),
  medium: blank(z.enum(MEDIUMS).optional()),
  search: blank(z.string().trim().max(100).optional()),
  page: blank(z.coerce.number().int().min(1).optional()),
  limit: blank(z.coerce.number().int().min(1).max(500).optional()),
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"From" must be on or before "To"', path: ['from'] });

// Super Admin marking several follow-ups done at once, with one optional note.
const markDoneBody = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, 'Choose at least one follow-up').max(500, 'At most 500 at a time'),
  note: z.string().trim().max(500, 'At most 500 characters').optional().nullable(),
});

module.exports = { listQuery, markDoneBody };
