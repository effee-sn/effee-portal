const { attachmentService } = require('./attachment.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Enquiry attachment HTTP controller. */

/** `GET /sales/enquiries/:enquiryId/attachments` */
const listAttachments = async (req, res) => {
  ApiResponse.ok(res, await attachmentService.listForEnquiry(req.params.enquiryId));
};

/** `POST /sales/enquiries/:enquiryId/attachments` (multipart; multer ran first) */
const uploadAttachment = async (req, res) => {
  const attachment = await attachmentService.record(req.params.enquiryId, req.file, req.body, requestContext(req));
  ApiResponse.created(res, attachment);
};

/** `GET /sales/attachments/:id/download` — streams the file as an attachment. */
const downloadAttachment = async (req, res) => {
  const { absPath, file_name } = await attachmentService.fileFor(req.params.id);
  res.download(absPath, file_name);
};

/** `POST /sales/attachments/:id/sent` */
const markSent = async (req, res) => {
  const attachment = await attachmentService.markSent(req.params.id, req.body.sent, requestContext(req));
  ApiResponse.ok(res, attachment);
};

/** `DELETE /sales/attachments/:id` */
const deleteAttachment = async (req, res) => {
  await attachmentService.remove(req.params.id, requestContext(req));
  ApiResponse.message(res, 'Document deleted successfully');
};

module.exports = {
  listAttachments,
  uploadAttachment,
  downloadAttachment,
  markSent,
  deleteAttachment,
};
