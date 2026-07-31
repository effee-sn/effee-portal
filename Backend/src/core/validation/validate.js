const { ValidationError } = require('../errors/AppError');

/**
 * Request validation middleware built on Zod.
 *
 * Validation happens at the transport boundary so that everything downstream —
 * controllers, services, repositories — can treat its input as already correct.
 * This is what removes the hand-rolled `if (!x) return res.status(400)` blocks
 * from controllers, and what prevents the class of bug where `"false"` or
 * `"abc"` passes a truthiness check and reaches Prisma as the wrong type.
 *
 * The parsed result **replaces** the raw input, so handlers receive coerced,
 * stripped values rather than raw strings. Zod removes unknown keys by default,
 * which also blocks mass-assignment: a caller cannot smuggle `is_system: true`
 * into a payload just because the column exists.
 */

/**
 * Turns Zod's terse defaults into something a form user can act on. A missing
 * required field otherwise reads "Invalid input: expected string, received
 * undefined"; here it becomes "This field is required".
 *
 * @param {import('zod').ZodIssue} issue
 * @returns {string}
 */
function friendlyMessage(issue) {
  const msg = issue.message || 'Invalid value';
  if (issue.code === 'invalid_type' && /received (undefined|null|nan)/i.test(msg)) {
    return 'This field is required';
  }
  if (issue.code === 'too_small' && Number(issue.minimum) === 1) {
    return 'This field is required';
  }
  return msg;
}

/**
 * Flattens a ZodError into a stable, client-friendly shape.
 *
 * @param {import('zod').ZodError} error
 * @returns {Array<{ field: string, message: string }>}
 */
function formatZodIssues(error) {
  return error.issues.map((issue) => ({
    // Empty path means the failure is on the object itself rather than a field.
    field: issue.path.length > 0 ? issue.path.join('.') : '_',
    message: friendlyMessage(issue),
  }));
}

/**
 * Builds middleware that validates named parts of the request.
 *
 * `req.query` and `req.params` are getter-only in Express 5, so validated
 * values are assigned with `Object.defineProperty` rather than direct
 * assignment, which would silently fail or throw in strict mode.
 *
 * @param {object} schemas
 * @param {import('zod').ZodType} [schemas.body]
 * @param {import('zod').ZodType} [schemas.query]
 * @param {import('zod').ZodType} [schemas.params]
 * @returns {import('express').RequestHandler}
 *
 * @example
 * const { z } = require('zod');
 * router.post('/', validate({
 *   body: z.object({
 *     name: z.string().min(1).max(120),
 *     email: z.string().email(),
 *     role_id: z.coerce.number().int().positive(),
 *   }),
 * }), asyncHandler(createUser));
 */
function validate(schemas) {
  const targets = /** @type {const} */ (['params', 'query', 'body']);

  return (req, res, next) => {
    /** @type {Array<{ field: string, message: string }>} */
    const issues = [];

    for (const target of targets) {
      const schema = schemas[target];
      if (!schema) continue;

      const result = schema.safeParse(req[target]);

      if (!result.success) {
        // Prefix so a client can tell a bad query string from a bad body.
        issues.push(...formatZodIssues(result.error).map((issue) => ({
          ...issue,
          field: target === 'body' ? issue.field : `${target}.${issue.field}`,
        })));
        continue;
      }

      if (target === 'body') {
        req.body = result.data;
      } else {
        Object.defineProperty(req, target, {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
    }

    if (issues.length > 0) {
      return next(new ValidationError('Validation failed', issues));
    }

    return next();
  };
}

module.exports = { validate, formatZodIssues };
