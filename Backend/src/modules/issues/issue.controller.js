const { issueService } = require('./issue.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');
const { sendFile } = require('../../lib/sendFile');

/** Issues HTTP controller. */

const ctx = requestContext;

/** `GET /issues` — a tab: assigned, raised, watching, queue, all, record. */
const listIssues = async (req, res) => {
  const q = req.query;
  const page = q.page; const limit = q.limit;
  const sort = issueService.SORTABLE_FIELDS.includes(q.sort) ? q.sort : 'updated_at';
  const { items, total } = await issueService.list({
    ...q, orderBy: { [sort]: q.order || (sort === 'due_date' ? 'asc' : 'desc') }, skip: (page - 1) * limit, take: limit,
  }, ctx(req));
  ApiResponse.paginated(res, items, { page, limit, total });
};

const getSummary = async (req, res) => ApiResponse.ok(res, await issueService.summary(ctx(req)));
const getTargets = async (req, res) => ApiResponse.ok(res, await issueService.targets());
const getIssue = async (req, res) => ApiResponse.ok(res, await issueService.getById(req.params.id, ctx(req)));
const createIssue = async (req, res) => ApiResponse.created(res, await issueService.create(req.body, req.files, ctx(req)));
const updateIssue = async (req, res) => ApiResponse.ok(res, await issueService.update(req.params.id, req.body, ctx(req)));
const commentIssue = async (req, res) => ApiResponse.created(res, await issueService.comment(req.params.id, req.body, req.files, ctx(req)));
const assignIssue = async (req, res) => ApiResponse.ok(res, await issueService.assign(req.params.id, req.body, ctx(req)));
const startIssue = async (req, res) => ApiResponse.ok(res, await issueService.start(req.params.id, ctx(req)));
const resolveIssue = async (req, res) => ApiResponse.ok(res, await issueService.resolve(req.params.id, req.body, ctx(req)));
const closeIssue = async (req, res) => ApiResponse.ok(res, await issueService.close(req.params.id, req.body, ctx(req)));
const reopenIssue = async (req, res) => ApiResponse.ok(res, await issueService.reopen(req.params.id, req.body, ctx(req)));
const cancelIssue = async (req, res) => ApiResponse.ok(res, await issueService.cancel(req.params.id, req.body, ctx(req)));
const addWatcher = async (req, res) => ApiResponse.ok(res, await issueService.addWatcher(req.params.id, req.body.user_id, ctx(req)));
const removeWatcher = async (req, res) => ApiResponse.ok(res, await issueService.removeWatcher(req.params.id, req.params.userId, ctx(req)));

/** `GET /issues/files/:id/download` */
const downloadFile = async (req, res) => {
  const { file, file_name, mime_type } = await issueService.fileFor(req.params.id, ctx(req));
  sendFile(res, file, { name: file_name, type: mime_type });
};

module.exports = {
  listIssues, getSummary, getTargets, getIssue, createIssue, updateIssue, commentIssue, assignIssue,
  startIssue, resolveIssue, closeIssue, reopenIssue, cancelIssue, addWatcher, removeWatcher, downloadFile,
};
