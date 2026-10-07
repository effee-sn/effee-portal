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

module.exports = {
  STATUSES,
  listProjectsQuery,
  projectIdParam,
  createProjectBody,
  updateProjectBody,
};
