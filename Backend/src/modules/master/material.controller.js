const { materialService } = require('./material.service');
const { TYPES } = require('./material.validation');
const { parseListQuery, ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Material master HTTP controller (materials + IMM code prefixes). */

/** `GET /materials/prefixes` */
const listPrefixes = async (req, res) => ApiResponse.ok(res, await materialService.listPrefixes());

/** `POST /materials/prefixes` */
const createPrefix = async (req, res) => {
  ApiResponse.created(res, await materialService.createPrefix(req.body, requestContext(req)));
};

/** `PUT /materials/prefixes/:id` */
const updatePrefix = async (req, res) => {
  ApiResponse.ok(res, await materialService.updatePrefix(req.params.id, req.body, requestContext(req)));
};

/** `DELETE /materials/prefixes/:id` */
const deletePrefix = async (req, res) => {
  await materialService.deletePrefix(req.params.id, requestContext(req));
  ApiResponse.ok(res, { id: req.params.id });
};

/** `GET /materials/drawing-options` — the subassembly drawing numbers a material may use. */
const getDrawingOptions = async (req, res) => ApiResponse.ok(res, await materialService.drawingOptions(req.query));

/**
 * The list's search, filters and sort (shared by the list and its export).
 * `kind=subassembly` keeps subassemblies' own items, `kind=part` the rest.
 */
const listQuery = (reqQuery) => {
  const query = parseListQuery(reqQuery, {
    sortable: [...materialService.SORTABLE_FIELDS],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    filterable: {
      material_type: (v) => (TYPES.includes(v) ? v : undefined),
      prefix_id: (v) => Number(v) || undefined,
      uom_id: (v) => Number(v) || undefined,
      is_active: (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
    },
  });
  if (reqQuery.kind === 'subassembly') query.filters = { ...query.filters, subassembly: { isNot: null } };
  else if (reqQuery.kind === 'part') query.filters = { ...query.filters, subassembly: null };
  return query;
};

/** `GET /materials` */
const listMaterials = async (req, res) => {
  const query = listQuery(req.query);
  const { items, total } = await materialService.list(query);
  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
};

/** `GET /materials/export` — the filtered list as an Excel file. */
const exportMaterials = async (req, res) => {
  const buffer = await materialService.exportXlsx(listQuery(req.query));
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="materials-${day}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
};

/** `POST /materials/duplicates` — bulk-entry rows that look like existing materials. */
const findDuplicates = async (req, res) => ApiResponse.ok(res, await materialService.duplicates(req.body));

/** `GET /materials/:id/where-used` */
const getWhereUsed = async (req, res) => ApiResponse.ok(res, await materialService.whereUsed(req.params.id));

/** `GET /materials/:id/history` */
const getHistory = async (req, res) => {
  const { items, total, page, limit } = await materialService.history(req.params.id, req.query);
  ApiResponse.paginated(res, items, { page, limit, total });
};

/** `GET /materials/units` */
const listUnits = async (req, res) => ApiResponse.ok(res, await materialService.listUnits());

/** `POST /materials/units` */
const createUnit = async (req, res) => {
  ApiResponse.created(res, await materialService.createUnit(req.body, requestContext(req)));
};

/** `PUT /materials/units/:id` */
const updateUnit = async (req, res) => {
  ApiResponse.ok(res, await materialService.updateUnit(req.params.id, req.body, requestContext(req)));
};

/** `DELETE /materials/units/:id` */
const deleteUnit = async (req, res) => {
  await materialService.deleteUnit(req.params.id, requestContext(req));
  ApiResponse.ok(res, { id: req.params.id });
};

/** `GET /materials/:id` */
const getMaterial = async (req, res) => ApiResponse.ok(res, await materialService.getById(req.params.id));

/** `POST /materials/bulk` — create many materials, each coded from its prefix. */
const createMaterials = async (req, res) => {
  ApiResponse.created(res, await materialService.createBulk(req.body, requestContext(req)));
};

/** `PUT /materials/:id` */
const updateMaterial = async (req, res) => {
  ApiResponse.ok(res, await materialService.update(req.params.id, req.body, requestContext(req)));
};

/** `DELETE /materials/:id` */
const deleteMaterial = async (req, res) => {
  await materialService.remove(req.params.id, requestContext(req));
  ApiResponse.ok(res, { id: req.params.id });
};

module.exports = {
  listPrefixes, createPrefix, updatePrefix, deletePrefix,
  getDrawingOptions, listMaterials, getMaterial, createMaterials, updateMaterial, deleteMaterial,
  exportMaterials, findDuplicates, getWhereUsed, getHistory,
  listUnits, createUnit, updateUnit, deleteUnit,
};
