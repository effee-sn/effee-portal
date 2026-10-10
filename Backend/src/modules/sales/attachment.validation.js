const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for enquiry attachments. */

const KINDS = ['FORMAT_PDF', 'FORMAT_EXCEL', 'CONCEPT', 'POWER_CALC', 'COSTING', 'COSTING_REVIEW', 'OFFER'];

const enquiryIdParam = z.object({ enquiryId: z.coerce.number().int().positive() });
const attachmentIdParam = schemas.idParam;

// Offer price, in the enquiry's currency.
const optionalPrice = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number({ invalid_type_error: 'Offer price must be a number' }).nonnegative('Must be zero or more').optional()
);

/** Multipart body — validated after multer has populated req.body. */
const uploadBody = z.object({
  kind: z.enum(KINDS, { required_error: 'Document kind is required' }),
  note: z.string().trim().max(500).optional().transform((v) => (v === '' ? undefined : v)),
  // Required for OFFER uploads (checked in the service), ignored otherwise.
  offer_value: optionalPrice,
});

const offerValueBody = z.object({
  offer_value: z.coerce.number({ required_error: 'Offer price is required', invalid_type_error: 'Offer price must be a number' })
    .nonnegative('Must be zero or more'),
});

const sentBody = z.object({
  sent: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? true : v),
    z.coerce.boolean()
  ),
});

module.exports = {
  KINDS,
  enquiryIdParam,
  attachmentIdParam,
  uploadBody,
  sentBody,
  offerValueBody,
};
