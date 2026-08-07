const { commentService } = require('./comment.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Ticket comment HTTP controller. Ticket-scoped; access enforced in the service. */

const listComments = async (req, res) =>
  ApiResponse.ok(res, await commentService.list(req.params.id, requestContext(req)));

const addComment = async (req, res) =>
  ApiResponse.created(res, await commentService.add(req.params.id, req.body.body, requestContext(req)));

const removeComment = async (req, res) =>
  ApiResponse.ok(res, await commentService.remove(req.params.id, req.params.commentId, requestContext(req)));

module.exports = { listComments, addComment, removeComment };
