const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for the projects module. */

const STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

const optionalText = (max) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.date().optional()
);

/** Optional reference id; blank on create means "not set". */
const createRef = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().positive().optional()
);

/** On update a blank value clears the reference (null). */
const updateRef = z.preprocess(
  (v) => (v === '' || v === null ? null : v),
  z.coerce.number().int().positive().nullable().optional()
);

/** The project cost: an amount (blank clears it) in a currency of the currency master. */
const cost = z.preprocess(
  (v) => (v === '' || v === null ? null : v),
  z.coerce.number({ invalid_type_error: 'Cost must be a number' }).min(0, 'Cost can\'t be negative').max(999_999_999_999, 'Cost is too large')
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most 2 decimals').nullable().optional()
);
const costCurrency = z.string().trim().toUpperCase().length(3, 'Choose a currency').optional();

const listProjectsQuery = schemas.listQuery.extend({
  status:     z.enum(STATUSES).optional(),
  owner_id:   z.coerce.number().int().positive().optional(),
  enquiry_id: z.coerce.number().int().positive().optional(),
});

const projectIdParam = schemas.idParam;
const historyQuery = z.object({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional() });

const createProjectBody = z.object({
  name:        z.string().trim().min(1, 'Name is required').max(191),
  description: optionalText(5000),
  status:      z.enum(STATUSES).optional(),
  enquiry_id:  createRef,
  owner_id:    createRef,
  start_date:  optionalDate,
  end_date:    optionalDate,
  cost,
  cost_currency: costCurrency,
});

const updateProjectBody = z.object({
  name:        z.string().trim().min(1).max(191).optional(),
  description: optionalText(5000),
  status:      z.enum(STATUSES).optional(),
  enquiry_id:  updateRef,
  owner_id:    updateRef,
  start_date:  optionalDate,
  end_date:    optionalDate,
  cost,
  cost_currency: costCurrency,
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' }
);

// A department's code (Configuration → Department Codes): letters, numbers and
// single hyphens, up to 10, kept in capitals; null (or blank) clears it.
const departmentCodeParam = z.object({ departmentId: z.coerce.number().int().positive() });
const departmentCodeBody = z.object({
  code: z.preprocess(
    (v) => (typeof v === 'string' && !v.trim() ? null : v),
    z.string().trim().toUpperCase().max(10, 'At most 10 characters')
      .regex(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, 'Letters, numbers and single hyphens only (e.g. ELE, 12, PS-01)')
      .nullable(),
  ),
});

module.exports = {
  STATUSES,
  departmentCodeParam,
  departmentCodeBody,
  historyQuery,
  listProjectsQuery,
  projectIdParam,
  createProjectBody,
  updateProjectBody,
};
