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

/** `GET /materials/drawing-options` — the BOM drawing numbers a material may use. */
const getDrawingOptions = async (req, res) => ApiResponse.ok(res, await materialService.drawingOptions(req.query));

/** `GET /materials` */
const listMaterials = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...materialService.SORTABLE_FIELDS],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    filterable: {
      material_type: (v) => (TYPES.includes(v) ? v : undefined),
      prefix_id: (v) => Number(v) || undefined,
      is_active: (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
    },
  });
  const { items, total } = await materialService.list(query);
  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
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
};
