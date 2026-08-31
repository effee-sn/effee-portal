const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for the sales enquiry (opportunity) resource. */

const TYPES = ['GENERATED', 'INCOMING'];
// Stages a user may set directly. WON / LOST are reached only through the
// dedicated win / lose actions so their close-out fields are captured.
const ACTIVE_STAGES = ['NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'FOLLOW_UP'];
const ALL_STAGES = [...ACTIVE_STAGES, 'WON', 'LOST'];

const optionalText = (max) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

const optionalMoney = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().nonnegative('Must be zero or more').optional()
);

const requiredMoney = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number({ required_error: 'Order value is required' }).nonnegative('Must be zero or more')
);

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
  stage:        z.enum(ALL_STAGES).optional(),
  enquiry_type: z.enum(TYPES).optional(),
  owner_id:     z.coerce.number().int().positive().optional(),
  customer_id:  z.coerce.number().int().positive().optional(),
});

const enquiryIdParam = schemas.idParam;

const createEnquiryBody = z.object({
  title:          z.string().trim().min(1, 'Title is required').max(191),
  customer_id:    z.coerce.number({ required_error: 'Customer is required' }).int().positive(),
  contact_id:     optionalContact,
  enquiry_type:   z.enum(TYPES).optional(),
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
  enquiry_type:   z.enum(TYPES).optional(),
  stage:          z.enum(ACTIVE_STAGES).optional(),
  description:    optionalText(2000),
  review_notes:   optionalText(5000),
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
  TYPES,
  ACTIVE_STAGES,
  ALL_STAGES,
  listEnquiriesQuery,
  enquiryIdParam,
  createEnquiryBody,
  updateEnquiryBody,
  winEnquiryBody,
  loseEnquiryBody,
};
