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

/** `POST /projects/:id/machines` — add machines, each with a new Machine ID. */
const addMachines = async (req, res) => {
  ApiResponse.created(res, await projectService.addMachines(req.params.id, req.body, requestContext(req)));
};

/** `PUT /projects/:id/machines/:machineId` */
const updateMachine = async (req, res) => {
  ApiResponse.ok(res, await projectService.updateMachine(req.params.id, req.params.machineId, req.body, requestContext(req)));
};

/** `DELETE /projects/:id/machines/:machineId` */
const removeMachine = async (req, res) => {
  await projectService.removeMachine(req.params.id, req.params.machineId, requestContext(req));
  ApiResponse.ok(res, { id: req.params.machineId });
};

/** `GET /projects/machine-numbering` */
const getMachineNumbering = async (req, res) => ApiResponse.ok(res, await projectService.getMachineNumbering());

/** `PUT /projects/machine-numbering` */
const setMachineNumbering = async (req, res) => {
  ApiResponse.ok(res, await projectService.setMachineNumbering(req.body, requestContext(req)));
};

module.exports = {
  getProjects,
  getEnquiryOptions,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addMachines,
  updateMachine,
  removeMachine,
  getMachineNumbering,
  setMachineNumbering,
};
