const { z } = require('zod');
const { schemas } = require('../../core');

/**
 * Request schemas for the service (ticket) module.
 *
 * The enum members mirror the Prisma enums exactly; Zod rejects anything else
 * at the boundary so an invalid value can never reach the database.
 */

const ticketType  = z.enum(['CALL', 'EMAIL', 'OTHERS']);
const severity    = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const status      = z.enum(['OPEN', 'IN_PROGRESS', 'CONTACTED', 'RESOLVED', 'ON_OBSERVATION', 'CLOSED', 'REOPENED']);

/** Optional support type; a blank value is omitted. */
const supportType = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.enum(['REMOTE', 'SITE_VISIT', 'AT_EFFEE']).optional()
);

const shortText = (max) => z.string().trim().min(1).max(max);

/** Optional text; blank strings normalise to undefined rather than "". */
const optionalText = (max) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

/**
 * Optional complaint date. A blank field arrives as "" from the form; it is
 * pre-processed to undefined before coercion so an empty value is simply
 * omitted rather than becoming an Invalid Date.
 */
const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.date().optional()
);

/** Optional "HH:MM" 24-hour time string. */
const optionalTime = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM (24-hour) format').optional()
);

/** Optional email; blank normalises to undefined, otherwise must be valid. */
const optionalEmail = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().trim().email('Enter a valid email').max(160).optional()
);

/** Optional department id; a blank value clears it (null). */
const optionalDeptId = z.preprocess(
  (v) => (v === '' || v === null ? null : v),
  z.coerce.number().int().positive().nullable().optional()
);

/** `GET /service/tickets` */
const listTicketsQuery = schemas.listQuery.extend({
  status:            status.optional(),
  issue_severity:    severity.optional(),
  ticket_type:       ticketType.optional(),
  production_impact: schemas.flexibleBoolean.optional(),
  customer_impact:   schemas.flexibleBoolean.optional(),
  safety_impact:     schemas.flexibleBoolean.optional(),
});

/** `GET|PUT|DELETE /service/tickets/:id` */
const ticketIdParam = schemas.idParam;

/**
 * `POST /service/tickets`
 *
 * `ticket_id` is intentionally absent — it is generated server-side. Unknown
 * keys are stripped by the validator, so a client cannot supply its own.
 */
const createTicketBody = z.object({
  ticket_type:       ticketType,
  source_details:    optionalText(60),
  company_name:      shortText(160),
  company_location:  optionalText(200),
  reported_by:       shortText(160),
  reported_by_phone: optionalText(40),
  reported_by_email: optionalEmail,
  complaint_date:    optionalDate,
  complaint_time:    optionalTime,
  machine_project:   optionalText(200),
  machine_serial_no: optionalText(120),
  issue_title:       shortText(200),
  issue_description: z.string().trim().min(1).max(5000),
  issue_severity:    severity,
  support_type:              supportType,
  production_impact:         schemas.flexibleBoolean.optional().default(false),
  production_impact_details: optionalText(2000),
  customer_impact:           schemas.flexibleBoolean.optional().default(false),
  customer_impact_details:   optionalText(2000),
  safety_impact:             schemas.flexibleBoolean.optional().default(false),
  safety_impact_details:     optionalText(2000),
}).refine((d) => d.ticket_type !== 'OTHERS' || (d.source_details && d.source_details.trim().length > 0), {
  message: 'Source details are required for an "Others" source',
  path: ['source_details'],
});

/** `PUT /service/tickets/:id` — partial update. */
const updateTicketBody = z.object({
  ticket_type:       ticketType.optional(),
  source_details:    optionalText(60),
  company_name:      shortText(160).optional(),
  company_location:  optionalText(200),
  reported_by:       shortText(160).optional(),
  complaint_date:    optionalDate,
  complaint_time:    optionalTime,
  machine_project:   optionalText(200),
  machine_serial_no: optionalText(120),
  issue_title:       shortText(200).optional(),
  issue_description: z.string().trim().min(1).max(5000).optional(),
  issue_severity:    severity.optional(),

  // Classification (triage)
  technical_category:        optionalText(120),
  originating_department_id: optionalDeptId,

  // Impacts
  production_impact:         schemas.flexibleBoolean.optional(),
  production_impact_details: optionalText(2000),
  customer_impact:           schemas.flexibleBoolean.optional(),
  customer_impact_details:   optionalText(2000),
  safety_impact:             schemas.flexibleBoolean.optional(),
  safety_impact_details:     optionalText(2000),

  // Findings (support_type is intake-only — set at creation; the plan + report
  // are authored per department task, not on the ticket)
  site_visit_notes:   optionalText(5000),

  // status, customer_confirmed and observation_until are flow-driven only —
  // set by the workflow actions, never by a manual update.
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' }
);

module.exports = {
  listTicketsQuery,
  ticketIdParam,
  createTicketBody,
  updateTicketBody,
};
