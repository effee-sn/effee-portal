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

const listProjectsQuery = schemas.listQuery.extend({
  status:     z.enum(STATUSES).optional(),
  owner_id:   z.coerce.number().int().positive().optional(),
  enquiry_id: z.coerce.number().int().positive().optional(),
});

const projectIdParam = schemas.idParam;

const createProjectBody = z.object({
  name:        z.string().trim().min(1, 'Name is required').max(191),
  description: optionalText(5000),
  status:      z.enum(STATUSES).optional(),
  enquiry_id:  createRef,
  owner_id:    createRef,
  start_date:  optionalDate,
  end_date:    optionalDate,
  // How many machines (each given its Machine ID) the project starts with.
  machines:    z.coerce.number().int().min(0, 'Zero or more').max(50, 'At most 50 at a time').optional(),
});

const updateProjectBody = z.object({
  name:        z.string().trim().min(1).max(191).optional(),
  description: optionalText(5000),
  status:      z.enum(STATUSES).optional(),
  enquiry_id:  updateRef,
  owner_id:    updateRef,
  start_date:  optionalDate,
  end_date:    optionalDate,
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' }
);

// ── Machines ─────────────────────────────────────────────────────────────────
const machineParam = z.object({
  id:        z.coerce.number().int().positive(),
  machineId: z.coerce.number().int().positive(),
});

const nullableText = (max) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v === '' || v == null ? null : v));

const addMachinesBody = z.object({
  count: z.coerce.number().int().min(1, 'At least 1').max(50, 'At most 50 at a time').optional(),
  name:  nullableText(191),
});

const updateMachineBody = z.object({
  name:        nullableText(191),
  description: nullableText(5000),
}).refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Nothing to update' });

// Machine ID numbering: prefix + separator + zero-padded number.
const machineNumberingBody = z.object({
  prefix: z.string().trim().toUpperCase().min(1, 'Prefix is required').max(20, 'At most 20 characters')
    .regex(/^[A-Z0-9]+$/, 'Letters and numbers only (add a separator if needed)'),
  separator:   z.enum(['', '-', '_'], { message: 'Separator must be none, - or _' }),
  digits:      z.coerce.number().int().min(1, 'At least 1 digit').max(10, 'At most 10 digits'),
  next_number: z.coerce.number().int().min(1, 'Starts at 1 or more').max(9_999_999_999),
}).partial().refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Nothing to update' });

module.exports = {
  STATUSES,
  listProjectsQuery,
  projectIdParam,
  createProjectBody,
  updateProjectBody,
  machineParam,
  addMachinesBody,
  updateMachineBody,
  machineNumberingBody,
};
