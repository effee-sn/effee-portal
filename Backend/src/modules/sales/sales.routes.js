const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');

const {
  listEnquiriesQuery, enquiryIdParam, createEnquiryBody, updateEnquiryBody,
  winEnquiryBody, loseEnquiryBody, reassignEnquiryBody, assignFromQueueBody, finalCostBody,
} = require('./enquiry.validation');
const {
  getEnquiries, getEnquiryById, getEnquiryReadiness, createEnquiry, updateEnquiry,
  winEnquiry, loseEnquiry, reopenEnquiry, reassignEnquiry, deleteEnquiry, getTeamQueue, assignFromQueue, getEnquiryFlows, setFinalCost,
} = require('./enquiry.controller');

const activityValidation = require('./activity.validation');
const followupsValidation = require('./followups.validation');
const { listFollowups, markFollowupsDone } = require('./followups.controller');
const {
  listActivities, createActivity, updateActivity, deleteActivity, markFollowUpDone,
} = require('./activity.controller');

const attachmentValidation = require('./attachment.validation');
const { docUpload, handleUploadErrors } = require('./attachment.upload');
const {
  listAttachments, uploadAttachment, downloadAttachment, markSent, deleteAttachment, setOfferValue,
} = require('./attachment.controller');

const { updateWorkflowBody } = require('./workflow.validation');
const { getWorkflow, updateWorkflow } = require('./workflow.controller');

const configValidation = require('./config.validation');
const configController = require('./config.controller');

const { analyticsQuery } = require('./analytics.validation');
const { getAnalytics } = require('./analytics.controller');

const router = Router();

// Seeing enquiries: all of them (Sales → View) or only your own (Sales own →
// View); which ones is decided in the services (access.js → enquiryScope).
const SEE = ['SALES_VIEW', 'SALES_VIEW_OWN'];

router.use(authenticate);

// ── Sales workflow config (the selected Internal Sales handler) ───────────────
router.get('/workflow', authorize(...SEE), asyncHandler(getWorkflow));
router.put(
  '/workflow',
  authorize('SALES_EDIT'),
  validate({ body: updateWorkflowBody }),
  asyncHandler(updateWorkflow)
);

// ── Sales configuration (applications, stage probabilities, reminders) ───────
// Reading is open to every sales user (the enquiry form's dropdown, the
// probability shown on an enquiry); changing needs SALES_CONFIG_* rights.
router.get('/applications', authorize(...SEE), asyncHandler(configController.listApplications));
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

router.get('/stage-probabilities', authorize(...SEE), asyncHandler(configController.listProbabilities));
router.put(
  '/stage-probabilities',
  authorize('SALES_CONFIG_EDIT'),
  validate({ body: configValidation.probabilitiesBody }),
  asyncHandler(configController.saveProbabilities)
);

router.get('/reminder-schedules', authorize(...SEE), asyncHandler(configController.listReminderSchedules));
router.put(
  '/reminder-schedules',
  authorize('SALES_CONFIG_EDIT'),
  validate({ body: configValidation.reminderSchedulesBody }),
  asyncHandler(configController.saveReminderSchedules)
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
  authorize(...SEE),
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
  authorize(...SEE),
  validate({ params: enquiryIdParam }),
  asyncHandler(getEnquiryById)
);

router.get(
  '/enquiries/:id/readiness',
  authorize(...SEE),
  validate({ params: enquiryIdParam }),
  asyncHandler(getEnquiryReadiness)
);

// What Flow Builder flows did on this enquiry (anyone who can see it).
router.get(
  '/enquiries/:id/flows',
  authorize(...SEE),
  validate({ params: enquiryIdParam }),
  asyncHandler(getEnquiryFlows)
);

// Stage moves: whoever holds it (the flow); details: Sales → Edit (checked in the service).
router.put(
  '/enquiries/:id',
  authorize(...SEE),
  validate({ params: enquiryIdParam, body: updateEnquiryBody }),
  asyncHandler(updateEnquiry)
);

router.post(
  '/enquiries/:id/win',
  authorize(...SEE),
  validate({ params: enquiryIdParam, body: winEnquiryBody }),
  asyncHandler(winEnquiry)
);

router.post(
  '/enquiries/:id/lose',
  authorize(...SEE),
  validate({ params: enquiryIdParam, body: loseEnquiryBody }),
  asyncHandler(loseEnquiry)
);

router.post(
  '/enquiries/:id/reopen',
  authorize('SALES_REASSIGN'),
  validate({ params: enquiryIdParam }),
  asyncHandler(reopenEnquiry)
);

