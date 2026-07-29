const { ErrorCode } = require('./errorCodes');

/**
 * Base class for every error the application raises deliberately.
 *
 * The distinction that matters here is `isOperational`. An operational error is
 * an expected outcome of a valid code path — a missing record, a duplicate
 * email, a failed permission check. It carries a message written for the caller
 * and is safe to return verbatim.
 *
 * Anything else — a TypeError, a broken database connection, a bug — is not
 * operational. The error handler replaces those with a generic message, because
 * their text routinely embeds queries, column names, and file paths.
 *
 * Throwing these from a service is what lets controllers stay free of
 * status-code arithmetic: the service says "this user does not exist", and the
 * transport layer decides that means 404.
 */
class AppError extends Error {
  /**
   * @param {object} params
   * @param {string} params.message Human-readable, safe to show the caller.
   * @param {number} params.statusCode HTTP status to respond with.
   * @param {string} params.code Stable machine-readable code from ErrorCode.
   * @param {unknown} [params.details] Structured context, e.g. field errors.
   * @param {Error}   [params.cause] Underlying error, preserved for logging.
   */
  constructor({ message, statusCode, code, details, cause }) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    if (cause) this.cause = cause;

    // Omits this constructor from the stack so the trace starts at the throw
    // site, which is where the useful information is.
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 — the request is syntactically valid but fails validation rules. */
class ValidationError extends AppError {
  /**
   * @param {string} [message]
   * @param {unknown} [details] Typically an array of per-field failures.
   */
  constructor(message = 'Validation failed', details) {
    super({ message, statusCode: 400, code: ErrorCode.VALIDATION_FAILED, details });
  }
}

/** 400 — a malformed request that is not a field-level validation failure. */
class BadRequestError extends AppError {
  /** @param {string} [message] */
  constructor(message = 'Bad request') {
    super({ message, statusCode: 400, code: ErrorCode.BAD_REQUEST });
  }
}

/** 401 — no valid credentials were presented. */
class UnauthenticatedError extends AppError {
  /**
   * @param {string} [message]
   * @param {string} [code]
   */
  constructor(message = 'Unauthorized', code = ErrorCode.UNAUTHENTICATED) {
    super({ message, statusCode: 401, code });
  }
}

/** 403 — authenticated, but not allowed to perform this action. */
class ForbiddenError extends AppError {
  /**
   * @param {string} [message]
   * @param {string} [code]
   */
  constructor(message = 'Forbidden', code = ErrorCode.FORBIDDEN) {
    super({ message, statusCode: 403, code });
  }
}

/** 404 — the addressed resource does not exist. */
class NotFoundError extends AppError {
  /**
   * @param {string} [resource] Singular resource name, e.g. "User".
   */
  constructor(resource = 'Resource') {
    super({
      message: `${resource} not found`,
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
    });
  }
}

/** 409 — the request conflicts with the current state of the resource. */
class ConflictError extends AppError {
  /**
   * @param {string} [message]
   * @param {string} [code]
   */
  constructor(message = 'Conflict', code = ErrorCode.CONFLICT) {
    super({ message, statusCode: 409, code });
  }
}

/** 429 — the caller has exceeded a rate limit. */
class RateLimitError extends AppError {
  /**
   * @param {string} [message]
   * @param {number} [retryAfterSecs]
   */
  constructor(message = 'Too many requests', retryAfterSecs) {
    super({
      message,
      statusCode: 429,
      code: ErrorCode.RATE_LIMITED,
      details: retryAfterSecs ? { retry_after: retryAfterSecs } : undefined,
    });
  }
}

module.exports = {
  AppError,
  ValidationError,
  BadRequestError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ErrorCode,
};
