const { z } = require('zod');

/** Request schema for the sales workflow config. */
const updateWorkflowBody = z.object({
  // The Internal Sales handler; null clears it.
  internal_user_id: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number().int().positive().nullable()
  ),
});

module.exports = { updateWorkflowBody };
