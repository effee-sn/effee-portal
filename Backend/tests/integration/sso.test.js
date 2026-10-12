/**
 * Microsoft sign-in (SSO) — pinned down.
 *
 * 1. ID-token verification (lib/microsoftSso) against a locally generated RSA
 *    key served as a fake Microsoft key set: signature, audience, issuer,
 *    expiry, nonce, tenant, group claim.
 * 2. The sign-in flow (auth/sso.service) against a real database, with the
 *    Microsoft round-trip stubbed: state is one-time, unknown users are
 *    refused unless auto-create is on, group and status checks, and that
 *    password sign-in is refused for non-admins when switched off.
 *
 * Needs a development/test DATABASE_URL; restores the SSO settings it changes
 * and removes the users it creates. Refuses to run in production.
 *
 * Run:  node --test tests/integration/sso.test.js
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

process.env.EMAIL_NOTIFICATIONS = 'false';
require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }

const it = (name, fn) => test(name, async (t) => {
  if (env.unavailable) return t.skip(env.reason);
  return fn(t);
});

const { createMicrosoftSso } = require('../../src/lib/microsoftSso');

const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const GROUP = '99999999-8888-7777-6666-555555555555';
const cfg = { TENANT_ID: TENANT, CLIENT_ID: CLIENT, CLIENT_SECRET: 'secret', REDIRECT_URI: 'https://portal.test/api/v1/auth/sso/microsoft/callback' };

// A signing key standing in for Microsoft's.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' };

const sign = (claims, opts = {}) => jwt.sign(
  { tid: TENANT, ...claims },
  privateKey,
  { algorithm: 'RS256', keyid: KID, audience: CLIENT, issuer: `https://login.microsoftonline.com/${TENANT}/v2.0`, expiresIn: '5m', ...opts },
);

/** Fake fetch: serves the key set, and a token endpoint returning `nextIdToken`. */
let nextIdToken = null;
const fakeFetch = async (url) => {
  if (url.endsWith('/discovery/v2.0/keys')) return { ok: true, json: async () => ({ keys: [jwk] }) };
  if (url.endsWith('/oauth2/v2.0/token')) return { ok: true, json: async () => ({ id_token: nextIdToken }) };
  throw new Error(`unexpected fetch ${url}`);
};

