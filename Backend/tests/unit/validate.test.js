const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-characters-long';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const { validate } = require('../../src/core/validation/validate');
const schemas = require('../../src/core/validation/commonSchemas');
const { ValidationError } = require('../../src/core/errors/AppError');

/**
 * Runs the middleware against a fake request and resolves with the outcome.
 *
 * @param {object} schemaSet
 * @param {object} req
 * @returns {Promise<{ error: unknown, req: object }>}
 */
function run(schemaSet, req) {
  return new Promise((resolve) => {
    validate(schemaSet)(req, {}, (error) => resolve({ error, req }));
  });
}

describe('validate middleware', () => {
  test('passes a valid body through', async () => {
    const { error } = await run(
      { body: z.object({ name: z.string() }) },
      { body: { name: 'ok' } }
    );
    assert.equal(error, undefined);
  });

  test('replaces the body with coerced values', async () => {
    const { req } = await run(
      { body: z.object({ id: z.coerce.number().int() }) },
      { body: { id: '42' } }
    );

    assert.equal(req.body.id, 42);
    assert.equal(typeof req.body.id, 'number');
  });

  test('strips unknown keys to block mass assignment', async () => {
    // A caller must not be able to set a column simply by naming it.
    const { req } = await run(
      { body: z.object({ name: z.string() }) },
      { body: { name: 'ok', is_system: true, id: 9999, deleted_at: null } }
    );

    assert.deepEqual(req.body, { name: 'ok' });
  });

  test('reports a ValidationError with per-field detail', async () => {
    const { error } = await run(
      { body: z.object({ email: z.string().email(), age: z.number() }) },
      { body: { email: 'nope', age: 'not-a-number' } }
    );

    assert.ok(error instanceof ValidationError);
    assert.equal(error.statusCode, 400);

    const fields = error.details.map((issue) => issue.field);
    assert.ok(fields.includes('email'));
    assert.ok(fields.includes('age'));
  });

  test('prefixes query and param issues so their origin is clear', async () => {
    const { error } = await run(
      { query: z.object({ page: z.coerce.number().int().positive() }) },
      { query: { page: 'abc' } }
    );

    assert.ok(error instanceof ValidationError);
    assert.ok(error.details[0].field.startsWith('query.'), error.details[0].field);
  });

  test('assigns to the getter-only query property without throwing', async () => {
    // Express 5 exposes req.query through a getter, so plain assignment fails.
    const req = { query: { page: '2' } };
    Object.defineProperty(req, 'query', { value: { page: '2' }, writable: false, configurable: true });

    const result = await run({ query: z.object({ page: z.coerce.number() }) }, req);

    assert.equal(result.error, undefined);
    assert.equal(req.query.page, 2);
  });

  test('collects issues from every part of the request at once', async () => {
    const { error } = await run(
      {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body:   z.object({ name: z.string().min(1) }),
      },
      { params: { id: 'abc' }, body: { name: '' } }
    );

    assert.equal(error.details.length, 2, 'should not stop at the first failure');
  });
});

describe('commonSchemas', () => {
  test('email normalises case and whitespace', () => {
    // Stored lowercase so one address cannot become two accounts.
    assert.equal(schemas.email.parse('  User@Example.COM  '), 'user@example.com');
  });

  test('email rejects malformed addresses', () => {
    for (const value of ['nope', '@example.com', 'user@', 'user example.com']) {
      assert.throws(() => schemas.email.parse(value), `should reject "${value}"`);
    }
  });

  test('idParam coerces a route string to a positive integer', () => {
    assert.deepEqual(schemas.idParam.parse({ id: '7' }), { id: 7 });
  });

  test('idParam rejects non-numeric and non-positive ids', () => {
    for (const id of ['abc', '0', '-3', '1.5']) {
      assert.throws(() => schemas.idParam.parse({ id }), `should reject "${id}"`);
    }
  });

  test('slug enforces lowercase hyphenated words', () => {
    assert.equal(schemas.slug.parse('super-admin'), 'super-admin');

    for (const value of ['Super-Admin', 'super_admin', '-leading', 'trailing-', 'double--hyphen']) {
      assert.throws(() => schemas.slug.parse(value), `should reject "${value}"`);
    }
  });

  test('flexibleBoolean converts the string forms a form produces', () => {
    // "false" is truthy in JavaScript; passing it through unconverted is the
    // bug this schema exists to prevent.
    assert.equal(schemas.flexibleBoolean.parse('false'), false);
    assert.equal(schemas.flexibleBoolean.parse('true'), true);
    assert.equal(schemas.flexibleBoolean.parse('0'), false);
    assert.equal(schemas.flexibleBoolean.parse('1'), true);
    assert.equal(schemas.flexibleBoolean.parse(false), false);
    assert.equal(schemas.flexibleBoolean.parse(true), true);
  });

  test('listQuery applies defaults and caps the limit', () => {
    const parsed = schemas.listQuery.parse({});
    assert.equal(parsed.page, 1);

    assert.throws(() => schemas.listQuery.parse({ limit: '99999' }), 'limit must be capped');
  });
});
