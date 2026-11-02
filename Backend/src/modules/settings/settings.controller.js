const { settingsService } = require('./settings.service');
const { sendTestMail } = require('../../lib/mailer');
const { testEmail: testEmailTemplate } = require('../../lib/emailTemplates');
const config = require('../../config/env');
const { BadRequestError, ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');
const fileStore = require('../../lib/fileStore');
const { storageService } = require('./storage.service');

/**
 * Settings HTTP controller. SMTP is configured from `.env`, not here; the
 * test-email endpoint exercises that environment configuration.
 */

/**
 * `GET /settings` — filtered by the caller's role in the service.
 *
 * @type {import('express').RequestHandler}
 */
const getSettings = async (req, res) => {
  res.json(await settingsService.get(req.user));
};

/**
 * `GET /settings/branding` — public company branding (name + logo only). No
 * auth, so the login screen, favicon, and the installable web-app manifest can
 * read it. Passing no actor yields only the public-field projection.
 *
 * @type {import('express').RequestHandler}
 */
const getBranding = async (req, res) => {
  res.json(await settingsService.get());
};

/** @type {import('express').RequestHandler} */
const updateCompanyInfo = async (req, res) => {
  res.json(await settingsService.updateCompanyInfo(req.body));
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

  try {
    // Same branded layout as every notification email (text is escaped there).
    await sendTestMail(await testEmailTemplate({ to: test_to, portalUrl: config.ALLOWED_ORIGINS[0] }));
  } catch (err) {
    // Admin-only config test: surface the real SMTP reason (timeout, bad login,
    // relay denied, …) instead of a generic 500 the admin can't act on.
    throw new BadRequestError(`Could not send test email: ${err.message}`);
  }

  res.json({ message: `Test email sent to ${test_to}` });
};

/**
 * `POST /settings/logo`
 *
 * @type {import('express').RequestHandler}
 */
const uploadLogo = async (req, res) => {
  if (!req.file) throw new BadRequestError('No file uploaded');

  // To Blob when Blob storage is on; the URL stays /uploads/… either way.
  await fileStore.saveFile(`uploads/logos/${req.file.filename}`, req.file.path, req.file.mimetype);
  const result = await settingsService.setLogo(`/uploads/logos/${req.file.filename}`);
  res.json(result);
};

/** `GET /settings/storage` — where files are kept, Blob set-up, the last transfer. */
const getStorage = async (req, res) => ApiResponse.ok(res, await storageService.status());

/** `PUT /settings/storage` — switch the store (and optionally copy the files there). */
const updateStorage = async (req, res) => {
  ApiResponse.ok(res, await storageService.update(req.body, requestContext(req)));
};

/** `POST /settings/storage/transfer` — copy the files again (after failures or an interruption). */
const transferStorage = async (req, res) => {
  ApiResponse.ok(res, await storageService.transfer(req.body.direction, requestContext(req)));
};

module.exports = {
  getStorage,
  updateStorage,
  transferStorage,
  getSettings,
  getBranding,
  updateCompanyInfo,
  updateSecuritySettings,
  testEmail,
  uploadLogo,
};
