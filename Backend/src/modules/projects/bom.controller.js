const { bomService } = require('./bom.service');
const { subassemblyService } = require('../master/subassembly.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Project BOM HTTP controller. */

/** `GET /projects/:id/bom` — the revisions, current (locked) and draft. */
const getOverview = async (req, res) => ApiResponse.ok(res, await bomService.overview(req.params.id));

/** `POST /projects/:id/bom` — start the BOM, or its next revision (a copy of the current one). */
const startRevision = async (req, res) => {
  ApiResponse.created(res, await bomService.startRevision(req.params.id, requestContext(req)));
};

/** `GET /projects/bom-material-search?q=&skip=&exclude=` — materials and released subassemblies to add. */
const searchMaterials = async (req, res) => {
  ApiResponse.ok(res, await subassemblyService.searchMaterials(req.query.q, req.query.skip, req.query.exclude));
};

/** `GET /projects/:id/bom/:bomId` */
const getBom = async (req, res) => ApiResponse.ok(res, await bomService.getBom(req.params.id, req.params.bomId));

/** `PUT /projects/:id/bom/:bomId` — a draft's lines. */
const saveDraft = async (req, res) => {
  ApiResponse.ok(res, await bomService.saveDraft(req.params.id, req.params.bomId, req.body, requestContext(req)));
};

/** `POST /projects/:id/bom/:bomId/lock` */
const lockBom = async (req, res) => {
  ApiResponse.ok(res, await bomService.lock(req.params.id, req.params.bomId, req.body, requestContext(req)));
};

/** `DELETE /projects/:id/bom/:bomId` — discard a draft. */
const discardDraft = async (req, res) => {
  await bomService.discard(req.params.id, req.params.bomId, requestContext(req));
  ApiResponse.ok(res, { id: req.params.bomId });
};

/** `GET /projects/:id/bom/:bomId/tags?machine_id=` */
const getTags = async (req, res) => ApiResponse.ok(res, await bomService.tags(req.params.id, req.params.bomId, req.query.machine_id));

/** `GET /projects/:id/bom/:bomId/totals` */
const getTotals = async (req, res) => ApiResponse.ok(res, await bomService.totals(req.params.id, req.params.bomId));

/** `GET /projects/:id/bom/:bomId/export` — a locked revision as Excel (tags and totals). */
const exportBom = async (req, res) => {
  const { buffer, filename } = await bomService.exportXlsx(req.params.id, req.params.bomId);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
};

module.exports = { getOverview, startRevision, searchMaterials, getBom, saveDraft, lockBom, discardDraft, getTags, getTotals, exportBom };
