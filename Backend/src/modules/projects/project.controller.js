const { projectService } = require('./project.service');
const { parseListQuery, ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Projects HTTP controller. Uses the `ApiResponse` envelope. */

/** `GET /projects` */
const getProjects = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...projectService.SORTABLE_FIELDS],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    filterable: projectService.FILTERABLE,
  });
  const { items, total } = await projectService.list(query);
  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
};

/** `GET /projects/enquiry-options` — won, not-yet-linked enquiries for the picker. */
const getEnquiryOptions = async (req, res) => {
  const search  = typeof req.query.search === 'string' ? req.query.search : '';
  const allowId = Number(req.query.allow) || undefined;
  ApiResponse.ok(res, await projectService.enquiryOptions({ search, allowId }));
};

/** `GET /projects/:id` */
const getProjectById = async (req, res) => {
  ApiResponse.ok(res, await projectService.getById(req.params.id));
};

/** `POST /projects` */
const createProject = async (req, res) => {
  const project = await projectService.create(req.body, requestContext(req));
  ApiResponse.created(res, project);
};

/** `PUT /projects/:id` */
const updateProject = async (req, res) => {
  const project = await projectService.update(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, project);
};

/** `DELETE /projects/:id` */
const deleteProject = async (req, res) => {
  await projectService.remove(req.params.id, requestContext(req));
  ApiResponse.message(res, 'Project deleted successfully');
};

/** `GET /projects/:id/history` */
const getProjectHistory = async (req, res) => {
  const { items, total, page, limit } = await projectService.history(req.params.id, req.query);
  ApiResponse.paginated(res, items, { page, limit, total });
};

/** `GET /projects/department-codes` */
const getDepartmentCodes = async (req, res) => ApiResponse.ok(res, await projectService.listDepartmentCodes());

/** `PUT /projects/department-codes/:departmentId` — `{ code }`, null to clear. */
const setDepartmentCode = async (req, res) => {
  ApiResponse.ok(res, await projectService.setDepartmentCode(req.params.departmentId, req.body, requestContext(req)));
};

module.exports = {
  getProjectHistory,
  getDepartmentCodes,
  setDepartmentCode,
  getProjects,
  getEnquiryOptions,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
};
