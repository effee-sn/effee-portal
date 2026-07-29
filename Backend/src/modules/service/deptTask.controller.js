const { deptTaskService } = require('./deptTask.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Department-task HTTP controller. Ticket-scoped; returns the full task list. */

const listTasks     = async (req, res) => ApiResponse.ok(res, await deptTaskService.list(req.params.id, req.user));
const addTask       = async (req, res) => ApiResponse.ok(res, await deptTaskService.addTask(req.params.id, req.body, requestContext(req)));
const dispatchTasks = async (req, res) => ApiResponse.ok(res, await deptTaskService.dispatch(req.params.id, requestContext(req)));
const updateTask    = async (req, res) => ApiResponse.ok(res, await deptTaskService.updateTask(req.params.id, req.params.taskId, req.body, requestContext(req)));
const removeTask    = async (req, res) => ApiResponse.ok(res, await deptTaskService.removeTask(req.params.id, req.params.taskId, requestContext(req)));
const assignResolver= async (req, res) => ApiResponse.ok(res, await deptTaskService.assignResolver(req.params.id, req.params.taskId, req.body.assignee_user_id, requestContext(req)));
const submitTask    = async (req, res) => ApiResponse.ok(res, await deptTaskService.submit(req.params.id, req.params.taskId, req.body.resolution_note, requestContext(req)));
const returnTask    = async (req, res) => ApiResponse.ok(res, await deptTaskService.returnToResolver(req.params.id, req.params.taskId, requestContext(req)));
const resolveTask   = async (req, res) => ApiResponse.ok(res, await deptTaskService.resolve(req.params.id, req.params.taskId, req.body?.resolution_note ?? null, requestContext(req)));
const declineTask   = async (req, res) => ApiResponse.ok(res, await deptTaskService.declineTask(req.params.id, req.params.taskId, req.body.reason, requestContext(req)));
const redirectTask  = async (req, res) => ApiResponse.ok(res, await deptTaskService.redirectTask(req.params.id, req.params.taskId, req.body, requestContext(req)));
const saveReport    = async (req, res) => ApiResponse.ok(res, await deptTaskService.saveReport(req.params.id, req.params.taskId, req.body, requestContext(req)));

module.exports = {
  listTasks, addTask, dispatchTasks, updateTask, removeTask,
  assignResolver, submitTask, returnTask, resolveTask, declineTask, redirectTask, saveReport,
};
