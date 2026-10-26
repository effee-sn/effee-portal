const { subassemblyService } = require('./subassembly.service');
const { parseListQuery, ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Subassemblies HTTP controller. */

/** `GET /subassemblies` */
const listSubassemblies = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...subassemblyService.SORTABLE_FIELDS], defaultSort: 'updated_at', defaultOrder: 'desc',
  });
  const { items, total } = await subassemblyService.list(query);
  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
};

/** `GET /subassemblies/material-search?q=&skip=&exclude=` — lines to add: materials and released subassemblies. */
const searchMaterials = async (req, res) => ApiResponse.ok(res, await subassemblyService.searchMaterials(req.query.q, req.query.skip, req.query.exclude));

/** `GET /subassemblies/item-options?q=&skip=` — Finished materials that could be a subassembly's item. */
const getItemOptions = async (req, res) => ApiResponse.ok(res, await subassemblyService.itemOptions(req.query.q, req.query.skip));

/** `GET /subassemblies/item-setup` — prefixes and units for a new item. */
const getItemSetup = async (req, res) => ApiResponse.ok(res, await subassemblyService.itemSetup());

/** `GET /subassemblies/revision-scheme` */
const getRevisionScheme = async (req, res) => ApiResponse.ok(res, await subassemblyService.getRevisionScheme());

/** `PUT /subassemblies/revision-scheme` */
const setRevisionScheme = async (req, res) => {
  ApiResponse.ok(res, await subassemblyService.setRevisionScheme(req.body.scheme, requestContext(req)));
};

/** `GET /subassemblies/:id` */
const getSubassembly = async (req, res) => ApiResponse.ok(res, await subassemblyService.getById(req.params.id));

/** `GET /subassemblies/:id/tree?rev=` — a revision's full structure and rolled-up material totals. */
const getTree = async (req, res) => ApiResponse.ok(res, await subassemblyService.tree(req.params.id, req.query.rev));

/** `GET /subassemblies/:id/compare?from=&to=` — what changed between two revisions. */
const compareRevisions = async (req, res) => ApiResponse.ok(res, await subassemblyService.compare(req.params.id, req.query.from, req.query.to));

/** `POST /subassemblies` — with its item and first (draft) revision. */
const createSubassembly = async (req, res) => {
  ApiResponse.created(res, await subassemblyService.create(req.body, requestContext(req)));
};

/** `PUT /subassemblies/:id` — name, drawing no., item. */
const updateSubassembly = async (req, res) => {
  ApiResponse.ok(res, await subassemblyService.updateDetails(req.params.id, req.body, requestContext(req)));
};

/** `DELETE /subassemblies/:id` */
const deleteSubassembly = async (req, res) => {
  await subassemblyService.remove(req.params.id, requestContext(req));
  ApiResponse.ok(res, { id: req.params.id });
};

/** `GET /subassemblies/:id/revisions/:revId` */
const getRevision = async (req, res) => ApiResponse.ok(res, await subassemblyService.getRevision(req.params.id, req.params.revId));

/** `POST /subassemblies/:id/revisions` — start the next revision (a draft copy of the current one). */
const newRevision = async (req, res) => {
  ApiResponse.created(res, await subassemblyService.newRevision(req.params.id, requestContext(req)));
};

/** `PUT /subassemblies/:id/revisions/:revId` — a draft's lines. */
const saveDraft = async (req, res) => {
  ApiResponse.ok(res, await subassemblyService.saveDraft(req.params.id, req.params.revId, req.body, requestContext(req)));
};

/** `POST /subassemblies/:id/revisions/:revId/release` */
const releaseRevision = async (req, res) => {
  ApiResponse.ok(res, await subassemblyService.release(req.params.id, req.params.revId, req.body, requestContext(req)));
};

/** `DELETE /subassemblies/:id/revisions/:revId` — discard a draft. */
const discardDraft = async (req, res) => {
  await subassemblyService.discardDraft(req.params.id, req.params.revId, requestContext(req));
  ApiResponse.ok(res, { id: req.params.revId });
};

module.exports = {
  listSubassemblies, searchMaterials, getItemOptions, getItemSetup, getRevisionScheme, setRevisionScheme,
  getSubassembly, getTree, compareRevisions, createSubassembly, updateSubassembly, deleteSubassembly,
  getRevision, newRevision, saveDraft, releaseRevision, discardDraft,
};
