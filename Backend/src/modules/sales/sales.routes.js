const { Router } = require('express');

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { asyncHandler, validate } = require('../../core');

const {
  listCustomersQuery, customerIdParam, createCustomerBody, updateCustomerBody,
} = require('./customer.validation');
const {
  getCustomers, getCustomerOptions, getCustomerById,
  createCustomer, updateCustomer, deleteCustomer,
} = require('./customer.controller');

const contactValidation = require('./contact.validation');
const {
  listContacts, createContact, updateContact, deleteContact,
} = require('./contact.controller');

const {
  listEnquiriesQuery, enquiryIdParam, createEnquiryBody, updateEnquiryBody,
  winEnquiryBody, loseEnquiryBody,
} = require('./enquiry.validation');
const {
  getEnquiries, getEnquiryById, getEnquiryReadiness, createEnquiry, updateEnquiry,
  winEnquiry, loseEnquiry, reopenEnquiry, deleteEnquiry,
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

// ── Customers ────────────────────────────────────────────────────────────────
router.get(
  '/customers',
  authorize('SALES_VIEW'),
  validate({ query: listCustomersQuery }),
  asyncHandler(getCustomers)
);

// Static path before the `:id` route so "options" is not read as an id.
router.get(
  '/customers/options',
  authorize('SALES_VIEW'),
  asyncHandler(getCustomerOptions)
);

router.post(
  '/customers',
  authorize('SALES_CREATE'),
  validate({ body: createCustomerBody }),
  asyncHandler(createCustomer)
);

router.get(
  '/customers/:id',
  authorize('SALES_VIEW'),
  validate({ params: customerIdParam }),
  asyncHandler(getCustomerById)
);

router.put(
  '/customers/:id',
  authorize('SALES_EDIT'),
  validate({ params: customerIdParam, body: updateCustomerBody }),
  asyncHandler(updateCustomer)
);

router.delete(
  '/customers/:id',
  authorize('SALES_DELETE'),
  validate({ params: customerIdParam }),
  asyncHandler(deleteCustomer)
);

// ── Contacts (nested under a customer for the collection) ─────────────────────
router.get(
  '/customers/:customerId/contacts',
  authorize('SALES_VIEW'),
  validate({ params: contactValidation.customerIdParam }),
  asyncHandler(listContacts)
);

router.post(
  '/customers/:customerId/contacts',
  authorize('SALES_CREATE'),
  validate({ params: contactValidation.customerIdParam, body: contactValidation.createContactBody }),
  asyncHandler(createContact)
);

router.put(
  '/contacts/:id',
  authorize('SALES_EDIT'),
  validate({ params: contactValidation.contactIdParam, body: contactValidation.updateContactBody }),
  asyncHandler(updateContact)
);

router.delete(
  '/contacts/:id',
  authorize('SALES_DELETE'),
  validate({ params: contactValidation.contactIdParam }),
  asyncHandler(deleteContact)
);

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
