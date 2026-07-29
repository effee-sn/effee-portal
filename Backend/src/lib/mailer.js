const nodemailer = require('nodemailer');

const { settingsService } = require('../modules/settings/settings.service');
const { logger } = require('../core/logging/logger');

/**
 * Outbound mail.
 *
 * Configuration is read from the database rather than the environment so an
 * administrator can change SMTP settings without a redeploy. The stored
 * password is encrypted at rest and is decrypted by the settings service, so it
 * exists in plaintext only inside this module, for the duration of a send.
 *
 * Two entry points, distinguished by whether the administrator's
 * "email notifications" toggle applies:
 *
 *   - `sendMail`         — routine notifications. Honours the toggle.
 *   - `sendMailCritical` — password resets. Ignores the toggle, because a user
 *                          locked out of their account cannot be helped by a
 *                          preference that silently discards the only message
 *                          that would let them back in.
 */

/**
 * @param {object} config Decrypted mail configuration.
 * @returns {import('nodemailer').Transporter|null}
 */
function buildTransporter(config) {
  if (!config?.smtp_host || !config?.smtp_user || !config?.smtp_pass) return null;

  const port = config.smtp_port || 587;

  return nodemailer.createTransport({
    host: config.smtp_host,
    port,
    // Implicit TLS on 465; STARTTLS negotiated on other ports.
    secure: port === 465,
    auth: { user: config.smtp_user, pass: config.smtp_pass },
  });
}

/**
 * @param {object} config
 * @returns {string}
 */
function buildFromAddress(config) {
  const name  = config?.smtp_from_name  || config?.company_name || 'Effee Portal';
  const email = config?.smtp_from_email || config?.smtp_user    || '';
  return `"${name}" <${email}>`;
}

/**
 * @returns {Promise<boolean>} Whether SMTP credentials are present.
 */
async function isSmtpConfigured() {
  const config = await settingsService.getMailConfig();
  return Boolean(config?.smtp_host && config?.smtp_user && config?.smtp_pass);
}

/**
 * @returns {Promise<boolean>} Whether configured *and* enabled by the toggle.
 */
async function isEmailEnabled() {
  const config = await settingsService.getMailConfig();
  return Boolean(
    config?.email_notifications && config?.smtp_host && config?.smtp_user && config?.smtp_pass
  );
}

/**
 * Sends a routine notification, honouring the notifications toggle.
 *
 * Never throws: a failure to deliver a notification must not fail the business
 * operation that triggered it.
 *
 * @param {{ to: string, subject: string, html: string }} message
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
async function sendMail({ to, subject, html }) {
  try {
    const config = await settingsService.getMailConfig();

    if (!config?.email_notifications) return { sent: false, reason: 'Notifications disabled' };

    const transporter = buildTransporter(config);
    if (!transporter) return { sent: false, reason: 'SMTP not configured' };

    await transporter.sendMail({ from: buildFromAddress(config), to, subject, html });
    return { sent: true };
  } catch (err) {
    logger.error({ err }, 'Failed to send notification email');
    return { sent: false, reason: err.message };
  }
}

/**
 * Sends a critical message, ignoring the notifications toggle.
 *
 * @param {{ to: string, subject: string, html: string }} message
 * @returns {Promise<{ sent: boolean, skipped?: boolean, reason?: string }>}
 */
async function sendMailCritical({ to, subject, html }) {
  try {
    const config = await settingsService.getMailConfig();
    const transporter = buildTransporter(config);

    if (!transporter) {
      logger.warn('SMTP not configured — cannot send critical email');
      return { sent: false, skipped: true, reason: 'SMTP not configured' };
    }

    await transporter.sendMail({ from: buildFromAddress(config), to, subject, html });
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
  const config = await settingsService.requireMailConfig();
  const transporter = buildTransporter(config);

  await transporter.verify();
  await transporter.sendMail({ from: buildFromAddress(config), to, subject, html });
}

module.exports = { sendMail, sendMailCritical, sendTestMail, isEmailEnabled, isSmtpConfigured };
