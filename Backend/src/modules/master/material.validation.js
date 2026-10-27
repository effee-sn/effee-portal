const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for the material master and its IMM code prefixes. */

const TYPES = ['FINISHED', 'BOUGHT_OUT', 'CONSUMABLE'];

const optionalText = (max) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v === '' || v == null ? null : v));
const requiredText = (label, max) => z.string({ required_error: `${label} is required` }).trim()
  .min(1, `${label} is required`).max(max, `${label} is too long`);

const idParam = schemas.idParam;

// ── Prefixes ─────────────────────────────────────────────────────────────────
const prefixFields = {
  prefix: z.string().trim().toUpperCase()
    .min(1, 'Prefix is required').max(20, 'At most 20 characters')
    .regex(/^[A-Z0-9]+$/, 'Letters and numbers only (add a separator below if needed)'),
  separator: z.enum(['', '-', '_'], { message: 'Separator must be none, - or _' }),
  digits: z.coerce.number().int().min(1, 'At least 1 digit').max(10, 'At most 10 digits'),
  next_number: z.coerce.number().int().min(1, 'Starts at 1 or more').max(9_999_999_999),
  description: optionalText(191),
  is_active: z.boolean(),
};

const createPrefixBody = z.object({
  ...prefixFields,
  separator: prefixFields.separator.optional(),
  digits: prefixFields.digits.optional(),
  next_number: prefixFields.next_number.optional(),
  is_active: prefixFields.is_active.optional(),
});
const updatePrefixBody = z.object(prefixFields).partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined), { message: 'Nothing to update' },
);

// ── Materials ────────────────────────────────────────────────────────────────
const materialFields = {
  drawing_no: optionalText(100),
  item_name: requiredText('Item name', 191),
  description: requiredText('Description', 5000),
  technical_spec: requiredText('Technical specification', 5000),
  material_type: z.enum(TYPES, { message: 'Material type must be Finished, Bought-out or Consumables' }),
  material: requiredText('Material', 191),
  uom_id: z.coerce.number({ required_error: 'Choose a unit of measure', invalid_type_error: 'Choose a unit of measure' })
    .int().positive('Choose a unit of measure'),
  remarks: optionalText(5000),
};

const bulkCreateBody = z.object({
  rows: z.array(z.object({
    prefix_id: z.coerce.number({ invalid_type_error: 'Choose an IMM code prefix' }).int().positive('Choose an IMM code prefix'),
    ...materialFields,
  })).min(1, 'Add at least one material').max(200, 'At most 200 materials at a time'),
});

const updateMaterialBody = z.object({ ...materialFields, is_active: z.boolean() }).partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined), { message: 'Nothing to update' },
);

const listMaterialsQuery = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
  order: z.string().optional(),
  material_type: z.string().optional(),
  prefix_id: z.string().optional(),
  uom_id: z.string().optional(),
  is_active: z.string().optional(),
  kind: z.enum(['subassembly', 'part']).optional(),
});

// Bulk entry's duplicate check: only the fields compared are needed.
const duplicatesBody = z.object({
  rows: z.array(z.object({
    item_name: z.string().max(191).optional().default(''),
    material: z.string().max(191).optional().default(''),
    technical_spec: z.string().max(5000).optional().default(''),
  })).min(1).max(200),
});

// ── Drawing revisions (Finished parts) ──────────────────────────────────────
const revisionParam = z.object({
  id: z.coerce.number().int().positive(),
  revId: z.coerce.number().int().positive(),
});
const revisionDraftBody = z.object({
  description: requiredText('Description', 5000),
  technical_spec: requiredText('Technical specification', 5000),
  material: requiredText('Material', 191),
}).partial().refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Nothing to update' });
const revisionReleaseBody = z.object({ change_note: z.string().trim().max(5000, 'At most 5000 characters').optional().nullable() });

const historyQuery = z.object({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional() });

// ── Units of measure ─────────────────────────────────────────────────────────
const unitFields = {
  code: z.string().trim().min(1, 'Code is required').max(20, 'At most 20 characters')
    .regex(/^[\p{L}\p{N}.\/²³ -]+$/u, 'Letters, numbers, spaces and . / - only'),
  name: requiredText('Name', 100),
  is_active: z.boolean(),
  sort_order: z.coerce.number().int().min(0).max(9999),
};
const createUnitBody = z.object({ ...unitFields, is_active: unitFields.is_active.optional(), sort_order: unitFields.sort_order.optional() });
const updateUnitBody = z.object(unitFields).partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined), { message: 'Nothing to update' },
);

const drawingCheckQuery = z.object({
  nos: z.string().max(20000).optional(),
});

module.exports = {
  drawingCheckQuery, duplicatesBody, revisionParam, revisionDraftBody, revisionReleaseBody, historyQuery, createUnitBody, updateUnitBody,
  TYPES, idParam, createPrefixBody, updatePrefixBody, bulkCreateBody, updateMaterialBody, listMaterialsQuery,
};
