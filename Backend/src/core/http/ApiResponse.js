/**
 * Helpers for the standard success response envelope.
 *
 * ── IMPORTANT: this envelope is opt-in ───────────────────────────────────────
 * The existing endpoints return unwrapped payloads — `GET /users` responds with
 * `{ users, total, page, ... }`, `GET /roles` with a bare array, `POST /login`
 * with `{ message, token, user }` — and the frontend reads those shapes
 * directly. Applying the envelope retroactively would break every page.
 *
 * So: existing endpoints keep their current shape. New endpoints use these
 * helpers. When an existing endpoint is eventually migrated, the frontend call
 * site changes in the same commit. Error responses are the exception — those
 * are already uniform (`{ message }`) and the error handler extends that shape
 * additively, so nothing breaks there.
 *
 * @example
 * // Single resource
 * ApiResponse.ok(res, user);
 * // → { success: true, data: { ... } }
 *
 * @example
 * // Paginated collection
 * ApiResponse.paginated(res, users, { page: 2, limit: 10, total: 57 });
 * // → { success: true, data: [...], meta: { pagination: { ... } } }
 */

/**
 * @typedef {object} PaginationMeta
 * @property {number} page Current 1-based page.
 * @property {number} limit Items per page.
 * @property {number} total Total matching items across all pages.
 * @property {number} pages Total number of pages.
 * @property {boolean} has_next Whether a following page exists.
 * @property {boolean} has_previous Whether a preceding page exists.
 */

/**
 * Builds pagination metadata from a page/limit/total triple.
 *
 * @param {object} params
 * @param {number} params.page
 * @param {number} params.limit
 * @param {number} params.total
 * @returns {PaginationMeta}
 */
function buildPaginationMeta({ page, limit, total }) {
  // Guard against limit 0, which would make `pages` Infinity.
  const pages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    page,
    limit,
    total,
    pages,
    has_next: page < pages,
    has_previous: page > 1,
  };
}

const ApiResponse = {
  /**
   * 200 with a data payload.
   *
   * @param {import('express').Response} res
   * @param {unknown} data
   * @param {Record<string, unknown>} [meta] Additional metadata to merge.
   * @returns {import('express').Response}
   */
  ok(res, data, meta) {
    return res.status(200).json({
      success: true,
      data,
      ...(meta ? { meta } : {}),
    });
  },

  /**
   * 201 for a newly created resource.
   *
   * @param {import('express').Response} res
   * @param {unknown} data
   * @returns {import('express').Response}
   */
  created(res, data) {
    return res.status(201).json({ success: true, data });
  },

  /**
   * 200 with a message and no resource body — deletions, acknowledgements.
   *
   * @param {import('express').Response} res
   * @param {string} message
   * @returns {import('express').Response}
   */
  message(res, message) {
    return res.status(200).json({ success: true, message });
  },

  /**
   * 204 for a successful operation with nothing to return.
   *
   * @param {import('express').Response} res
   * @returns {import('express').Response}
   */
  noContent(res) {
    return res.status(204).send();
  },

  /**
   * 200 with a collection and pagination metadata.
   *
   * @param {import('express').Response} res
   * @param {unknown[]} items
   * @param {{ page: number, limit: number, total: number }} pagination
   * @param {Record<string, unknown>} [extraMeta]
   * @returns {import('express').Response}
   */
  paginated(res, items, pagination, extraMeta) {
    return res.status(200).json({
      success: true,
      data: items,
      meta: {
        pagination: buildPaginationMeta(pagination),
        ...(extraMeta || {}),
      },
    });
  },
};

module.exports = { ApiResponse, buildPaginationMeta };
