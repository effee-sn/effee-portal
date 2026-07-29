const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { useTestServer, request } = require('../helpers/testServer');

const { state } = useTestServer();

/** @returns {boolean} */
const skip = () => state.skip;

describe('Authentication', () => {
  test('rejects a request with no token', { skip: skip() }, async () => {
    const response = await request('GET', '/users');
    assert.equal(response.status, 401);
  });

  test('rejects a malformed token', { skip: skip() }, async () => {
    const response = await request('GET', '/auth/me', { token: 'not-a-real-token' });
    assert.equal(response.status, 401);
  });

  test('rejects a token without the Bearer scheme', { skip: skip() }, async () => {
    const response = await request('GET', '/auth/me', {
      headers: { Authorization: state.token },
    });
    assert.equal(response.status, 401);
  });

  test('accepts a valid token', { skip: skip() }, async () => {
    const response = await request('GET', '/auth/me', { token: state.token });

    assert.equal(response.status, 200);
    assert.equal(response.body.is_system, true);
    assert.ok(Array.isArray(response.body.permissions));
  });

  test('login response never includes the password hash', { skip: skip() }, async () => {
    const response = await request('POST', '/auth/login', {
      body: {
        email: process.env.TEST_ADMIN_EMAIL,
        password: process.env.TEST_ADMIN_PASSWORD,
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.password, undefined);
  });

  describe('account enumeration', () => {
    test('an unknown email and a wrong password are indistinguishable', { skip: skip() }, async () => {
      // Differing status or message here would let an unauthenticated caller
      // discover which addresses are registered.
      const wrongPassword = await request('POST', '/auth/login', {
        body: { email: process.env.TEST_ADMIN_EMAIL, password: 'definitely-not-the-password' },
      });

      const unknownEmail = await request('POST', '/auth/login', {
        body: { email: 'nobody@nowhere.invalid', password: 'definitely-not-the-password' },
      });

      assert.equal(wrongPassword.status, 401);
      assert.equal(unknownEmail.status, wrongPassword.status);
      assert.equal(unknownEmail.body.message, wrongPassword.body.message);
      assert.equal(wrongPassword.body.message, 'Invalid credentials');
    });

    test('forgot-password responds identically for known and unknown addresses', { skip: skip() }, async () => {
      const known = await request('POST', '/auth/forgot-password', {
        body: { email: process.env.TEST_ADMIN_EMAIL },
      });
      const unknown = await request('POST', '/auth/forgot-password', {
        body: { email: 'nobody@nowhere.invalid' },
      });

      // Both may be rate limited depending on preceding tests; what matters is
      // that they agree with each other.
      assert.equal(known.status, unknown.status);
      assert.equal(known.body.message, unknown.body.message);
    });
  });

  describe('validation', () => {
    test('rejects a malformed email', { skip: skip() }, async () => {
      const response = await request('POST', '/auth/login', {
        body: { email: 'not-an-email', password: 'whatever' },
      });

      assert.equal(response.status, 400);
      assert.equal(response.body.code, 'VALIDATION_FAILED');
    });

    test('rejects a missing password', { skip: skip() }, async () => {
      const response = await request('POST', '/auth/login', {
        body: { email: 'user@example.com' },
      });
      assert.equal(response.status, 400);
    });
  });

  describe('profile', () => {
    test('returns permissions grouped by module', { skip: skip() }, async () => {
      const response = await request('GET', '/auth/profile', { token: state.token });

      assert.equal(response.status, 200);
      assert.ok(response.body.permsByModule);
      assert.equal(response.body.password, undefined);
    });

    test('rejects a change-password request with the wrong current password', { skip: skip() }, async () => {
      const response = await request('PUT', '/auth/change-password', {
        token: state.token,
        body: { current_password: 'wrong-password', new_password: 'NewStr0ngPass!' },
      });

      assert.equal(response.status, 400);
    });

    test('enforces the password policy on change', { skip: skip() }, async () => {
      const response = await request('PUT', '/auth/change-password', {
        token: state.token,
        body: { current_password: process.env.TEST_ADMIN_PASSWORD, new_password: '123456' },
      });

      assert.equal(response.status, 400);
    });
  });
});
