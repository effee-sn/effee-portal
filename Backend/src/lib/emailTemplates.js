const prisma = require('./prisma');

/**
 * Email templates.
 *
 * One branded layout for every email the portal sends. Built the way email
 * clients need it: table layout and inline styles (Outlook and Gmail strip
 * <style> blocks), a hidden preheader (the inbox preview line), and a
 * plain-text version alongside the HTML — HTML-only mail scores worse with
 * spam filters.
 *
 * Each builder returns { to, subject, html, text }.
 */

const BRAND = Object.freeze({
  primary: '#875A7B',     // Effee plum (matches the portal)
  primaryDark: '#6D4A62',
  ink: '#1f2937',
  muted: '#6b7280',
  faint: '#9ca3af',
  line: '#e5e7eb',
  page: '#f4f1f3',
  panel: '#faf7f9',
});

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

async function getCompanyName() {
  const s = await prisma.companySettings.findFirst();
  return s?.company_name || 'Effee Portal';
}

/** Escapes text for safe interpolation into HTML (titles can be user-entered). */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) links are ever put in an href. */
const safeUrl = (url) => (/^https?:\/\//i.test(String(url || '')) ? String(url) : null);

/**
 * The shared layout.
 * @param {{ company: string, preheader?: string, eyebrow?: string, heading: string,
 *   intro?: string, paragraphs?: string[], details?: Array<[string, string]>,
 *   action?: { label: string, url: string }, note?: string, reason?: string }} p
 *   Every string is plain text — escaped here.
 */
function renderLayout(p) {
  const e = escapeHtml;
  const initial = e((p.company || 'E').trim().charAt(0).toUpperCase());
  const url = p.action && safeUrl(p.action.url);
  const details = (p.details || []).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');

  const para = (txt, extra = '') =>
    `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.ink};${extra}">${e(txt)}</p>`;

  const detailRows = details.map(([label, value], i) => `
          <tr>
            <td style="padding:9px 14px;font-family:${FONT};font-size:13px;color:${BRAND.muted};width:38%;vertical-align:top;${i ? `border-top:1px solid ${BRAND.line};` : ''}">${e(label)}</td>
            <td style="padding:9px 14px;font-family:${FONT};font-size:13px;color:${BRAND.ink};font-weight:600;vertical-align:top;${i ? `border-top:1px solid ${BRAND.line};` : ''}">${e(value)}</td>
          </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${e(p.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(p.preheader || p.intro || p.heading)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.page};">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:10px;">
          <tr>
            <td style="background:${BRAND.primary};padding:18px 28px;border-radius:10px 10px 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:34px;height:34px;background:#ffffff;border-radius:7px;text-align:center;vertical-align:middle;font-family:${FONT};font-size:18px;font-weight:800;color:${BRAND.primary};">${initial}</td>
                  <td style="padding-left:12px;font-family:${FONT};font-size:17px;font-weight:700;color:#ffffff;">${e(p.company)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              ${p.eyebrow ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.primary};">${e(p.eyebrow)}</p>` : ''}
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:21px;line-height:1.35;font-weight:700;color:${BRAND.ink};">${e(p.heading)}</h1>
              ${p.intro ? para(p.intro) : ''}
              ${(p.paragraphs || []).map((t) => para(t)).join('')}
              ${details.length ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:8px;">${detailRows}
              </table>` : ''}
              ${url ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px;">
                <tr>
                  <td style="background:${BRAND.primary};border-radius:7px;">
                    <a href="${e(url)}" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:7px;">${e(p.action.label)}</a>
                  </td>
                </tr>
              </table>` : ''}
              ${p.note ? `<p style="margin:0 0 16px;font-family:${FONT};font-size:12.5px;line-height:1.55;color:${BRAND.muted};">${e(p.note)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;border-top:1px solid ${BRAND.line};">
              <p style="margin:0;font-family:${FONT};font-size:11.5px;line-height:1.55;color:${BRAND.faint};">
                ${p.reason ? `${e(p.reason)}<br>` : ''}This is an automated message from ${e(p.company)} — please don't reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** The plain-text twin of a layout. */
function renderText(p) {
  const lines = [p.company, ''];
  if (p.eyebrow) lines.push(p.eyebrow.toUpperCase());
  lines.push(p.heading, '');
  if (p.intro) lines.push(p.intro, '');
  for (const t of p.paragraphs || []) lines.push(t, '');
  const details = (p.details || []).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  if (details.length) {
    for (const [label, value] of details) lines.push(`${label}: ${value}`);
    lines.push('');
  }
  const url = p.action && safeUrl(p.action.url);
  if (url) lines.push(`${p.action.label}: ${url}`, '');
  if (p.note) lines.push(p.note, '');
  lines.push('—');
  if (p.reason) lines.push(p.reason);
  lines.push(`Automated message from ${p.company}. Please don't reply.`);
  return lines.join('\n');
}

const render = (p) => ({ html: renderLayout(p), text: renderText(p) });

// ── In-app notification, mirrored to email ───────────────────────────────────
/**
 * Pure builder (no database) — used by `notification()` and by tests.
 *
 * @param {{ company: string, to: string, userName?: string, title: string, body?: string|null,
 *   actionUrl?: string|null, actionLabel?: string, eyebrow?: string, intro?: string,
 *   details?: Array<[string, string]>, reason?: string }} p
 */
function buildNotificationEmail(p) {
  const hasDetails = Boolean(p.details?.length);
  const paragraphs = [`Hi ${p.userName || 'there'},`];
  if (p.intro) paragraphs.push(p.intro);
  // The bell's one-line body, unless an intro + details table already say it.
  if (p.body && !(p.intro && hasDetails)) paragraphs.push(p.body);

  return {
    to: p.to,
    subject: `${p.title} — ${p.company}`,
    ...render({
      company: p.company,
      preheader: p.intro || p.body || p.title,
      eyebrow: p.eyebrow,
      heading: p.title,
      paragraphs,
      details: p.details,
      action: p.actionUrl ? { label: p.actionLabel || 'Open in portal', url: p.actionUrl } : null,
      reason: p.reason,
    }),
  };
}

/**
 * Email for any in-app notification: the same title as the bell, plus the
 * details that matter for the event and a button into the portal.
 * @param {Parameters<typeof buildNotificationEmail>[0]} params (company is looked up)
 */
async function notification(params) {
  return buildNotificationEmail({ ...params, company: await getCompanyName() });
}

// ── Password reset ───────────────────────────────────────────────────────────
function buildForgotPasswordEmail({ company, to, userName, resetUrl }) {
  return {
    to,
    subject: `Reset your password — ${company}`,
    ...render({
      company,
      preheader: 'Use this link to set a new password. It expires in 1 hour.',
      eyebrow: 'Account',
      heading: 'Reset your password',
      paragraphs: [
        `Hi ${userName || 'there'},`,
        'We received a request to reset your password. Use the button below to set a new one.',
      ],
      action: { label: 'Reset password', url: resetUrl },
      note: `This link expires in 1 hour. If you didn't ask for a reset, ignore this email — your password stays the same. If the button doesn't work, paste this link into your browser: ${resetUrl}`,
      reason: 'You\'re receiving this because a password reset was requested for your account.',
    }),
  };
}

async function forgotPassword(params) {
  return buildForgotPasswordEmail({ ...params, company: await getCompanyName() });
}

// ── Settings → "Send test email" ─────────────────────────────────────────────
function buildTestEmail({ company, to, portalUrl }) {
  return {
    to,
    subject: `Email test — ${company}`,
    ...render({
      company,
      preheader: 'Email from the portal is working.',
      eyebrow: 'Test',
      heading: 'Email is working',
      paragraphs: ['This test email from the portal arrived, so notification emails can be delivered to this mailbox.'],
      details: [['Sent at', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })]],
      action: portalUrl ? { label: 'Open the portal', url: portalUrl } : null,
      reason: 'You\'re receiving this because an administrator sent a test from Settings.',
    }),
  };
}

async function testEmail(params) {
  return buildTestEmail({ ...params, company: await getCompanyName() });
}

module.exports = {
  escapeHtml,
  notification,
  forgotPassword,
  testEmail,
  // Pure builders (no database) — for tests and previews.
  buildNotificationEmail,
  buildForgotPasswordEmail,
  buildTestEmail,
};
