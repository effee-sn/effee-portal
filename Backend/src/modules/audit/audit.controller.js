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

  // Date range (created_at). `date_from` is inclusive from the start of the day,
  // `date_to` inclusive to the end of the day. Invalid dates are ignored.
  const filters = { ...query.filters };
  const from = req.query.date_from ? new Date(req.query.date_from) : null;
  const to   = req.query.date_to ? new Date(req.query.date_to) : null;
  const range = {};
  if (from && !Number.isNaN(from.getTime())) range.gte = from;
  if (to && !Number.isNaN(to.getTime())) { to.setHours(23, 59, 59, 999); range.lte = to; }
  if (Object.keys(range).length > 0) filters.created_at = range;

  const { items, total } = await auditService.list({
    filters,
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
