const { bomService } = require('./bom.service');
const { parseListQuery, ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** BOM (subassemblies) HTTP controller. */

/** `GET /bom/subassemblies` */
const listSubassemblies = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: [...bomService.SORTABLE_FIELDS], defaultSort: 'updated_at', defaultOrder: 'desc',
  });
  const { items, total } = await bomService.list(query);
  ApiResponse.paginated(res, items, { page: query.page, limit: query.limit, total });
};

/** `GET /bom/material-search?q=` — materials to add, by IMM code / drawing no. / name. */
const searchMaterials = async (req, res) => ApiResponse.ok(res, await bomService.searchMaterials(req.query.q, req.query.skip, req.query.exclude));

/** `GET /bom/subassemblies/:id` */
const getSubassembly = async (req, res) => ApiResponse.ok(res, await bomService.getById(req.params.id));

/** `POST /bom/subassemblies` */
const createSubassembly = async (req, res) => {
  ApiResponse.created(res, await bomService.create(req.body, requestContext(req)));
};

/** `PUT /bom/subassemblies/:id` */
const updateSubassembly = async (req, res) => {
  ApiResponse.ok(res, await bomService.update(req.params.id, req.body, requestContext(req)));
};

/** `DELETE /bom/subassemblies/:id` */
const deleteSubassembly = async (req, res) => {
  await bomService.remove(req.params.id, requestContext(req));
  ApiResponse.ok(res, { id: req.params.id });
};

module.exports = { listSubassemblies, searchMaterials, getSubassembly, createSubassembly, updateSubassembly, deleteSubassembly };
