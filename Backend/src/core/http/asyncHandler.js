/**
 * Wraps an async route handler so a rejected promise reaches the error
 * middleware.
 *
 * Express 5 already forwards rejections from async handlers, so this is not
 * strictly required on this stack. It is used anyway for two reasons:
 *
 *   1. Intent. A wrapped handler declares that its failures are meant to be
 *      handled centrally, which is easy to verify by reading the routes file.
 *   2. Portability. The behaviour no longer depends on an Express version
 *      detail, so an upgrade or a move to another router cannot silently turn
 *      a handled rejection into an unhandled one.
 *
 * @template {import('express').RequestHandler} T
 * @param {T} handler
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.get('/:id', asyncHandler(async (req, res) => {
 *   const user = await usersService.getById(req.params.id); // may throw NotFoundError
 *   res.json(user);
 * }));
 */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
