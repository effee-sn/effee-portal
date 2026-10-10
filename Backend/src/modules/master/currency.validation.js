const { z } = require('zod');

/** Request schemas for Master Data → Currencies. */

const optionalText = (max) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.date().optional()
);

// Rupees for one unit: positive, up to 6 decimals.
const rate = z.coerce.number({ required_error: 'Rate is required', invalid_type_error: 'Rate must be a number' })
  .positive('Rate must be greater than 0')
  .max(1_000_000, 'Rate looks too large')
  .refine((v) => Math.abs(v * 1e6 - Math.round(v * 1e6)) < 1e-6, 'Up to 6 decimal places');

const currencyCodeParam = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'A currency code is 3 letters'),
});

const rateIdParam = currencyCodeParam.extend({
  rateId: z.coerce.number().int().positive(),
});

const createCurrencyBody = z.object({
  code:           z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use the 3-letter code, e.g. USD'),
  name:           z.string().trim().min(1, 'Name is required').max(80),
  symbol:         z.string().trim().min(1, 'Symbol is required').max(8),
  rate,
  effective_from: optionalDate,
  note:           optionalText(191),
});

const updateCurrencyBody = z.object({
  name:      z.string().trim().min(1).max(80).optional(),
  symbol:    z.string().trim().min(1).max(8).optional(),
  is_active: z.boolean().optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'At least one field must be provided' });

const addRateBody = z.object({
  rate,
  effective_from: optionalDate,
  note:           optionalText(191),
});

module.exports = { currencyCodeParam, rateIdParam, createCurrencyBody, updateCurrencyBody, addRateBody };
