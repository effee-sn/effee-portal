const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for enquiry activities (interactions + follow-ups). */

const MEDIUMS = ['CALL', 'MEETING', 'TEAMS', 'SITE_VISIT', 'EMAIL'];
const TEMPS = ['HOT', 'WARM', 'COLD'];

const optionalText = (max) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.date().optional()
);

const optionalInt = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().positive().optional()
);

const optionalMedium = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.enum(MEDIUMS).optional()
);

const optionalTemp = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.enum(TEMPS).optional()
);

const optionalBool = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.boolean().optional()
);

// Internal participants: an array of user ids (a single value is coerced to one).
const participantIds = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Array.isArray(v) ? v : [v]),
  z.array(z.coerce.number().int().positive()).optional()
);

const enquiryIdParam = z.object({ enquiryId: z.coerce.number().int().positive() });
const activityIdParam = schemas.idParam;

const createActivityBody = z.object({
  type:                  z.enum(MEDIUMS, { required_error: 'Medium is required' }),
  activity_at:           z.coerce.date({ required_error: 'Date & time is required' }),
  duration_min:          optionalInt,
  subject:               z.string().trim().min(1, 'Subject is required').max(191),
  minutes:               optionalText(5000),
  outcome:               optionalText(2000),
  internal_participants: participantIds,
  customer_participants: optionalText(1000),
  next_action:           optionalText(2000),
  follow_up_at:          optionalDate,
  next_medium:           optionalMedium,
  temperature:           optionalTemp,
  follow_up_ended:       optionalBool,
  is_review:             optionalBool,
});

const updateActivityBody = z.object({
  type:                  optionalMedium,
  activity_at:           optionalDate,
  duration_min:          optionalInt,
  subject:               z.string().trim().min(1).max(191).optional(),
  minutes:               optionalText(5000),
  outcome:               optionalText(2000),
  internal_participants: participantIds,
  customer_participants: optionalText(1000),
  next_action:           optionalText(2000),
  follow_up_at:          optionalDate,
  next_medium:           optionalMedium,
  temperature:           optionalTemp,
  follow_up_ended:       optionalBool,
  is_review:             optionalBool,
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' }
);

module.exports = {
  MEDIUMS,
  TEMPS,
  enquiryIdParam,
  activityIdParam,
  createActivityBody,
  updateActivityBody,
};
