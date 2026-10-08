const nodemailer = require('nodemailer');

const config = require('../config/env');
const { logger } = require('../core/logging/logger');

/**
 * Outbound mail.
 *
 * SMTP is configured entirely from the environment (`SMTP_*` in `.env`, read
 * through `config.MAIL`) — nothing is stored in the database. Changing it needs
 * a restart.
 *
 * Two entry points, distinguished by whether `EMAIL_NOTIFICATIONS` applies:
 *
 *   - `sendMail`         — routine notifications. Honours the switch.
 *   - `sendMailCritical` — password resets. Ignores the switch, because a user
 *                          locked out of their account cannot be helped by a
 *                          setting that silently discards the only message
 *                          that would let them back in.
 */

const MAIL = config.MAIL;

/** True when host, user and password are all present. */
function isSmtpConfigured() {
  return Boolean(MAIL.HOST && MAIL.USER && MAIL.PASS);
}

/** True when SMTP is configured *and* notification emails are switched on. */
function isEmailEnabled() {
  return MAIL.NOTIFICATIONS && isSmtpConfigured();
}

/** Built once and reused — nodemailer pools the connection. */
let transporter = null;

/** @returns {import('nodemailer').Transporter|null} */
function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: MAIL.HOST,
      port: MAIL.PORT,
      // Implicit TLS on 465; STARTTLS negotiated on other ports.
      secure: MAIL.PORT === 465,
      auth: { user: MAIL.USER, pass: MAIL.PASS },
      // Fail fast with a clear error instead of hanging for ~30s when the SMTP
      // host is unreachable (e.g. outbound port blocked, wrong host/port).
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

/** @returns {string} */
function fromAddress() {
  const name  = MAIL.FROM_NAME  || 'Effee Portal';
  const email = MAIL.FROM_EMAIL || MAIL.USER;
  return `"${name}" <${email}>`;
}

/**
 * Sends a routine notification, honouring `EMAIL_NOTIFICATIONS`.
 *
 * Never throws: a failure to deliver a notification must not fail the business
 * operation that triggered it.
 *
 * @param {{ to: string, subject: string, html: string }} message
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
async function sendMail({ to, subject, html }) {
  try {
    if (!MAIL.NOTIFICATIONS) return { sent: false, reason: 'Notifications disabled' };
    const t = getTransporter();
    if (!t) return { sent: false, reason: 'SMTP not configured' };

    await t.sendMail({ from: fromAddress(), to, subject, html });
    return { sent: true };
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send notification email');
    return { sent: false, reason: err.message };
  }
}

/**
 * Sends a critical message (password reset), ignoring `EMAIL_NOTIFICATIONS`.
 *
 * @param {{ to: string, subject: string, html: string }} message
 * @returns {Promise<{ sent: boolean, skipped?: boolean, reason?: string }>}
 */
async function sendMailCritical({ to, subject, html }) {
  try {
    const t = getTransporter();
    if (!t) {
      logger.warn('SMTP not configured — cannot send critical email');
      return { sent: false, skipped: true, reason: 'SMTP not configured' };
    }
    await t.sendMail({ from: fromAddress(), to, subject, html });
    return { sent: true };
  } catch (err) {
    logger.error({ err }, 'Failed to send critical email');
    return { sent: false, skipped: true, reason: err.message };
  }
}

/**
 * Verifies SMTP connectivity and sends a test message.
 *
 * Unlike the functions above this one throws, because the caller is an
 * administrator explicitly testing the configuration and needs the failure.
 *
 * @param {{ to: string, subject: string, html: string }} message
 * @returns {Promise<void>}
 */
async function sendTestMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env and restart.');
  await t.verify();
  await t.sendMail({ from: fromAddress(), to, subject, html });
}

module.exports = { sendMail, sendMailCritical, sendTestMail, isEmailEnabled, isSmtpConfigured };
