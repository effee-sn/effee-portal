const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');

const { useTestServer, request, login, uniqueSuffix } = require('../helpers/testServer');

const { state } = useTestServer();
const skip = () => state.skip;

/**
 * Non-system user used to prove that privilege boundaries hold. Created once
 * for the suite and removed afterwards.
 *
 * @type {{ id: number, token: string }|null}
 */
let staff = null;

/** @returns {Promise<{ id: number, token: string }>} */
async function getStaff() {
  if (staff) return staff;

  const suffix = uniqueSuffix();
  const password = 'StaffPass123!';

  const roles = await request('GET', '/lookup/roles', { token: state.token });
  const role = roles.body.find((r) => r.slug === 'staff')
            || roles.body.find((r) => !r.slug.includes('super'));

  const created = await request('POST', '/users', {
    token: state.token,
    body: {
      name: `Staff ${suffix}`,
      email: `staff-${suffix}@integration.test`,
      phone: `9${suffix.slice(-9)}`,
      password,
      role_id: role.id,
    },
  });

  assert.equal(created.status, 201, `setup failed: ${JSON.stringify(created.body)}`);

  staff = {
    id: created.body.id,
    token: await login(created.body.email, password),
  };
  return staff;
}

describe('Authorization boundaries', () => {
  describe('settings — platform configuration', () => {
    test('a non-admin cannot change security settings', { skip: skip() }, async () => {
      // This was the original vulnerability: the super-admin check lived only
      // in the frontend, so any authenticated user could disable rate limiting.
      const { token } = await getStaff();

      const response = await request('PUT', '/settings/security', {
        token,
        body: { login_max_attempts: 100 },
      });

      assert.equal(response.status, 403);
    });

    test('a non-admin cannot repoint SMTP credentials', { skip: skip() }, async () => {
      const { token } = await getStaff();

      const response = await request('PUT', '/settings/email', {
        token,
        body: { smtp_host: 'attacker.example.com' },
      });

      assert.equal(response.status, 403);
    });

    test('a non-admin cannot change company information', { skip: skip() }, async () => {
      const { token } = await getStaff();

      const response = await request('PUT', '/settings/company', {
        token,
        body: { company_name: 'Compromised' },
      });

      assert.equal(response.status, 403);
    });

    test('a non-admin reads branding only', { skip: skip() }, async () => {
      // The application shell needs the company name and logo for every user;
      // everything else is operational configuration.
      const { token } = await getStaff();

      const response = await request('GET', '/settings', { token });

      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(response.body).sort(), ['company_logo', 'company_name']);
      assert.equal(response.body.smtp_host, undefined);
      assert.equal(response.body.login_max_attempts, undefined);
    });

    test('an administrator reads the full configuration', { skip: skip() }, async () => {
      const response = await request('GET', '/settings', { token: state.token });

      assert.equal(response.status, 200);
      assert.ok('login_max_attempts' in response.body);
    });

    test('the SMTP password is never returned, even to an administrator', { skip: skip() }, async () => {
      const response = await request('GET', '/settings', { token: state.token });

      assert.equal(response.body.smtp_pass, undefined);
      assert.ok('smtp_pass_set' in response.body, 'should report only whether one is set');
    });
  });

  describe('permission-gated routes', () => {
    test('a staff user retains the permissions their role grants', { skip: skip() }, async () => {
      // Guards against over-restriction: the fix must not break legitimate use.
      const { token } = await getStaff();

      const response = await request('GET', '/users', { token });
      assert.equal(response.status, 200);
    });

    test('a staff user cannot delete users', { skip: skip() }, async () => {
      const { token } = await getStaff();

      const response = await request('DELETE', '/users/1', { token });
      assert.equal(response.status, 403);
      assert.equal(response.body.code, 'PERMISSION_DENIED');
    });

    test('a staff user cannot create users', { skip: skip() }, async () => {
      const { token } = await getStaff();
      const suffix = uniqueSuffix();

      const response = await request('POST', '/users', {
        token,
        body: {
          name: 'Nope', email: `nope-${suffix}@integration.test`,
          phone: `9${suffix.slice(-9)}`, password: 'TestPass123!', role_id: 1,
        },
      });

      assert.equal(response.status, 403);
    });
  });

  describe('audit log', () => {
    test('is restricted to system administrators', { skip: skip() }, async () => {
      // It records failed logins with submitted addresses — exactly the
      // material that must not be broadly readable.
      const { token } = await getStaff();

      const response = await request('GET', '/audit-logs', { token });
      assert.equal(response.status, 403);
    });

    test('an administrator can read it', { skip: skip() }, async () => {
      const response = await request('GET', '/audit-logs?limit=5', { token: state.token });

      assert.equal(response.status, 200);
      assert.equal(response.body.success, true, 'new endpoints use the envelope');
      assert.ok(Array.isArray(response.body.data));
      assert.ok(response.body.meta.pagination);
    });

    test('records logins with actor and network metadata', { skip: skip() }, async () => {
      const response = await request('GET', '/audit-logs?action=LOGIN&limit=1', {
        token: state.token,
      });

      const entry = response.body.data[0];
      assert.ok(entry, 'a LOGIN entry should exist');
      assert.equal(entry.action, 'LOGIN');
      assert.ok(entry.actor_email);
      assert.ok(entry.request_id, 'should correlate with the application log');
    });

    test('never stores password material', { skip: skip() }, async () => {
      const response = await request('GET', '/audit-logs?limit=50', { token: state.token });

      for (const entry of response.body.data) {
        const serialised = JSON.stringify(entry.changes ?? {});
        assert.ok(!serialised.includes('$2b$'), 'a bcrypt hash must never appear');
        assert.ok(
          !/"password"\s*:\s*"(?!\[REDACTED\])/.test(serialised),
          'a raw password value must never appear'
        );
      }
    });

    test('exposes no write routes', { skip: skip() }, async () => {
      // A trail the application can rewrite proves nothing.
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const response = await request(method, '/audit-logs', {
          token: state.token,
          body: { action: 'FORGED' },
        });

        assert.equal(response.status, 404, `${method} /audit-logs should not exist`);
      }
    });
  });

  after(async () => {
    if (staff) await request('DELETE', `/users/${staff.id}`, { token: state.token });
  });
});
