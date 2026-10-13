/**
 * New-user invite — pinned down.
 *
 * Creating a user emails a welcome with a one-time "set your password" link
 * (never a password). The mailer is replaced by a recorder, so nothing is
 * sent. Needs a development/test DATABASE_URL; removes the users it creates.
 *
 * Run:  node --test tests/integration/userInvite.test.js
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }

const it = (name, fn) => test(name, async (t) => {
  if (env.unavailable) return t.skip(env.reason);
  return fn(t);
});

// Recorder in place of the real mailer — must be installed before any service loads.
const outbox = [];
const mailerPath = path.resolve(__dirname, '../../src/lib/mailer.js');
require.cache[mailerPath] = {
  id: mailerPath, filename: mailerPath, loaded: true,
  exports: {
    sendMail: async () => ({ sent: false, reason: 'disabled in test' }),
    sendMailCritical: async (m) => { outbox.push(m); return { sent: true }; },
    sendTestMail: async () => {},
    isEmailEnabled: () => false,
    isSmtpConfigured: async () => true,
  },
};

let prisma; let usersService; let authService;
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ids = [];
const ctx = { id: null, email: 'invite-test@local' };
const tokenFrom = (mail) => new URL(mail.text.match(/Set your password: (\S+)/)[1]).searchParams.get('token');

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  ({ usersService } = require('../../src/modules/users/users.service'));
  ({ authService } = require('../../src/modules/auth/auth.service'));
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await prisma.auditLog.deleteMany({ where: { entity: 'User', entity_id: { in: ids.map(String) } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } finally { await prisma.$disconnect(); }
});

describe('New-user invite', () => {
  let user;

  it('creating a user without a password emails a set-password link — never a password', async () => {
    const role = await prisma.role.findFirst({ where: { deleted_at: null, is_system: false }, select: { id: true, name: true } });
    user = await usersService.create({
      name: 'Invite Person', email: `invite-${suffix}@invite.test`, role_id: role.id,
    }, ctx);
    ids.push(user.id);

    assert.deepEqual(user.invite, { sent: true });
    const mail = outbox.at(-1);
    assert.equal(mail.to, `invite-${suffix}@invite.test`);
    assert.match(mail.subject, /^Welcome to /);
    assert.match(mail.text, /Sign-in email: invite-/);
    assert.match(mail.text, new RegExp(`Role: ${role.name}`));
    assert.match(mail.text, /\/reset-password\?token=[0-9a-f]{64}&invite=1/);
    assert.doesNotMatch(mail.text, /^\s*(temporary )?password\s*:/im, 'no password line in the email');

    const row = await prisma.passwordResetToken.findUnique({ where: { token: tokenFrom(mail) } });
    const hours = (row.expires_at.getTime() - Date.now()) / 3600e3;
    assert.ok(hours > 47 && hours <= 48, 'link valid for 48 hours');
  });

  it('the link sets the password, after which the user can sign in; it works once', async () => {
    const token = tokenFrom(outbox.at(-1));
    assert.deepEqual(await authService.checkResetToken(token), { valid: true }, 'usable before use');
    await authService.resetPassword({ token, new_password: 'NewPassw0rd!x' }, ctx);
    assert.deepEqual(await authService.checkResetToken(token), { valid: false, reason: 'used' }, 'the page sees it as used');
    const session = await authService.login({ email: user.email, password: 'NewPassw0rd!x' }, ctx);
    assert.ok(session.token);
    await assert.rejects(authService.resetPassword({ token, new_password: 'Another0ne!x' }, ctx), { name: 'ValidationError' });
  });

  it('resending makes a new link and retires the old one', async () => {
    const r = await usersService.resendInvite(user.id, ctx);
    assert.deepEqual(r, { sent: true });
    const first = tokenFrom(outbox.at(-1));
    await usersService.resendInvite(user.id, ctx);
    const second = tokenFrom(outbox.at(-1));
    assert.notEqual(first, second);
    await assert.rejects(authService.resetPassword({ token: first, new_password: 'Old1nk!xx' }, ctx), { name: 'ValidationError' });
    await authService.resetPassword({ token: second, new_password: 'NewL1nk!xx' }, ctx);
  });

  it('an expired or unknown link is reported as such', async () => {
    await usersService.resendInvite(user.id, ctx);
    const token = tokenFrom(outbox.at(-1));
    await prisma.passwordResetToken.update({ where: { token }, data: { expires_at: new Date(Date.now() - 1000) } });
    assert.deepEqual(await authService.checkResetToken(token), { valid: false, reason: 'expired' });
    await assert.rejects(authService.resetPassword({ token, new_password: 'Expired1!xx' }, ctx), { name: 'ValidationError' });
    assert.deepEqual(await authService.checkResetToken('not-a-real-token'), { valid: false, reason: 'invalid' });
  });

  it('a user needs either a password or an invite', async () => {
    const role = await prisma.role.findFirst({ where: { deleted_at: null, is_system: false }, select: { id: true } });
    await assert.rejects(
      usersService.create({ name: 'No Way In', email: `noway-${suffix}@invite.test`, role_id: role.id, send_invite: false }, ctx),
      { name: 'ValidationError' },
    );
  });

  it('with a password and no invite, nothing is emailed', async () => {
    const role = await prisma.role.findFirst({ where: { deleted_at: null, is_system: false }, select: { id: true } });
    const before = outbox.length;
    const u = await usersService.create({
      name: 'Pw Person', email: `pw-${suffix}@invite.test`, role_id: role.id, password: 'Passw0rd!xy', send_invite: false,
    }, ctx);
    ids.push(u.id);
    assert.equal(outbox.length, before);
    assert.equal(u.invite.sent, false);
  });
});
