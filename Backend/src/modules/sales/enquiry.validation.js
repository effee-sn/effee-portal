const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for the sales enquiry (opportunity) resource. */

const SOURCES = ['CALL', 'EMAIL', 'WALK_IN', 'EXHIBITION', 'REFERRAL', 'WEBSITE', 'OTHER'];
// Stages a user may set directly. WON / LOST are reached only through the
// dedicated win / lose actions so their close-out fields are captured.
const ACTIVE_STAGES = ['NEW', 'QUALIFIED', 'QUOTATION', 'NEGOTIATION', 'ON_HOLD'];

const optionalText = (max) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

/** Optional positive money value; blank → undefined. */
const optionalMoney = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().nonnegative('Must be zero or more').optional()
);

const requiredMoney = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number({ required_error: 'Order value is required' }).nonnegative('Must be zero or more')
);

/** Optional date (accepts yyyy-mm-dd or ISO); blank → undefined. */
const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.date().optional()
);

const optionalContact = z.preprocess(
  (v) => (v === '' || v === null ? null : v),
  z.coerce.number().int().positive().nullable().optional()
);

const optionalOwner = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().positive().optional()
);

const listEnquiriesQuery = schemas.listQuery.extend({
  stage:       z.enum(['NEW', 'QUALIFIED', 'QUOTATION', 'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD']).optional(),
  owner_id:    z.coerce.number().int().positive().optional(),
  customer_id: z.coerce.number().int().positive().optional(),
});

const enquiryIdParam = schemas.idParam;

const createEnquiryBody = z.object({
  title:          z.string().trim().min(1, 'Title is required').max(191),
  customer_id:    z.coerce.number({ required_error: 'Customer is required' }).int().positive(),
  contact_id:     optionalContact,
  source:         z.enum(SOURCES).optional(),
  stage:          z.enum(ACTIVE_STAGES).optional(),
  description:    optionalText(2000),
  expected_value: optionalMoney,
  expected_close: optionalDate,
  owner_id:       optionalOwner,
});

const updateEnquiryBody = z.object({
  title:          z.string().trim().min(1).max(191).optional(),
  customer_id:    z.coerce.number().int().positive().optional(),
  contact_id:     optionalContact,
  source:         z.enum(SOURCES).optional(),
  stage:          z.enum(ACTIVE_STAGES).optional(),
  description:    optionalText(2000),
  expected_value: optionalMoney,
  expected_close: optionalDate,
  owner_id:       optionalOwner,
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' }
);

const winEnquiryBody = z.object({
  order_no:    optionalText(120),
  order_value: requiredMoney,
  order_date:  optionalDate,
});

const loseEnquiryBody = z.object({
  lost_reason: z.string().trim().min(1, 'A reason is required').max(1000),
});

module.exports = {
  SOURCES,
  ACTIVE_STAGES,
  listEnquiriesQuery,
  enquiryIdParam,
  createEnquiryBody,
  updateEnquiryBody,
  winEnquiryBody,
  loseEnquiryBody,
};
