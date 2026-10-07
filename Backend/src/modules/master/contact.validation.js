const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for customer contacts (people at a customer company). */

const optionalText = (max) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

const optionalEmail = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().trim().email('Enter a valid email').max(191).optional()
);

const optionalBool = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.boolean().optional()
);

/** `:customerId` on the nested collection route. */
const customerIdParam = z.object({
  customerId: z.coerce.number().int().positive(),
});

const contactIdParam = schemas.idParam;

const createContactBody = z.object({
  name:        z.string().trim().min(1, 'Name is required').max(191),
  designation: optionalText(120),
  email:       optionalEmail,
  phone:       optionalText(30),
  is_primary:  optionalBool,
  notes:       optionalText(1000),
});

const updateContactBody = z.object({
  name:        z.string().trim().min(1).max(191).optional(),
  designation: optionalText(120),
  email:       optionalEmail,
  phone:       optionalText(30),
  is_primary:  optionalBool,
  notes:       optionalText(1000),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' }
);

module.exports = {
  customerIdParam,
  contactIdParam,
  createContactBody,
  updateContactBody,
};
