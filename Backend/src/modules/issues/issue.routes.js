const fs = require('fs');
const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const { asyncHandler, validate } = require('../../core');
const { issueFiles } = require('./issue.upload');
const v = require('./issue.validation');
const c = require('./issue.controller');

/**
 * Issues. Raising and working on your own issues needs no permission — the
 * service decides who may see and do what (Issues → View / Edit for all).
 */
const router = Router();
router.use(authenticate);

/** Validates a multipart request; a failure removes the files multer already saved. */
const validateUpload = (schemas) => {
  const check = validate(schemas);
  return (req, res, next) => check(req, res, (err) => {
    if (err) for (const f of req.files || []) fs.promises.unlink(f.path).catch(() => {});
    next(err);
  });
};

const id = { params: v.issueIdParam };

router.get('/', validate({ query: v.listIssuesQuery }), asyncHandler(c.listIssues));
router.get('/summary', asyncHandler(c.getSummary));
router.get('/targets', asyncHandler(c.getTargets));
router.get('/files/:id/download', validate({ params: v.fileIdParam }), asyncHandler(c.downloadFile));
router.post('/', issueFiles, validateUpload({ body: v.createIssueBody }), asyncHandler(c.createIssue));

router.get('/:id', validate(id), asyncHandler(c.getIssue));
router.put('/:id', validate({ ...id, body: v.updateIssueBody }), asyncHandler(c.updateIssue));
router.post('/:id/comments', issueFiles, validateUpload({ ...id, body: v.commentBody }), asyncHandler(c.commentIssue));
router.post('/:id/assign', validate({ ...id, body: v.assignBody }), asyncHandler(c.assignIssue));
router.post('/:id/start', validate(id), asyncHandler(c.startIssue));
router.post('/:id/resolve', validate({ ...id, body: v.resolveBody }), asyncHandler(c.resolveIssue));
router.post('/:id/close', validate({ ...id, body: v.noteBody }), asyncHandler(c.closeIssue));
router.post('/:id/reopen', validate({ ...id, body: v.reopenBody }), asyncHandler(c.reopenIssue));
router.post('/:id/cancel', validate({ ...id, body: v.cancelBody }), asyncHandler(c.cancelIssue));
router.post('/:id/watchers', validate({ ...id, body: v.watcherBody }), asyncHandler(c.addWatcher));
router.delete('/:id/watchers/:userId', validate({ params: v.watcherParams }), asyncHandler(c.removeWatcher));

module.exports = router;
