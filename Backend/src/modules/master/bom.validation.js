const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for Master Data → BOM (subassemblies). */

const idParam = schemas.idParam;

const items = z.array(z.object({
  material_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number({ invalid_type_error: 'Quantity must be a number' })
    .positive('Quantity must be more than 0').max(999_999_999, 'Quantity is too large')
    .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, 'At most 3 decimals'),
})).max(500, 'At most 500 materials on one subassembly');

const fields = {
  name: z.string({ required_error: 'Subassembly name is required' }).trim().min(1, 'Subassembly name is required').max(191),
  drawing_no: z.string({ required_error: 'Drawing no. is required' }).trim().min(1, 'Drawing no. is required').max(100),
};

const createSubassemblyBody = z.object({ ...fields, items: items.optional() });
const updateSubassemblyBody = z.object({ ...fields, items }).partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined), { message: 'Nothing to update' },
);

const listSubassembliesQuery = z.object({
  page: z.string().optional(), limit: z.string().optional(), search: z.string().optional(),
  sort: z.string().optional(), order: z.string().optional(),
});

const materialSearchQuery = z.object({ q: z.string().max(100).optional(), skip: z.coerce.number().int().min(0).max(100000).optional(), exclude: z.string().max(4000).optional() });

module.exports = { idParam, createSubassemblyBody, updateSubassemblyBody, listSubassembliesQuery, materialSearchQuery };
