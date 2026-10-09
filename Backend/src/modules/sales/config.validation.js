const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for Sales → Configuration. */

const STAGES = ['NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW',
  'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST'];

const optionalText = (max) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? null : v));

const applicationIdParam = schemas.idParam;

const createApplicationBody = z.object({
  name:        z.string().trim().min(1, 'Name is required').max(120),
  description: optionalText(1000),
  is_active:   z.boolean().optional(),
  sort_order:  z.coerce.number().int().min(0).max(9999).optional(),
});

const updateApplicationBody = createApplicationBody.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  { message: 'At least one field must be provided' }
);

const probabilitiesBody = z.object({
  items: z.array(z.object({
    stage:       z.enum(STAGES),
    probability: z.coerce.number().int('Whole numbers only').min(0, 'Min 0%').max(100, 'Max 100%'),
  })).min(1),
}).refine(
  (d) => new Set(d.items.map((i) => i.stage)).size === d.items.length,
  { message: 'Each stage may appear only once' }
);

module.exports = { applicationIdParam, createApplicationBody, updateApplicationBody, probabilitiesBody };
