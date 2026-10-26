const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for the department module. */

const optionalText = (max) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

const listDepartmentsQuery = schemas.listQuery;
const departmentIdParam    = schemas.idParam;

/** Optional head user id; a blank value on create is treated as "no head". */
const createHead = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().positive().optional()
);

/** On update a blank value clears the head (null). */
const updateHead = z.preprocess(
  (v) => (v === '' || v === null ? null : v),
  z.coerce.number().int().positive().nullable().optional()
);

/** Department no. (for project tag numbers): 1–999; blank = none (clears it on update). */
const deptNo = z.preprocess(
  (v) => (v === '' || v === null ? null : v),
  z.coerce.number({ invalid_type_error: 'Department no. must be a number' }).int('A whole number')
    .min(1, 'From 1').max(999, 'Up to 999').nullable().optional()
);

const createDepartmentBody = z.object({
  name:         z.string().trim().min(1, 'Name is required').max(120),
  description:  optionalText(500),
  head_user_id: createHead,
  dept_no:      deptNo,
});

const updateDepartmentBody = z.object({
  name:         z.string().trim().min(1).max(120).optional(),
  description:  optionalText(500),
  head_user_id: updateHead,
  dept_no:      deptNo,
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' }
);

module.exports = {
  listDepartmentsQuery,
  departmentIdParam,
  createDepartmentBody,
  updateDepartmentBody,
};
