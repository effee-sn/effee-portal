/**
 * Barrel export for the core layer.
 *
 * Modules import their infrastructure from here rather than reaching into
 * individual files, so internal reorganisation of `core/` does not ripple out
 * into every module.
 *
 * @example
 * const { asyncHandler, ApiResponse, validate, NotFoundError } = require('../../core');
 */

const {
  AppError,
  ValidationError,
  BadRequestError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ErrorCode,
} = require('./errors/AppError');

const { asyncHandler } = require('./http/asyncHandler');
const { ApiResponse, buildPaginationMeta } = require('./http/ApiResponse');
const { parseListQuery, buildSearchClause, DEFAULT_LIMIT, MAX_LIMIT } = require('./http/queryOptions');
const { validate } = require('./validation/validate');
const commonSchemas = require('./validation/commonSchemas');
const { logger } = require('./logging/logger');
const { requestLogger } = require('./logging/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

module.exports = {
  // Errors
  AppError,
  ValidationError,
  BadRequestError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ErrorCode,

  // HTTP
  asyncHandler,
  ApiResponse,
  buildPaginationMeta,
  parseListQuery,
  buildSearchClause,
  DEFAULT_LIMIT,
  MAX_LIMIT,

  // Validation
  validate,
  schemas: commonSchemas,

  // Logging
  logger,
  requestLogger,

  // Terminal middleware
  errorHandler,
  notFoundHandler,
};
