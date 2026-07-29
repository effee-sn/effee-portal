const { settingsService } = require('./settings.service');
const { sendTestMail } = require('../../lib/mailer');
const { BadRequestError } = require('../../core');

/**
 * Settings HTTP controller.
 *
 * Response shapes are unchanged: the settings object with `smtp_pass` removed
 * and `smtp_pass_set` added, and `{ logo }` from the upload endpoint.
 */

/**
 * Escapes the five characters that carry meaning in HTML markup.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * `GET /settings` — filtered by the caller's role in the service.
 *
 * @type {import('express').RequestHandler}
 */
const getSettings = async (req, res) => {
  res.json(await settingsService.get(req.user));
};

/** @type {import('express').RequestHandler} */
const updateCompanyInfo = async (req, res) => {
  res.json(await settingsService.updateCompanyInfo(req.body));
};

/** @type {import('express').RequestHandler} */
const updateEmailSettings = async (req, res) => {
  res.json(await settingsService.updateEmailSettings(req.body));
};

/** @type {import('express').RequestHandler} */
const updateSecuritySettings = async (req, res) => {
  res.json(await settingsService.updateSecuritySettings(req.body));
};

/**
 * `POST /settings/test-email`
 *
 * @type {import('express').RequestHandler}
 */
const testEmail = async (req, res) => {
  const { test_to } = req.body;
  const settings = await settingsService.get(req.user);

  await sendTestMail({
    to: test_to,
    subject: 'Effee Portal — Email Test',
    // The company name is administrator-controlled and rendered into HTML, so
    // it is escaped rather than interpolated raw.
    html: `<p>This is a test email from <strong>${escapeHtml(settings.company_name || 'Effee Portal')}</strong>. `
        + 'Your email configuration is working correctly.</p>',
  });

  res.json({ message: `Test email sent to ${test_to}` });
};

/**
 * `POST /settings/logo`
 *
 * @type {import('express').RequestHandler}
 */
const uploadLogo = async (req, res) => {
  if (!req.file) throw new BadRequestError('No file uploaded');

  const result = await settingsService.setLogo(`/uploads/logos/${req.file.filename}`);
  res.json(result);
};

module.exports = {
  getSettings,
  updateCompanyInfo,
  updateEmailSettings,
  updateSecuritySettings,
  testEmail,
  uploadLogo,
};
