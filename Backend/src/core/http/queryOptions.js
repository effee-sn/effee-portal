const { ValidationError } = require('../errors/AppError');

/**
 * Parses the list-query parameters shared by every collection endpoint:
 * pagination, sorting, free-text search, and field filters.
 *
 * Centralising this does two things. It makes `?page=&limit=&sort=&order=`
 * behave identically across modules instead of each controller inventing its
 * own handling, and it forces sortable and filterable fields to be declared
 * explicitly per module.
 *
 * That whitelist is a security control, not a convenience. `orderBy` and
 * `where` keys are structural parts of the query, not bound parameters —
 * Prisma's parameterisation protects the *values*, but an unchecked field name
 * lets a caller sort by `password` to binary-search the hash, or order by a
 * relation to force an expensive join. Only declared fields are accepted.
 */

/** Default items per page when the caller does not specify one. */
const DEFAULT_LIMIT = 10;

/**
 * Hard ceiling on items per page. Without it, `?limit=1000000` is an
 * unauthenticated way to exhaust memory and saturate the database.
 */
const MAX_LIMIT = 100;

/**
 * @typedef {object} ListQuery
 * @property {number} page 1-based page number.
 * @property {number} limit Items per page, capped at MAX_LIMIT.
 * @property {number} skip Offset derived from page and limit, for Prisma.
 * @property {number} take Alias of limit, for Prisma.
 * @property {string} search Trimmed free-text search term; empty when absent.
 * @property {Record<string, 'asc'|'desc'>} orderBy Prisma orderBy clause.
 * @property {Record<string, unknown>} filters Validated equality filters.
 */

/**
 * Parses a positive integer from a query value.
 *
 * @param {unknown} value
 * @param {number} fallback Used when the value is absent or empty.
 * @param {string} field Field name, for the error message.
 * @returns {number}
 * @throws {ValidationError} When present but not a positive integer.
 */
function parsePositiveInt(value, fallback, field) {
  if (value === undefined || value === '') return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError(`${field} must be a positive whole number`);
  }
  return parsed;
}

/**
 * Parses list-query parameters against a per-module configuration.
 *
 * @param {import('express').Request['query']} query Raw `req.query`.
 * @param {object} config
 * @param {string[]} config.sortable Field names permitted in `?sort=`.
 * @param {string} [config.defaultSort] Field to sort by when none is given.
 * @param {'asc'|'desc'} [config.defaultOrder] Direction when none is given.
 * @param {Record<string, (raw: string) => unknown>} [config.filterable]
 *   Permitted filter fields, each mapped to a parser that converts the raw
 *   string to the type the column expects. A parser returning `undefined`
 *   causes the filter to be ignored.
 * @returns {ListQuery}
 * @throws {ValidationError} On an unknown sort field or malformed pagination.
 *
 * @example
 * const q = parseListQuery(req.query, {
 *   sortable: ['name', 'email', 'created_at'],
 *   defaultSort: 'created_at',
 *   defaultOrder: 'desc',
 *   filterable: { status: (v) => (['ACTIVE','INACTIVE'].includes(v) ? v : undefined) },
 * });
 * await prisma.user.findMany({ where: q.filters, orderBy: q.orderBy, skip: q.skip, take: q.take });
 */
function parseListQuery(query, config) {
  const {
    sortable = [],
    defaultSort = 'created_at',
    defaultOrder = 'desc',
    filterable = {},
  } = config || {};

  const page = parsePositiveInt(query.page, 1, 'page');
  const requestedLimit = parsePositiveInt(query.limit, DEFAULT_LIMIT, 'limit');
  const limit = Math.min(requestedLimit, MAX_LIMIT);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sortField = typeof query.sort === 'string' && query.sort.trim()
    ? query.sort.trim()
    : defaultSort;

  if (sortField !== defaultSort && !sortable.includes(sortField)) {
    throw new ValidationError(
      `Cannot sort by "${sortField}". Sortable fields: ${sortable.join(', ') || 'none'}`
    );
  }

  const order = String(query.order).toLowerCase() === 'asc' ? 'asc' : defaultOrder;

  // ── Filters ────────────────────────────────────────────────────────────────
  /** @type {Record<string, unknown>} */
  const filters = {};

  for (const [field, parse] of Object.entries(filterable)) {
    const raw = query[field];
    if (raw === undefined || raw === '') continue;

    const parsed = parse(String(raw));
    if (parsed !== undefined) filters[field] = parsed;
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  const search = typeof query.search === 'string' ? query.search.trim() : '';

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
    search,
    orderBy: { [sortField]: order },
    filters,
  };
}

/**
 * Builds a case-insensitive "contains" clause across several columns.
 *
 * PERFORMANCE — this compiles to `LIKE '%term%'`, which cannot use a B-tree
 * index and therefore scans the table. It is correct and acceptable at current
 * data volumes, and it is the wrong tool past roughly 100k rows; a FULLTEXT
 * index is the replacement. Isolated here so that change happens in one place.
 *
 * @param {string} term Already-trimmed search term.
 * @param {string[]} fields Columns to search.
 * @returns {{ OR: Array<Record<string, { contains: string }>> } | undefined}
 *   Undefined when there is nothing to search, so it can be spread safely.
 */
function buildSearchClause(term, fields) {
  if (!term || fields.length === 0) return undefined;

  return {
    OR: fields.map((field) => ({ [field]: { contains: term } })),
  };
}

module.exports = {
  parseListQuery,
  buildSearchClause,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
