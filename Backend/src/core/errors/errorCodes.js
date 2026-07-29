/**
 * Machine-readable error codes returned alongside every error response.
 *
 * These exist so clients can branch on a stable identifier instead of matching
 * on human-readable message text, which changes with copy edits and cannot be
 * localised. The string values are part of the API contract — rename them only
 * with a version bump.
 *
 * @readonly
 * @enum {string}
 */
const ErrorCode = Object.freeze({
  // 400 — the request itself is malformed or fails business validation.
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST:       'BAD_REQUEST',

  // 401 — the caller is not authenticated.
  UNAUTHENTICATED:   'UNAUTHENTICATED',
  INVALID_TOKEN:     'INVALID_TOKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // 403 — the caller is authenticated but not permitted.
  FORBIDDEN:         'FORBIDDEN',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  ACCOUNT_INACTIVE:  'ACCOUNT_INACTIVE',

  // 404
  NOT_FOUND:         'NOT_FOUND',

  // 409 — the request conflicts with current state.
  CONFLICT:          'CONFLICT',
  DUPLICATE_ENTRY:   'DUPLICATE_ENTRY',

  // 429
  RATE_LIMITED:      'RATE_LIMITED',

  // 500+
  INTERNAL_ERROR:    'INTERNAL_ERROR',
  DATABASE_ERROR:    'DATABASE_ERROR',
});

module.exports = { ErrorCode };
