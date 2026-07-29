const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-characters-long';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const {
  parseListQuery, buildSearchClause, MAX_LIMIT, DEFAULT_LIMIT,
} = require('../../src/core/http/queryOptions');
const { ValidationError } = require('../../src/core/errors/AppError');

/** Minimal config used where the specifics do not matter. */
const anyConfig = { sortable: ['name', 'email'], defaultSort: 'created_at' };

describe('parseListQuery', () => {
  describe('pagination', () => {
    test('applies defaults when nothing is supplied', () => {
      const query = parseListQuery({}, anyConfig);

      assert.equal(query.page, 1);
      assert.equal(query.limit, DEFAULT_LIMIT);
      assert.equal(query.skip, 0);
      assert.equal(query.take, DEFAULT_LIMIT);
    });

    test('computes skip from page and limit', () => {
      const query = parseListQuery({ page: '3', limit: '20' }, anyConfig);

      assert.equal(query.skip, 40);
      assert.equal(query.take, 20);
    });

    test('caps limit at the maximum', () => {
      // An uncapped limit is an unauthenticated way to exhaust memory.
      assert.equal(parseListQuery({ limit: '999999' }, anyConfig).limit, MAX_LIMIT);
    });

    test('rejects non-positive and non-integer pagination', () => {
      for (const query of [{ page: '0' }, { page: '-1' }, { page: 'abc' }, { limit: '1.5' }]) {
        assert.throws(
          () => parseListQuery(query, anyConfig),
          ValidationError,
          `should reject ${JSON.stringify(query)}`
        );
      }
    });
  });

  describe('sorting', () => {
    test('falls back to the configured default', () => {
      const query = parseListQuery({}, { sortable: ['name'], defaultSort: 'created_at', defaultOrder: 'desc' });
      assert.deepEqual(query.orderBy, { created_at: 'desc' });
    });

    test('honours a whitelisted field and direction', () => {
      const query = parseListQuery({ sort: 'name', order: 'asc' }, anyConfig);
      assert.deepEqual(query.orderBy, { name: 'asc' });
    });

    test('rejects a field that is not whitelisted', () => {
      // Sorting by a hash column lets an attacker binary-search it, so the
      // whitelist is a security control rather than a convenience.
      assert.throws(
        () => parseListQuery({ sort: 'password' }, anyConfig),
        ValidationError
      );
    });

    test('rejects attempts to sort by a relation path', () => {
      assert.throws(() => parseListQuery({ sort: 'role.name' }, anyConfig), ValidationError);
    });

    test('defaults an unrecognised order to the configured direction', () => {
      const query = parseListQuery({ sort: 'name', order: 'sideways' }, { ...anyConfig, defaultOrder: 'desc' });
      assert.deepEqual(query.orderBy, { name: 'desc' });
    });
  });

  describe('filters', () => {
    const config = {
      sortable: [],
      filterable: {
        status:  (value) => (['ACTIVE', 'INACTIVE'].includes(value) ? value : undefined),
        role_id: (value) => (Number.isInteger(Number(value)) ? Number(value) : undefined),
      },
    };

    test('applies a valid filter', () => {
      assert.deepEqual(parseListQuery({ status: 'ACTIVE' }, config).filters, { status: 'ACTIVE' });
    });

    test('coerces through the supplied parser', () => {
      assert.deepEqual(parseListQuery({ role_id: '3' }, config).filters, { role_id: 3 });
    });

    test('drops values the parser rejects', () => {
      assert.deepEqual(parseListQuery({ status: 'DELETED' }, config).filters, {});
    });

    test('ignores fields that are not declared filterable', () => {
      // Otherwise any column becomes a filter, including ones that leak data
      // through their presence or absence in results.
      assert.deepEqual(parseListQuery({ password: 'x', is_system: 'true' }, config).filters, {});
    });

    test('ignores empty values', () => {
      assert.deepEqual(parseListQuery({ status: '' }, config).filters, {});
    });
  });

  describe('search', () => {
    test('trims the term', () => {
      assert.equal(parseListQuery({ search: '  bob  ' }, anyConfig).search, 'bob');
    });

    test('returns an empty string when absent', () => {
      assert.equal(parseListQuery({}, anyConfig).search, '');
    });
  });
});

describe('buildSearchClause', () => {
  test('builds an OR across the given fields', () => {
    assert.deepEqual(buildSearchClause('bob', ['name', 'email']), {
      OR: [{ name: { contains: 'bob' } }, { email: { contains: 'bob' } }],
    });
  });

  test('returns undefined when there is nothing to search', () => {
    // Undefined so the result can be spread into a where clause safely.
    assert.equal(buildSearchClause('', ['name']), undefined);
    assert.equal(buildSearchClause('bob', []), undefined);
  });
});
