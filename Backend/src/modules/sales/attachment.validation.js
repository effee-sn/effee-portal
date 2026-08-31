const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for enquiry attachments. */

const KINDS = ['FORMAT_PDF', 'FORMAT_EXCEL', 'CONCEPT', 'POWER_CALC', 'COSTING', 'OFFER'];

const enquiryIdParam = z.object({ enquiryId: z.coerce.number().int().positive() });
const attachmentIdParam = schemas.idParam;

/** Multipart body — validated after multer has populated req.body. */
const uploadBody = z.object({
  kind: z.enum(KINDS, { required_error: 'Document kind is required' }),
  note: z.string().trim().max(500).optional().transform((v) => (v === '' ? undefined : v)),
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
};
