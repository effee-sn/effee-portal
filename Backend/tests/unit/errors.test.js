const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  AppError, ValidationError, BadRequestError, UnauthenticatedError,
  ForbiddenError, NotFoundError, ConflictError, RateLimitError, ErrorCode,
} = require('../../src/core/errors/AppError');

describe('AppError hierarchy', () => {
  test('every subclass maps to its HTTP status', () => {
    const cases = [
      [new ValidationError(),      400],
      [new BadRequestError(),      400],
      [new UnauthenticatedError(), 401],
      [new ForbiddenError(),       403],
      [new NotFoundError(),        404],
      [new ConflictError(),        409],
      [new RateLimitError(),       429],
    ];

    for (const [error, status] of cases) {
      assert.equal(error.statusCode, status, `${error.name} should be ${status}`);
    }
  });

  test('all subclasses are AppError and Error instances', () => {
    for (const error of [new ValidationError(), new NotFoundError(), new ConflictError()]) {
      assert.ok(error instanceof AppError);
      assert.ok(error instanceof Error);
    }
  });

  test('errors are flagged operational so the handler can trust their message', () => {
    // Non-operational errors get a generic message because their text leaks
    // internals; operational ones are written for the caller.
    assert.equal(new NotFoundError('User').isOperational, true);
  });

  test('name reflects the concrete subclass', () => {
    assert.equal(new NotFoundError().name, 'NotFoundError');
    assert.equal(new ConflictError().name, 'ConflictError');
  });

  test('NotFoundError builds a message from the resource name', () => {
    assert.equal(new NotFoundError('User').message, 'User not found');
    assert.equal(new NotFoundError().message, 'Resource not found');
  });

  test('ValidationError carries structured field details', () => {
    const details = [{ field: 'email', message: 'Must be a valid email address' }];
    const error = new ValidationError('Validation failed', details);

    assert.equal(error.code, ErrorCode.VALIDATION_FAILED);
    assert.deepEqual(error.details, details);
  });

  test('RateLimitError exposes retry_after only when supplied', () => {
    assert.deepEqual(new RateLimitError('Slow down', 900).details, { retry_after: 900 });
    assert.equal(new RateLimitError().details, undefined);
  });

  test('accepts an overridden error code', () => {
    const error = new ForbiddenError('Nope', ErrorCode.PERMISSION_DENIED);
    assert.equal(error.code, ErrorCode.PERMISSION_DENIED);
  });

  test('captures a stack trace starting at the throw site', () => {
    const error = new NotFoundError('User');

    assert.ok(error.stack);
    assert.ok(
      !error.stack.split('\n')[1]?.includes('new NotFoundError'),
      'constructor frame should be omitted'
    );
  });

  test('ErrorCode is frozen so codes cannot drift at runtime', () => {
    assert.ok(Object.isFrozen(ErrorCode));
  });
});
