const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNotificationEmail, buildForgotPasswordEmail, buildTestEmail,
} = require('../../src/lib/emailTemplates');

const base = {
  company: 'Effee Portal',
  to: 'vbs@example.com',
  userName: 'Vishwas',
  title: 'Enquiry handed to you: ENQ-2026-0005',
  body: 'CNC machine — now at Review',
  actionUrl: 'https://portal.example.com/dashboard/sales/enquiries/5',
  actionLabel: 'Open enquiry',
  eyebrow: 'Sales',
  intro: "It's now at Review and with you.",
  details: [['Customer', 'Acme'], ['Stage', 'Review'], ['Expected value', null], ['Owner', '']],
};

describe('Email templates', () => {
  test('notification email: subject, greeting, details, button and a plain-text twin', () => {
    const m = buildNotificationEmail(base);
    assert.equal(m.to, 'vbs@example.com');
    assert.equal(m.subject, 'Enquiry handed to you: ENQ-2026-0005 — Effee Portal');
    assert.match(m.html, /Hi Vishwas,/);
    assert.match(m.html, />Customer<\/td>/);
    assert.match(m.html, /href="https:\/\/portal\.example\.com\/dashboard\/sales\/enquiries\/5"/);
    assert.match(m.html, />Open enquiry<\/a>/);
    assert.match(m.text, /Customer: Acme/);
    assert.match(m.text, /Open enquiry: https:\/\/portal\.example\.com/);
  });

  test('empty detail values are left out', () => {
    const m = buildNotificationEmail(base);
    assert.doesNotMatch(m.html, /Expected value/);
    assert.doesNotMatch(m.text, /Owner:/);
  });

  test('user-entered text is escaped, never injected as HTML', () => {
    const m = buildNotificationEmail({
      ...base,
      title: '<script>alert(1)</script>',
      details: [['Customer', '<img src=x onerror=alert(1)>']],
    });
    assert.doesNotMatch(m.html, /<script>alert/);
    assert.doesNotMatch(m.html, /<img src=x/);
    assert.match(m.html, /&lt;script&gt;/);
  });

  test('only http(s) links become buttons', () => {
    const m = buildNotificationEmail({ ...base, actionUrl: 'javascript:alert(1)' });
    assert.doesNotMatch(m.html, /javascript:/);
    assert.doesNotMatch(m.html, /Open enquiry<\/a>/);
  });

  test('without a details table, the body line carries the information', () => {
    const m = buildNotificationEmail({ ...base, intro: undefined, details: undefined });
    assert.match(m.text, /CNC machine — now at Review/);
  });

  test('password reset and test emails use the same layout', () => {
    const reset = buildForgotPasswordEmail({ company: 'Effee Portal', to: 'a@b.c', userName: 'A', resetUrl: 'https://p.example/reset?token=t' });
    assert.match(reset.subject, /^Reset your password/);
    assert.match(reset.html, />Reset password<\/a>/);
    assert.match(reset.text, /https:\/\/p\.example\/reset\?token=t/);

    const t = buildTestEmail({ company: 'Effee Portal', to: 'a@b.c', portalUrl: 'https://p.example' });
    assert.match(t.subject, /^Email test/);
    assert.match(t.text, /Email is working/);
  });
});
