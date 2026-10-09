const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');

const {
  listEnquiriesQuery, enquiryIdParam, createEnquiryBody, updateEnquiryBody,
  winEnquiryBody, loseEnquiryBody, reassignEnquiryBody,
} = require('./enquiry.validation');
const {
  getEnquiries, getEnquiryById, getEnquiryReadiness, createEnquiry, updateEnquiry,
  winEnquiry, loseEnquiry, reopenEnquiry, reassignEnquiry, deleteEnquiry,
} = require('./enquiry.controller');

const activityValidation = require('./activity.validation');
const {
  listActivities, createActivity, updateActivity, deleteActivity,
} = require('./activity.controller');

const attachmentValidation = require('./attachment.validation');
const { docUpload, handleUploadErrors } = require('./attachment.upload');
const {
  listAttachments, uploadAttachment, downloadAttachment, markSent, deleteAttachment,
} = require('./attachment.controller');

const { updateWorkflowBody } = require('./workflow.validation');
const { getWorkflow, updateWorkflow } = require('./workflow.controller');

const configValidation = require('./config.validation');
const configController = require('./config.controller');

const { analyticsQuery } = require('./analytics.validation');
const { getAnalytics } = require('./analytics.controller');

const router = Router();

router.use(authenticate);

// ── Sales workflow config (the selected Internal Sales handler) ───────────────
router.get('/workflow', authorize('SALES_VIEW'), asyncHandler(getWorkflow));
router.put(
  '/workflow',
  authorize('SALES_EDIT'),
  validate({ body: updateWorkflowBody }),
  asyncHandler(updateWorkflow)
);

// ── Sales configuration (applications + stage probabilities) ─────────────────
// Reading is open to every sales user (the enquiry form's dropdown, the
// probability shown on an enquiry); changing needs SALES_CONFIG_* rights.
router.get('/applications', authorize('SALES_VIEW'), asyncHandler(configController.listApplications));
router.post(
  '/applications',
  authorize('SALES_CONFIG_CREATE'),
  validate({ body: configValidation.createApplicationBody }),
  asyncHandler(configController.createApplication)
);
router.put(
  '/applications/:id',
  authorize('SALES_CONFIG_EDIT'),
  validate({ params: configValidation.applicationIdParam, body: configValidation.updateApplicationBody }),
  asyncHandler(configController.updateApplication)
);
router.delete(
  '/applications/:id',
  authorize('SALES_CONFIG_DELETE'),
  validate({ params: configValidation.applicationIdParam }),
  asyncHandler(configController.deleteApplication)
);

router.get('/stage-probabilities', authorize('SALES_VIEW'), asyncHandler(configController.listProbabilities));
router.put(
  '/stage-probabilities',
  authorize('SALES_CONFIG_EDIT'),
  validate({ body: configValidation.probabilitiesBody }),
  asyncHandler(configController.saveProbabilities)
);

// ── Sales dashboard (pipeline analytics) ──────────────────────────────────────
router.get(
  '/analytics',
  authorize('SALES_VIEW'),
  validate({ query: analyticsQuery }),
  asyncHandler(getAnalytics)
);

// Customers & contacts moved to the Master Data module (/customers, /contacts).

// ── Enquiries (the pipeline) ──────────────────────────────────────────────────
router.get(
  '/enquiries',
  authorize('SALES_VIEW'),
  validate({ query: listEnquiriesQuery }),
  asyncHandler(getEnquiries)
);

router.post(
  '/enquiries',
  authorize('SALES_CREATE'),
  validate({ body: createEnquiryBody }),
  asyncHandler(createEnquiry)
);

router.get(
  '/enquiries/:id',
  authorize('SALES_VIEW'),
  validate({ params: enquiryIdParam }),
  asyncHandler(getEnquiryById)
);

router.get(
  '/enquiries/:id/readiness',
  authorize('SALES_VIEW'),
  validate({ params: enquiryIdParam }),
  asyncHandler(getEnquiryReadiness)
);

router.put(
  '/enquiries/:id',
  authorize('SALES_EDIT'),
  validate({ params: enquiryIdParam, body: updateEnquiryBody }),
  asyncHandler(updateEnquiry)
);

router.post(
  '/enquiries/:id/win',
  authorize('SALES_EDIT'),
  validate({ params: enquiryIdParam, body: winEnquiryBody }),
  asyncHandler(winEnquiry)
);

router.post(
  '/enquiries/:id/lose',
  authorize('SALES_EDIT'),
  validate({ params: enquiryIdParam, body: loseEnquiryBody }),
  asyncHandler(loseEnquiry)
);

router.post(
  '/enquiries/:id/reopen',
  authorize('SALES_EDIT'),
  validate({ params: enquiryIdParam }),
  asyncHandler(reopenEnquiry)
);

router.post(
  '/enquiries/:id/reassign',
  authorize('SALES_EDIT'),
  validate({ params: enquiryIdParam, body: reassignEnquiryBody }),
  asyncHandler(reassignEnquiry)
);

router.delete(
  '/enquiries/:id',
  authorize('SALES_DELETE'),
  validate({ params: enquiryIdParam }),
  asyncHandler(deleteEnquiry)
);

// ── Enquiry activities (interactions + follow-ups) ────────────────────────────
router.get(
  '/enquiries/:enquiryId/activities',
  authorize('SALES_VIEW'),
  validate({ params: activityValidation.enquiryIdParam }),
  asyncHandler(listActivities)
);

router.post(
  '/enquiries/:enquiryId/activities',
  authorize('SALES_EDIT'),
  validate({ params: activityValidation.enquiryIdParam, body: activityValidation.createActivityBody }),
  asyncHandler(createActivity)
);

router.put(
  '/activities/:id',
  authorize('SALES_EDIT'),
  validate({ params: activityValidation.activityIdParam, body: activityValidation.updateActivityBody }),
  asyncHandler(updateActivity)
);

router.delete(
  '/activities/:id',
  authorize('SALES_EDIT'),
  validate({ params: activityValidation.activityIdParam }),
  asyncHandler(deleteActivity)
);

// ── Enquiry attachments (documents & offers) ──────────────────────────────────
router.get(
  '/enquiries/:enquiryId/attachments',
  authorize('SALES_VIEW'),
  validate({ params: attachmentValidation.enquiryIdParam }),
  asyncHandler(listAttachments)
);

// multer must run before body validation so req.body.kind is populated.
router.post(
  '/enquiries/:enquiryId/attachments',
  authorize('SALES_EDIT'),
  handleUploadErrors(docUpload.single('file')),
  validate({ params: attachmentValidation.enquiryIdParam, body: attachmentValidation.uploadBody }),
  asyncHandler(uploadAttachment)
);

router.get(
  '/attachments/:id/download',
  authorize('SALES_VIEW'),
  validate({ params: attachmentValidation.attachmentIdParam }),
  asyncHandler(downloadAttachment)
);

router.post(
  '/attachments/:id/sent',
  authorize('SALES_EDIT'),
  validate({ params: attachmentValidation.attachmentIdParam, body: attachmentValidation.sentBody }),
  asyncHandler(markSent)
);

router.delete(
  '/attachments/:id',
  authorize('SALES_EDIT'),
  validate({ params: attachmentValidation.attachmentIdParam }),
  asyncHandler(deleteAttachment)
);

module.exports = router;
