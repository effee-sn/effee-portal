const { z } = require('zod');
const { schemas } = require('../../core');

/** Request schemas for issues (the issue logger). */

const TYPES = ['QUESTION', 'REQUEST', 'PROBLEM', 'BUG'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'];
const TABS = ['assigned', 'raised', 'watching', 'queue', 'all', 'record'];

const blankToUndefined = (v) => (v === '' || v === null ? undefined : v);
const optionalText = (max) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const optionalId = z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional());
const optionalDate = z.preprocess(blankToUndefined, z.coerce.date().optional());
const nullableDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional());

// Multipart forms send arrays as a JSON string (or repeated fields).
const idList = z.preprocess((v) => {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : [parsed]; } catch { return v.split(','); }
  }
  return [v];
}, z.array(z.coerce.number().int().positive()).max(20, 'Up to 20 people'));

const issueIdParam = schemas.idParam;
const fileIdParam = schemas.idParam;
const watcherParams = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

const listIssuesQuery = schemas.listQuery.extend({
  tab:         z.enum(TABS).optional(),
  // open = Open + In progress; done = Closed + Cancelled
  status:      z.enum(['open', 'resolved', 'done', ...STATUSES]).optional(),
  type:        z.enum(TYPES).optional(),
  module:      optionalText(40),
  entity_type: optionalText(40),
  entity_id:   optionalText(40),
});

const createIssueBody = z.object({
  type:        z.enum(TYPES, { errorMap: () => ({ message: 'Choose a type' }) }),
  priority:    z.preprocess(blankToUndefined, z.enum(PRIORITIES).optional()),
  title:       z.string().trim().min(1, 'Say what it is about').max(191),
  description: z.string().trim().min(1, 'Describe the issue').max(10000),
  due_date:    optionalDate,
  assignee_id:   optionalId,
  department_id: optionalId,
  watcher_ids:   idList,
  // Where it was raised (filled in by the page).
  module:       optionalText(40),
  entity_type:  optionalText(40),
  entity_id:    optionalText(40),
  entity_label: optionalText(255),
  page_url:     optionalText(500),
}).refine((d) => !(d.assignee_id && d.department_id), { message: 'Choose a person or a department, not both', path: ['assignee_id'] });

const updateIssueBody = z.object({
  title:       z.string().trim().min(1).max(191).optional(),
  description: z.string().trim().min(1).max(10000).optional(),
  priority:    z.enum(PRIORITIES).optional(),
  due_date:    nullableDate,
});

const commentBody = z.object({
  body: z.preprocess((v) => (v === undefined || v === null ? '' : v), z.string().trim().max(10000)),
});

const assignBody = z.object({
  assignee_id:   optionalId,
  department_id: optionalId,
  note:          optionalText(2000),
}).refine((d) => Boolean(d.assignee_id) !== Boolean(d.department_id), { message: 'Choose a person or a department', path: ['assignee_id'] });

const noteBody = z.object({ note: optionalText(5000) });
const requiredNoteBody = (message) => z.object({ note: z.string().trim().min(1, message).max(5000) });
const resolveBody = z.object({ resolution: z.string().trim().min(1, 'Say how it was resolved').max(5000) });
const watcherBody = z.object({ user_id: z.coerce.number().int().positive() });

module.exports = {
  TYPES, PRIORITIES, STATUSES, TABS,
  issueIdParam, fileIdParam, watcherParams, listIssuesQuery,
  createIssueBody, updateIssueBody, commentBody, assignBody, noteBody, resolveBody, watcherBody,
  reopenBody: requiredNoteBody('Say why it is reopened'),
  cancelBody: requiredNoteBody('Say why it is cancelled'),
};
