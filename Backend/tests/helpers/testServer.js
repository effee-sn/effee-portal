/**
 * Integration-test harness.
 *
 * Boots the real Express application on an ephemeral port and returns a small
 * HTTP client bound to it. Nothing is mocked: requests traverse the actual
 * middleware chain, controllers, services, repositories, and database, which is
 * the point — these tests exist to catch the wiring mistakes that unit tests
 * cannot see.
 *
 * ── Requires a database ──────────────────────────────────────────────────────
 * `DATABASE_URL` must point at a seeded database, and `TEST_ADMIN_EMAIL` /
 * `TEST_ADMIN_PASSWORD` must hold credentials for a system administrator.
 * Without them the suites skip rather than fail, so `npm test` stays green on a
 * machine with no database while still reporting that coverage was not run.
 *
 * Tests create the records they need and remove them afterwards. They are
 * written to tolerate leftovers from an interrupted run.
 */

// Loaded before anything reads process.env. The application pulls in dotenv via
// config/env.js, but that only happens once the app is required — which is
// after the environment check below, so the check would see nothing.
require('dotenv').config();

const { after, before } = require('node:test');

/** @type {import('http').Server|null} */
let server = null;
/** @type {string|null} */
let baseUrl = null;

/**
 * Whether the environment can support integration tests.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
function checkEnvironment() {
  if (!process.env.DATABASE_URL) {
    return { ok: false, reason: 'DATABASE_URL is not set' };
  }
  if (!process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD) {
    return {
      ok: false,
      reason: 'TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD are not set — ' +
              'set them to a system administrator\'s credentials',
    };
  }
  return { ok: true };
}

/**
 * Starts the application on a free port.
 *
 * @returns {Promise<string>} The base URL.
 */
function start() {
  if (baseUrl) return Promise.resolve(baseUrl);

  const app = require('../../src/app');

  return new Promise((resolve, reject) => {
    // Port 0 asks the OS for any free port, so a test run never collides with
    // a development server already bound to 4000.
    server = app.listen(0, () => {
      const { port } = /** @type {import('net').AddressInfo} */ (server.address());
      baseUrl = `http://127.0.0.1:${port}`;
      resolve(baseUrl);
    });
    server.on('error', reject);
  });
}

/** Shuts the server and the database pool down. */
async function stop() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
    baseUrl = null;
  }

  // Released explicitly: an open pool keeps the event loop alive and the test
  // process would hang instead of exiting.
  try {
    const prisma = require('../../src/lib/prisma');
    await prisma.$disconnect();
  } catch { /* nothing to disconnect */ }
}

/**
 * Issues a request against the running application.
 *
 * @param {string} method
 * @param {string} path Path below `/api`, e.g. `/users?page=1`.
 * @param {object} [options]
 * @param {string} [options.token] Bearer token.
 * @param {unknown} [options.body]
 * @param {Record<string, string>} [options.headers]
 * @param {boolean} [options.raw] Skip the `/api` prefix for root-level routes.
 * @returns {Promise<{ status: number, body: any, headers: Headers }>}
 */
async function request(method, path, { token, body, headers = {}, raw = false } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${raw ? '' : '/api'}${path}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let parsed = null;
  try { parsed = await response.json(); } catch { /* empty or non-JSON body */ }

  return { status: response.status, body: parsed, headers: response.headers };
}

/**
 * Authenticates and returns a bearer token.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string>}
 */
async function login(email, password) {
  const response = await request('POST', '/auth/login', { body: { email, password } });

  if (response.status !== 200 || !response.body?.token) {
    throw new Error(
      `Test login failed for ${email} (${response.status}): ${JSON.stringify(response.body)}`
    );
  }
  return response.body.token;
}

/**
 * Registers the lifecycle hooks a suite needs and yields shared state.
 *
 * @returns {{ state: { token: string|null, skip: boolean, reason: string } }}
 */
function useTestServer() {
  const state = { token: null, skip: false, reason: '' };

  before(async () => {
    const environment = checkEnvironment();

    if (!environment.ok) {
      state.skip = true;
      state.reason = environment.reason;
      // Surfaced rather than swallowed: a silently skipped integration suite
      // reads as passing coverage that was never actually exercised.
      console.warn(`\n  ⚠ Integration tests skipped — ${environment.reason}\n`);
      return;
    }

    await start();
    state.token = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
  });

  after(async () => {
    await stop();
  });

  return { state };
}

/** A unique-enough suffix so parallel or repeated runs do not collide. */
const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

module.exports = { useTestServer, request, login, start, stop, uniqueSuffix };
