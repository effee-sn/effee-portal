const { ssoService } = require('./auth.service');
const { ApiResponse } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/** Microsoft sign-in (SSO) HTTP controller. */

/** `GET /auth/sso/config` — public: what the login page should offer. */
const getSsoConfig = async (req, res) => {
  ApiResponse.ok(res, await ssoService.publicConfig());
};

/** `GET /auth/sso/microsoft/start` — redirects the browser to Microsoft. */
const startMicrosoft = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, await ssoService.start());
};

/** `GET /auth/sso/microsoft/callback` — Microsoft returns here; we redirect to the frontend. */
const microsoftCallback = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, await ssoService.callback(req.query, requestContext(req)));
};

/** `GET /settings/sso` — admin: switches + configuration status. */
const getSsoSettings = async (req, res) => {
  ApiResponse.ok(res, await ssoService.adminStatus());
};

/** `PUT /settings/sso` — admin: change the switches. */
const updateSsoSettings = async (req, res) => {
  ApiResponse.ok(res, await ssoService.updateSettings(req.body, requestContext(req)));
};

module.exports = { getSsoConfig, startMicrosoft, microsoftCallback, getSsoSettings, updateSsoSettings };
