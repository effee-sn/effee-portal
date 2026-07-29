const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { useTestServer, request, uniqueSuffix } = require('../helpers/testServer');

const { state } = useTestServer();
const skip = () => state.skip;

/**
 * Creates a user for a test and returns it.
 *
 * @param {object} [overrides]
 * @returns {Promise<{ id: number, email: string, password: string }>}
 */
async function createTestUser(overrides = {}) {
  const suffix = uniqueSuffix();
  const password = 'TestPass123!';

  const roles = await request('GET', '/lookup/roles', { token: state.token });
  const role = roles.body.find((r) => r.slug === 'staff') || roles.body.find((r) => !r.slug.includes('super'));

  const response = await request('POST', '/users', {
    token: state.token,
    body: {
      name: `Test User ${suffix}`,
      email: `test-${suffix}@integration.test`,
      phone: `9${suffix.slice(-9)}`,
      password,
      role_id: role.id,
      ...overrides,
    },
  });

  assert.equal(response.status, 201, `setup failed: ${JSON.stringify(response.body)}`);
  return { ...response.body, password };
}

/** @param {number} id */
const deleteTestUser = (id) => request('DELETE', `/users/${id}`, { token: state.token });

describe('Users API', () => {
  describe('response contract', () => {
    test('list returns {users,total,page,limit,pages} unwrapped', { skip: skip() }, async () => {
      // The Users screen reads these keys directly; an envelope would break it.
      const response = await request('GET', '/users?page=1&limit=10', { token: state.token });

      assert.equal(response.status, 200);
      assert.deepEqual(
        Object.keys(response.body).sort(),
        ['limit', 'page', 'pages', 'total', 'users']
      );
      assert.equal(response.body.success, undefined, 'must not be wrapped in an envelope');
    });

    test('never exposes password hashes', { skip: skip() }, async () => {
      const response = await request('GET', '/users', { token: state.token });

      for (const user of response.body.users) {
        assert.equal(user.password, undefined);
      }
    });
  });

  describe('pagination, sorting, filtering', () => {
    test('sorts by a whitelisted field', { skip: skip() }, async () => {
      const response = await request('GET', '/users?sort=name&order=asc', { token: state.token });
      const names = response.body.users.map((u) => u.name);

      assert.deepEqual(names, [...names].sort());
    });

    test('refuses to sort by password', { skip: skip() }, async () => {
      // Sorting by a hash column lets an attacker binary-search it.
      const response = await request('GET', '/users?sort=password', { token: state.token });

      assert.equal(response.status, 400);
      assert.equal(response.body.code, 'VALIDATION_FAILED');
    });

    test('caps an oversized limit', { skip: skip() }, async () => {
      const response = await request('GET', '/users?limit=99999', { token: state.token });
      assert.equal(response.status, 400);
    });

    test('filters by status', { skip: skip() }, async () => {
      const response = await request('GET', '/users?status=ACTIVE', { token: state.token });

      assert.equal(response.status, 200);
      assert.ok(response.body.users.every((u) => u.status === 'ACTIVE'));
    });

    test('rejects an invalid status filter', { skip: skip() }, async () => {
      const response = await request('GET', '/users?status=BOGUS', { token: state.token });
      assert.equal(response.status, 400);
    });
  });

  describe('validation', () => {
    test('rejects a non-numeric id', { skip: skip() }, async () => {
      const response = await request('GET', '/users/not-a-number', { token: state.token });
      assert.equal(response.status, 400);
    });

    test('reports each invalid field', { skip: skip() }, async () => {
      const response = await request('POST', '/users', {
        token: state.token,
        body: { name: '', email: 'bad', phone: '1', password: '123', role_id: 'x' },
      });

      assert.equal(response.status, 400);
      assert.ok(response.body.details.length >= 3);
    });

    test('strips unknown keys to prevent mass assignment', { skip: skip() }, async () => {
      const user = await createTestUser({ is_verified: true, id: 999999 });

      try {
        assert.notEqual(user.id, 999999, 'id must not be settable by the caller');
        assert.equal(user.is_verified, false, 'is_verified must not be settable on create');
      } finally {
        await deleteTestUser(user.id);
      }
    });

    test('enforces the password policy', { skip: skip() }, async () => {
      const suffix = uniqueSuffix();
      const response = await request('POST', '/users', {
        token: state.token,
        body: {
          name: 'Weak', email: `weak-${suffix}@integration.test`,
          phone: `9${suffix.slice(-9)}`, password: '123456', role_id: 1,
        },
      });

      assert.equal(response.status, 400);
    });
  });

  describe('business rules', () => {
    test('rejects a duplicate email with 409', { skip: skip() }, async () => {
      const user = await createTestUser();

      try {
        const suffix = uniqueSuffix();
        const duplicate = await request('POST', '/users', {
          token: state.token,
          body: {
            name: 'Duplicate', email: user.email,
            phone: `9${suffix.slice(-9)}`, password: 'TestPass123!', role_id: user.role.id,
          },
        });

        assert.equal(duplicate.status, 409);
      } finally {
        await deleteTestUser(user.id);
      }
    });

    test('rejects a nonexistent role', { skip: skip() }, async () => {
      const suffix = uniqueSuffix();
      const response = await request('POST', '/users', {
        token: state.token,
        body: {
          name: 'Bad Role', email: `badrole-${suffix}@integration.test`,
          phone: `9${suffix.slice(-9)}`, password: 'TestPass123!', role_id: 999999,
        },
      });

      assert.equal(response.status, 400);
      assert.ok(response.body.details.some((d) => d.field === 'role_id'));
    });

    test('returns 404 for an unknown id', { skip: skip() }, async () => {
      const response = await request('GET', '/users/999999', { token: state.token });

      assert.equal(response.status, 404);
      assert.equal(response.body.message, 'User not found');
    });

    test('refuses to delete your own account', { skip: skip() }, async () => {
      // The actor would hold a valid token for a user that no longer exists.
      const me = await request('GET', '/auth/me', { token: state.token });
      const response = await request('DELETE', `/users/${me.body.id}`, { token: state.token });

      assert.equal(response.status, 403);
    });
  });

  describe('password update', () => {
    test('an administrator can reset a password, and it takes effect', { skip: skip() }, async () => {
      // Regression guard: the original controller dropped `password` on update,
      // reporting success while changing nothing.
      const user = await createTestUser();
      const newPassword = 'RotatedPass456!';

      try {
        const before = await request('POST', '/auth/login', {
          body: { email: user.email, password: user.password },
        });
        assert.equal(before.status, 200, 'should log in with the initial password');

        const update = await request('PUT', `/users/${user.id}`, {
          token: state.token,
          body: { password: newPassword },
        });
        assert.equal(update.status, 200);

        const after = await request('POST', '/auth/login', {
          body: { email: user.email, password: newPassword },
        });
        assert.equal(after.status, 200, 'should log in with the new password');

        const old = await request('POST', '/auth/login', {
          body: { email: user.email, password: user.password },
        });
        assert.equal(old.status, 401, 'the old password must stop working');
      } finally {
        await deleteTestUser(user.id);
      }
    });

    test('a partial update leaves other fields intact', { skip: skip() }, async () => {
      const user = await createTestUser();

      try {
        const response = await request('PUT', `/users/${user.id}`, {
          token: state.token,
          body: { name: 'Renamed Only' },
        });

        assert.equal(response.body.name, 'Renamed Only');
        assert.equal(response.body.email, user.email);
      } finally {
        await deleteTestUser(user.id);
      }
    });
  });

  describe('soft delete', () => {
    test('a deleted user disappears from reads but the row survives', { skip: skip() }, async () => {
      const user = await createTestUser();

      const deletion = await deleteTestUser(user.id);
      assert.equal(deletion.status, 200);

      const fetched = await request('GET', `/users/${user.id}`, { token: state.token });
      assert.equal(fetched.status, 404, 'must be invisible to the API');

      const list = await request('GET', '/users?limit=100', { token: state.token });
      assert.ok(
        !list.body.users.some((u) => u.id === user.id),
        'must not appear in listings'
      );
    });

    test('a soft-deleted email cannot be reused', { skip: skip() }, async () => {
      // Reusing a departed user's address would make audit history ambiguous.
      const user = await createTestUser();
      await deleteTestUser(user.id);

      const suffix = uniqueSuffix();
      const reuse = await request('POST', '/users', {
        token: state.token,
        body: {
          name: 'Reuse', email: user.email,
          phone: `9${suffix.slice(-9)}`, password: 'TestPass123!', role_id: user.role.id,
        },
      });

      assert.equal(reuse.status, 409);
    });
  });
});
