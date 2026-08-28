const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for the sales customer master. */

const optionalText = (max) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

/** Optional email; blank is treated as "not provided". */
const optionalEmail = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().trim().email('Enter a valid email').max(191).optional()
);

/** Optional owner (a user id); blank on create means "no owner". */
const createOwner = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().positive().optional()
);

/** On update a blank value clears the owner (null). */
const updateOwner = z.preprocess(
  (v) => (v === '' || v === null ? null : v),
  z.coerce.number().int().positive().nullable().optional()
);

const listCustomersQuery = schemas.listQuery;
const customerIdParam    = schemas.idParam;

/** Fields shared by create and update (all optional here; create tightens name). */
const customerFields = {
  name:             z.string().trim().min(1, 'Name is required').max(191),
  gstin:            optionalText(20),
  email:            optionalEmail,
  phone:            optionalText(30),
  website:          optionalText(191),
  industry:         optionalText(120),
  billing_address:  optionalText(1000),
  shipping_address: optionalText(1000),
  city:             optionalText(120),
  state:            optionalText(120),
  state_code:       optionalText(10),
  pincode:          optionalText(12),
  notes:            optionalText(2000),
};

const createCustomerBody = z.object({
  ...customerFields,
  owner_id: createOwner,
});

const updateCustomerBody = z.object({
  name:             customerFields.name.optional(),
  gstin:            customerFields.gstin,
  email:            customerFields.email,
  phone:            customerFields.phone,
  website:          customerFields.website,
  industry:         customerFields.industry,
  billing_address:  customerFields.billing_address,
  shipping_address: customerFields.shipping_address,
  city:             customerFields.city,
  state:            customerFields.state,
  state_code:       customerFields.state_code,
  pincode:          customerFields.pincode,
  notes:            customerFields.notes,
  owner_id:         updateOwner,
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' }
);

module.exports = {
  listCustomersQuery,
  customerIdParam,
  createCustomerBody,
  updateCustomerBody,
};
