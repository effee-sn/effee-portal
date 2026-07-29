const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for resolution plans (nested under a ticket's department task). */

/** `:id` (ticket) param. */
const ticketIdParam = schemas.idParam;

/** `:id` (ticket) + `:taskId` (department task) route params. */
const taskPlansParam = z.object({
  id:     z.coerce.number().int().positive(),
  taskId: z.coerce.number().int().positive(),
});

/** `:id` (ticket) + `:taskId` + `:planId` route params. */
const planParams = z.object({
  id:     z.coerce.number().int().positive(),
  taskId: z.coerce.number().int().positive(),
  planId: z.coerce.number().int().positive(),
});

/**
 * `PUT …/plans/:planId` — save draft content.
 *
 * `content_json` is the block-editor document (free-form JSON); `content_text`
 * is its plain-text mirror for search and a no-editor fallback. Both optional
 * so a title-only save is allowed.
 */
const saveDraftBody = z.object({
  title:        z.string().trim().max(200).optional().transform((v) => (v === '' ? undefined : v)),
  content_json: z.any().optional(),
  content_text: z.string().max(50000).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Nothing to save' });

module.exports = { ticketIdParam, taskPlansParam, planParams, saveDraftBody };