describe('ID-token verification', () => {
  const ms = createMicrosoftSso(cfg, { fetch: fakeFetch });

  test('a valid token verifies and yields the email', async () => {
    const claims = await ms.verifyIdToken(sign({ nonce: 'n1', preferred_username: 'Ravi@Effee.com', name: 'Ravi' }), 'n1');
    assert.equal(ms.emailOf(claims), 'ravi@effee.com');
  });

  test('wrong nonce, audience, issuer, tenant, or an expired token are rejected', async () => {
    await assert.rejects(ms.verifyIdToken(sign({ nonce: 'n1' }), 'other'), /nonce/);
    await assert.rejects(ms.verifyIdToken(sign({ nonce: 'n1' }, { audience: 'someone-else' }), 'n1'), /audience/);
    await assert.rejects(ms.verifyIdToken(sign({ nonce: 'n1' }, { issuer: 'https://evil.example/v2.0' }), 'n1'), /issuer/);
    await assert.rejects(ms.verifyIdToken(sign({ nonce: 'n1', tid: 'other-tenant' }), 'n1'), /tenant/);
    await assert.rejects(ms.verifyIdToken(sign({ nonce: 'n1' }, { expiresIn: -3600 }), 'n1'), /expired/);
  });

  test('a token signed with another key is rejected', async () => {
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const forged = jwt.sign({ nonce: 'n1', tid: TENANT }, other, {
      algorithm: 'RS256', keyid: KID, audience: CLIENT, issuer: `https://login.microsoftonline.com/${TENANT}/v2.0`,
    });
    await assert.rejects(ms.verifyIdToken(forged, 'n1'), /signature/);
  });

  test('group status reads the groups claim', () => {
    assert.equal(ms.groupStatus({ groups: [GROUP] }, GROUP), 'member');
    assert.equal(ms.groupStatus({ groups: ['x'] }, GROUP), 'not_member');
    assert.equal(ms.groupStatus({}, GROUP), 'unknown');
  });

  test('the sign-in URL carries PKCE, state and nonce', () => {
    const r = ms.beginSignIn();
    const u = new URL(r.url);
    assert.equal(u.origin + u.pathname, `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(u.searchParams.get('state'), r.state);
    assert.equal(u.searchParams.get('nonce'), r.nonce);
    assert.equal(
      u.searchParams.get('code_challenge'),
      crypto.createHash('sha256').update(r.codeVerifier).digest('base64url'),
    );
  });
});

describe('Sign-in flow', () => {
  let prisma; let bcrypt; let config; let createSsoService; let createAuthService; let authRepository;
  let sso; let auth; let saved; let role; let systemRole;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const userIds = [];
  const ctx = { ip: '127.0.0.1', user_agent: 'test' };

  const mkUser = async (email, roleId, extra = {}) => {
    const u = await prisma.user.create({
      data: { name: `SSO ${suffix}`, email, password: await bcrypt.hash('Passw0rd!x', 4), role_id: roleId, ...extra },
      select: { id: true, email: true },
    });
    userIds.push(u.id);
    return u;
  };

  /** Runs a full sign-in for these ID-token claims; returns the redirect URL. */
  const signIn = async (claims) => {
    const url = new URL(await sso.start());
    const state = url.searchParams.get('state');
    const nonce = url.searchParams.get('nonce');
    nextIdToken = sign({ nonce, ...claims });
    return sso.callback({ code: 'abc', state }, ctx);
  };

  before(async () => {
    if (env.unavailable) return;
    prisma = require('../../src/lib/prisma');
    try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
    bcrypt = require('bcrypt');
    config = require('../../src/config/env');
    ({ createSsoService } = require('../../src/modules/auth/sso.service'));
    ({ createAuthService } = require('../../src/modules/auth/auth.service'));
    ({ authRepository } = require('../../src/modules/auth/auth.repository'));

    const s = await prisma.companySettings.findFirst();
    saved = { id: s.id, sso_microsoft_enabled: s.sso_microsoft_enabled, sso_password_login: s.sso_password_login, sso_auto_create: s.sso_auto_create, sso_default_role_id: s.sso_default_role_id };
    role = await prisma.role.findFirst({ where: { deleted_at: null, is_system: false }, select: { id: true } });
    systemRole = await prisma.role.findFirst({ where: { deleted_at: null, is_system: true }, select: { id: true } });

    config.MS_SSO.ALLOWED_GROUP_ID = '';
    const ms = createMicrosoftSso(cfg, { fetch: fakeFetch });
    sso = createSsoService({ ms, issueSession: async (user) => `session-for-${user.id}` });
    auth = createAuthService(authRepository, { passwordLoginAllowed: (u) => sso.passwordLoginAllowed(u) });
    await prisma.companySettings.update({ where: { id: s.id }, data: { sso_microsoft_enabled: true, sso_password_login: true, sso_auto_create: false } });
  });

  after(async () => {
    if (!prisma || env.unavailable) return;
    try {
      config.MS_SSO.ALLOWED_GROUP_ID = '';
      const { id, ...rest } = saved;
      await prisma.companySettings.update({ where: { id }, data: rest });
      await prisma.auditLog.deleteMany({ where: { OR: [{ actor_id: { in: userIds } }, { actor_email: { contains: suffix } }] } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('an existing portal user signs in and gets a session', async () => {
    const u = await mkUser(`known-${suffix}@sso.test`, role.id);
    const url = await signIn({ preferred_username: `KNOWN-${suffix}@sso.test` });
    assert.match(url, new RegExp(`/login/sso#token=session-for-${u.id}$`));
  });

  it('a sign-in state works once only', async () => {
    const u = new URL(await sso.start());
    const state = u.searchParams.get('state');
    nextIdToken = sign({ nonce: u.searchParams.get('nonce'), preferred_username: `known-${suffix}@sso.test` });
    assert.match(await sso.callback({ code: 'abc', state }, ctx), /#token=/);
    assert.match(await sso.callback({ code: 'abc', state }, ctx), /#error=.*expired/);
  });

  it('someone with no portal account is refused unless auto-create is on', async () => {
    const email = `new-${suffix}@sso.test`;
    assert.match(await signIn({ preferred_username: email }), /#error=.*no%20portal%20account/);

    await sso.updateSettings({ auto_create: true, default_role_id: role.id }, { id: null });
    const url = await signIn({ preferred_username: email, name: 'New Person' });
    assert.match(url, /#token=session-for-\d+$/);
    const created = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, role_id: true } });
    userIds.push(created.id);
    assert.deepEqual([created.name, created.role_id], ['New Person', role.id]);
    await sso.updateSettings({ auto_create: false }, { id: null });
  });

  it('auto-create needs a default role, and never a system one', async () => {
    await assert.rejects(sso.updateSettings({ auto_create: true, default_role_id: null }, { id: null }), { name: 'ValidationError' });
    await assert.rejects(sso.updateSettings({ auto_create: true, default_role_id: systemRole.id }, { id: null }), { name: 'ValidationError' }, 'never the Super Admin role');
  });

  it('with a group configured, only group members get in', async () => {
    config.MS_SSO.ALLOWED_GROUP_ID = GROUP;
    const email = `known-${suffix}@sso.test`;
    assert.match(await signIn({ preferred_username: email, groups: ['other'] }), /#error=.*not%20in%20the%20group/);
    assert.match(await signIn({ preferred_username: email }), /#error=.*Group%20membership%20could%20not/);
    assert.match(await signIn({ preferred_username: email, groups: [GROUP] }), /#token=/);
    config.MS_SSO.ALLOWED_GROUP_ID = '';
  });

  it('an inactive portal user is refused', async () => {
    await mkUser(`inactive-${suffix}@sso.test`, role.id, { status: 'INACTIVE' });
    assert.match(await signIn({ preferred_username: `inactive-${suffix}@sso.test` }), /#error=.*inactive/);
  });

  it('a cancelled sign-in comes back with a message', async () => {
    assert.match(await sso.callback({ error: 'access_denied' }, ctx), /#error=.*cancelled/);
  });

  it('password sign-in can be switched off for everyone but the Super Admin', async () => {
    const user = await mkUser(`pw-${suffix}@sso.test`, role.id);
    const admin = await mkUser(`pwadmin-${suffix}@sso.test`, systemRole.id);

    assert.ok((await auth.login({ email: user.email, password: 'Passw0rd!x' }, ctx)).token, 'allowed while password login is on');

    await sso.updateSettings({ password_login: false }, { id: null });
    assert.deepEqual(await sso.publicConfig(), { microsoft: true, password_login: 'admin_only' });
    await assert.rejects(auth.login({ email: user.email, password: 'Passw0rd!x' }, ctx), { name: 'ForbiddenError', code: 'SSO_REQUIRED' });
    assert.ok((await auth.login({ email: admin.email, password: 'Passw0rd!x' }, ctx)).token, 'the Super Admin keeps password access');

    // SSO switched off → passwords work again for everyone.
    await sso.updateSettings({ enabled: false }, { id: null });
    assert.ok((await auth.login({ email: user.email, password: 'Passw0rd!x' }, ctx)).token);
    assert.deepEqual(await sso.publicConfig(), { microsoft: false, password_login: 'all' });
  });
});
