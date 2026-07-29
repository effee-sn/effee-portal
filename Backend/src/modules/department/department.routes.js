const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');
const {
  listDepartmentsQuery, departmentIdParam, createDepartmentBody, updateDepartmentBody,
} = require('./department.validation');
const {
  getDepartments, getDepartmentById, createDepartment, updateDepartment, deleteDepartment,
} = require('./department.controller');

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('DEPT_VIEW'),
  validate({ query: listDepartmentsQuery }),
  asyncHandler(getDepartments)
);

router.post(
  '/',
  authorize('DEPT_CREATE'),
  validate({ body: createDepartmentBody }),
  asyncHandler(createDepartment)
);

router.get(
  '/:id',
  authorize('DEPT_VIEW'),
  validate({ params: departmentIdParam }),
  asyncHandler(getDepartmentById)
);

router.put(
  '/:id',
  authorize('DEPT_EDIT'),
  validate({ params: departmentIdParam, body: updateDepartmentBody }),
  asyncHandler(updateDepartment)
);

router.delete(
  '/:id',
  authorize('DEPT_DELETE'),
  validate({ params: departmentIdParam }),
  asyncHandler(deleteDepartment)
);

module.exports = router;
