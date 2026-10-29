const { enquiryService } = require('./enquiry.service');
const { parseListQuery, ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Sales enquiry HTTP controller. */

/** `GET /sales/enquiries` */
const getEnquiries = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...enquiryService.SORTABLE_FIELDS],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    filterable: enquiryService.FILTERABLE,
  });
  const { items, total } = await enquiryService.list({ ...query, display_currency: req.query.display_currency }, requestContext(req));
  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
};

/** `GET /sales/enquiries/:id` */
const getEnquiryById = async (req, res) => {
  const display = typeof req.query.display_currency === 'string' ? req.query.display_currency.toUpperCase() : undefined;
  ApiResponse.ok(res, await enquiryService.getById(req.params.id, requestContext(req), display));
};

/** `GET /sales/enquiries/:id/readiness` — prerequisite gate status for the UI. */
const getEnquiryReadiness = async (req, res) => {
  ApiResponse.ok(res, await enquiryService.readiness(req.params.id, requestContext(req)));
};

/** `POST /sales/enquiries` */
const createEnquiry = async (req, res) => {
  const enquiry = await enquiryService.create(req.body, requestContext(req));
  ApiResponse.created(res, enquiry);
};

/** `PUT /sales/enquiries/:id` */
const updateEnquiry = async (req, res) => {
  const enquiry = await enquiryService.update(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, enquiry);
};

/** `POST /sales/enquiries/:id/win` */
const winEnquiry = async (req, res) => {
  const enquiry = await enquiryService.win(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, enquiry);
};

/** `POST /sales/enquiries/:id/lose` */
const loseEnquiry = async (req, res) => {
  const enquiry = await enquiryService.lose(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, enquiry);
};

/** `POST /sales/enquiries/:id/reopen` */
const reopenEnquiry = async (req, res) => {
  const enquiry = await enquiryService.reopen(req.params.id, requestContext(req));
  ApiResponse.ok(res, enquiry);
};

/** `POST /sales/enquiries/:id/reassign` */
const reassignEnquiry = async (req, res) => {
  const enquiry = await enquiryService.reassign(req.params.id, req.body, requestContext(req));
  ApiResponse.ok(res, enquiry);
};

/** `GET /sales/team-queue` — enquiries waiting for the caller (a department head) to assign. */
const getTeamQueue = async (req, res) => {
  ApiResponse.ok(res, await enquiryService.teamQueue(requestContext(req)));
};

/** `POST /sales/enquiries/:id/assign-from-queue` */
const assignFromQueue = async (req, res) => {
  ApiResponse.ok(res, await enquiryService.assignFromQueue(req.params.id, req.body, requestContext(req)));
};

/** `DELETE /sales/enquiries/:id` */
const deleteEnquiry = async (req, res) => {
  await enquiryService.remove(req.params.id, requestContext(req));
  ApiResponse.message(res, 'Enquiry deleted successfully');
};

module.exports = {
  getEnquiries,
  getEnquiryById,
  getEnquiryReadiness,
  createEnquiry,
  updateEnquiry,
  winEnquiry,
  loseEnquiry,
  reopenEnquiry,
  reassignEnquiry,
  deleteEnquiry,
  getTeamQueue,
  assignFromQueue,
};
