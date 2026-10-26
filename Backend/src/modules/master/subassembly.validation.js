const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for Master Data → Subassemblies. */

const idParam = schemas.idParam;
const revParam = z.object({
  id: z.coerce.number().int().positive(),
  revId: z.coerce.number().int().positive(),
});

const items = z.array(z.object({
  material_id: z.coerce.number().int().positive(),
  // For a child subassembly: the revision to hold it at (its current one, or the one held now).
  child_revision_id: z.coerce.number().int().positive().optional().nullable(),
  quantity: z.coerce.number({ invalid_type_error: 'Quantity must be a number' })
    .positive('Quantity must be more than 0').max(999_999_999, 'Quantity is too large')
    .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, 'At most 3 decimals'),
})).max(500, 'At most 500 lines on one revision');

// How a subassembly gets its own item: a new IMM code, or an existing Finished material.
const item = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('new'),
    prefix_id: z.coerce.number({ invalid_type_error: 'Choose an IMM code prefix' }).int().positive('Choose an IMM code prefix'),
    uom_id: z.coerce.number({ invalid_type_error: 'Choose a unit' }).int().positive('Choose a unit'),
    description: z.string().trim().max(5000).optional().nullable(),
  }),
  z.object({
    mode: z.literal('existing'),
    material_id: z.coerce.number({ invalid_type_error: 'Choose the material' }).int().positive('Choose the material'),
  }),
], { errorMap: () => ({ message: 'Choose how this subassembly gets its IMM code' }) });

const fields = {
  name: z.string({ required_error: 'Subassembly name is required' }).trim().min(1, 'Subassembly name is required').max(191),
  drawing_no: z.string({ required_error: 'Drawing no. is required' }).trim().min(1, 'Drawing no. is required').max(100),
  // The department it comes from; blank = none.
  department_id: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().positive().nullable().optional()),
};

const createSubassemblyBody = z.object({ ...fields, items: items.optional(), item });
// Lines change through revisions (draftBody), not here.
const updateSubassemblyBody = z.object({ ...fields, item }).partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined), { message: 'Nothing to update' },
);

const listSubassembliesQuery = z.object({
  page: z.string().optional(), limit: z.string().optional(), search: z.string().optional(),
  sort: z.string().optional(), order: z.string().optional(),
});

const searchQuery = z.object({
  q: z.string().max(100).optional(),
  skip: z.coerce.number().int().min(0).max(100000).optional(),
  exclude: z.string().max(4000).optional(),
});

const draftBody = z.object({ items });
const releaseBody = z.object({ change_note: z.string().trim().max(5000, 'At most 5000 characters').optional().nullable() });
const compareQuery = z.object({ from: z.coerce.number().int().positive(), to: z.coerce.number().int().positive() });
const treeQuery = z.object({ rev: z.coerce.number().int().positive().optional() });
const schemeBody = z.object({ scheme: z.enum(['LETTERS', 'NUMBERS'], { message: 'Choose letters or numbers' }) });

module.exports = {
  idParam, revParam, createSubassemblyBody, updateSubassemblyBody, listSubassembliesQuery, searchQuery,
  draftBody, releaseBody, compareQuery, treeQuery, schemeBody,
};
