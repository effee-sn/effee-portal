const { Prisma } = require('@prisma/client');
const { ZodError } = require('zod');
const config = require('../../config/env');
const { logger } = require('../logging/logger');
const { AppError, ErrorCode } = require('../errors/AppError');
const { formatZodIssues } = require('../validation/validate');

/**
 * Terminal error handler — the single place an error becomes an HTTP response.
 *
 * ── Response shape is backwards compatible ───────────────────────────────────
 * The existing frontend reads `data.message` from failed responses
 * (see Frontend/lib/api.js). `message` therefore remains the first-class field
 * and keeps the same meaning. `success`, `code`, `details`, and `request_id`
 * are added alongside it, which existing callers ignore harmlessly.
 *
 * ── Disclosure policy ────────────────────────────────────────────────────────
 * Operational errors (AppError and friends) carry messages written for the
 * caller and are returned verbatim. Everything else is replaced with a generic
 * message: raw Prisma and runtime errors embed table names, column names, query
 * fragments, and file paths, all of which describe the internals of the system
 * to whoever triggered the failure.
 */

/**
 * Translates a Prisma error into an operational one.
 *
 * Without this, a duplicate email surfaces as a 500 with a message quoting the
 * failing constraint. These are expected outcomes of valid requests and belong
 * in the 4xx range with a message the caller can act on.
 *
 * @param {unknown} err
 * @returns {{ statusCode: number, code: string, message: string } | null}
 *   Null when the error is not a recognised Prisma failure.
 */
function mapPrismaError(err) {
  if (err instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'The request contained invalid data for this operation',
    };
  }

  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (err.code) {
    case 'P2002': {
      // Unique constraint violation. `meta.target` names the offending
      // column(s), which is safe and genuinely useful to the caller.
      const target = Array.isArray(err.meta?.target)
        ? err.meta.target.join(', ')
        : err.meta?.target;

      return {
        statusCode: 409,
        code: ErrorCode.DUPLICATE_ENTRY,
        message: target
          ? `A record with this ${target} already exists`
          : 'A record with these details already exists',
      };
    }

    case 'P2025':
      return {
        statusCode: 404,
        code: ErrorCode.NOT_FOUND,
        message: 'The requested record does not exist',
      };

    case 'P2003':
      return {
        statusCode: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'A referenced record does not exist',
      };

    case 'P2014':
      return {
        statusCode: 409,
        code: ErrorCode.CONFLICT,
        message: 'This record is referenced by others and cannot be changed',
      };

    case 'P2000':
      return {
        statusCode: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'A provided value is too long for its field',
      };

    default:
      // Unrecognised Prisma failure — treat as internal so nothing leaks.
      return null;
  }
}

/**
 * Express error-handling middleware.
 *
 * The four-argument signature is required: Express identifies error handlers by
 * arity, and dropping `next` silently turns this into ordinary middleware that
 * never runs.
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = 500;
  let code = ErrorCode.INTERNAL_ERROR;
  let message = 'Internal server error';
  /** @type {unknown} */
  let details;

  if (err instanceof AppError) {
    ({ statusCode, code, message, details } = err);

  } else if (err instanceof ZodError) {
    // A schema validated outside the `validate` middleware, e.g. inside a
    // service. Shaped identically so clients see one validation format.
    statusCode = 400;
    code = ErrorCode.VALIDATION_FAILED;
    message = 'Validation failed';
    details = formatZodIssues(err);

  } else {
    const prismaError = mapPrismaError(err);

    if (prismaError) {
      ({ statusCode, code, message } = prismaError);

    } else if (typeof err?.status === 'number' || typeof err?.statusCode === 'number') {
      // Errors from third-party middleware (CORS, multer, body-parser) that
      // carry a status. Their messages are library-authored, not internal
      // detail, so they are safe to pass through at 4xx.
      statusCode = err.status || err.statusCode;
      if (statusCode < 500) {
        message = err.message || message;
        code = ErrorCode.BAD_REQUEST;
      }
    }
  }

  // Log at the severity the outcome warrants. 5xx means the service is at
  // fault and the full stack is recorded; 4xx is routine and logged thinly so
  // real failures stay visible.
  const log = req.log || logger;

  if (statusCode >= 500) {
    log.error({ err, statusCode, code }, `Unhandled error: ${err?.message || 'unknown'}`);
  } else {
    log.warn({ statusCode, code, message }, 'Request failed');
  }

  res.status(statusCode).json({
    success: false,
    // Retained as the primary field for backwards compatibility with the
    // existing frontend error handling.
    message,
    code,
    ...(details !== undefined ? { details } : {}),
    ...(req.id ? { request_id: req.id } : {}),
    // A stack trace maps the codebase for an attacker; development only.
    ...(config.IS_PRODUCTION ? {} : { stack: err?.stack }),
  });
}

/**
 * Catches requests that matched no route, so an unknown path returns JSON
 * rather than Express's default HTML error page — which a `res.json()` client
 * cannot parse, turning a 404 into an opaque parse failure.
 *
 * @type {import('express').RequestHandler}
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: ErrorCode.NOT_FOUND,
    ...(req.id ? { request_id: req.id } : {}),
  });
}

module.exports = { errorHandler, notFoundHandler };
