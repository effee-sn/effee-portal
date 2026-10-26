const { z } = require('zod');

/** Request schemas for a project's BOM. */

const bomParam = z.object({
  id:    z.coerce.number().int().positive(),
  bomId: z.coerce.number().int().positive(),
});

const draftBody = z.object({
  lines: z.array(z.object({
    machine_id:  z.coerce.number().int().positive(),
    material_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number({ invalid_type_error: 'Quantity must be a number' })
      .positive('Quantity must be more than 0').max(999_999_999, 'Quantity is too large')
      .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, 'At most 3 decimals'),
    // The department it comes from (its number goes into the tags); blank = not chosen yet.
    department_id: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().positive().nullable().optional()),
    // For a subassembly: the revision to hold it at (its current one, or the one held now).
    child_revision_id: z.coerce.number().int().positive().optional().nullable(),
  })).max(2000, 'At most 2000 lines'),
});

const lockBody = z.object({ change_note: z.string().trim().max(5000, 'At most 5000 characters').optional().nullable() });

const tagsQuery = z.object({ machine_id: z.coerce.number().int().positive().optional() });

const searchQuery = z.object({
  q: z.string().max(100).optional(),
  skip: z.coerce.number().int().min(0).max(100000).optional(),
  exclude: z.string().max(4000).optional(),
});

module.exports = { bomParam, draftBody, lockBody, tagsQuery, searchQuery };