// The final costing value — the holder's work from Costing Review on (checked in the service).
router.put(
  '/enquiries/:id/final-cost',
  authorize(...SEE),
  validate({ params: enquiryIdParam, body: finalCostBody }),
  asyncHandler(setFinalCost)
);

// Reassign has its own permission, granted per role.
router.post(
  '/enquiries/:id/reassign',
  authorize('SALES_REASSIGN'),
  validate({ params: enquiryIdParam, body: reassignEnquiryBody }),
  asyncHandler(reassignEnquiry)
);

// Department queue (Flow Builder "head picks"): no permission needed — being
// the department's head is what allows it (checked in the service).
router.get('/team-queue', asyncHandler(getTeamQueue));
router.post(
  '/enquiries/:id/assign-from-queue',
  validate({ params: enquiryIdParam, body: assignFromQueueBody }),
  asyncHandler(assignFromQueue)
);

router.delete(
  '/enquiries/:id',
  authorize('SALES_DELETE'),
  validate({ params: enquiryIdParam }),
  asyncHandler(deleteEnquiry)
);

// ── Follow-ups (Sales → Follow-ups): everyone's, or only the ones you added ─────
router.get(
  '/followups',
  authorize('SALES_FOLLOWUP_VIEW', 'SALES_FOLLOWUP_VIEW_OWN'),
  validate({ query: followupsValidation.listQuery }),
  asyncHandler(listFollowups)
);

// Super Admin only (checked in the service): mark several follow-ups done at once.
router.post(
  '/followups/mark-done',
  authorize('SALES_FOLLOWUP_VIEW', 'SALES_FOLLOWUP_VIEW_OWN'),
  validate({ body: followupsValidation.markDoneBody }),
  asyncHandler(markFollowupsDone)
);

// ── Enquiry activities (interactions + follow-ups) ────────────────────────────
router.get(
  '/enquiries/:enquiryId/activities',
  authorize(...SEE),
  validate({ params: activityValidation.enquiryIdParam }),
  asyncHandler(listActivities)
);

// Activities & reviews (checked in the service, access.js): log until Won / Lost
// with View + Create, or View while it is with you; edit your own with Sales
// activity → Edit within its stage; delete your own with Sales → Delete.
router.post(
  '/enquiries/:enquiryId/activities',
  authorize(...SEE),
  validate({ params: activityValidation.enquiryIdParam, body: activityValidation.createActivityBody }),
  asyncHandler(createActivity)
);

router.put(
  '/activities/:id',
  authorize('SALES_ACTIVITY_EDIT'),
  validate({ params: activityValidation.activityIdParam, body: activityValidation.updateActivityBody }),
  asyncHandler(updateActivity)
);

// Mark a follow-up done (the person who added it, or Sales → Edit — checked in the service).
router.post(
  '/activities/:id/follow-up-done',
  authorize(...SEE),
  validate({ params: activityValidation.activityIdParam, body: activityValidation.followUpDoneBody }),
  asyncHandler(markFollowUpDone)
);

router.delete(
  '/activities/:id',
  authorize('SALES_DELETE'),
  validate({ params: activityValidation.activityIdParam }),
  asyncHandler(deleteActivity)
);

// ── Enquiry attachments (documents & offers) ──────────────────────────────────
router.get(
  '/enquiries/:enquiryId/attachments',
  authorize(...SEE),
  validate({ params: attachmentValidation.enquiryIdParam }),
  asyncHandler(listAttachments)
);

// multer must run before body validation so req.body.kind is populated.
// Upload / replace: whoever holds the enquiry (the flow; checked in the service).
router.post(
  '/enquiries/:enquiryId/attachments',
  authorize(...SEE),
  handleUploadErrors(docUpload.single('file')),
  validate({ params: attachmentValidation.enquiryIdParam, body: attachmentValidation.uploadBody }),
  asyncHandler(uploadAttachment)
);

router.get(
  '/attachments/:id/download',
  authorize(...SEE),
  validate({ params: attachmentValidation.attachmentIdParam }),
  asyncHandler(downloadAttachment)
);

router.post(
  '/attachments/:id/sent',
  authorize(...SEE),
  validate({ params: attachmentValidation.attachmentIdParam, body: attachmentValidation.sentBody }),
  asyncHandler(markSent)
);

router.put(
  '/attachments/:id/offer-value',
  authorize(...SEE),
  validate({ params: attachmentValidation.attachmentIdParam, body: attachmentValidation.offerValueBody }),
  asyncHandler(setOfferValue)
);

router.delete(
  '/attachments/:id',
  authorize('SALES_EDIT'),
  validate({ params: attachmentValidation.attachmentIdParam }),
  asyncHandler(deleteAttachment)
);

module.exports = router;
