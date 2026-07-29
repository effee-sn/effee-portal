const { auditService } = require('./audit.service');
const { parseListQuery, ApiResponse } = require('../../core');

/**
 * Audit log HTTP controller.
 *
 * This is a new endpoint with no existing frontend consumer, so unlike the
 * older modules it uses the `ApiResponse` envelope — new surfaces adopt the
 * standard, existing ones keep their shape until they are migrated
 * deliberately.
 *
 * `GET /audit-logs`
 *
 * @type {import('express').RequestHandler}
 */
const getAuditLogs = async (req, res) => {
  const query = parseListQuery(req.query, {
    sortable: ['created_at', 'action', 'entity'],
    defaultSort: 'created_at',
    defaultOrder: 'desc',
    filterable: {
      action:    (value) => value,
      entity:    (value) => value,
      entity_id: (value) => value,
      actor_id:  (value) => (Number.isInteger(Number(value)) ? Number(value) : undefined),
    },
  });

  const { items, total } = await auditService.list({
    filters: query.filters,
    skip: query.skip,
    take: query.take,
    orderBy: query.orderBy,
  });

  ApiResponse.paginated(res, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
};

module.exports = { getAuditLogs };
