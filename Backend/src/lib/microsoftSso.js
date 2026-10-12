const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * Microsoft Entra ID (Azure AD) sign-in — OpenID Connect authorization-code
 * flow with PKCE, for a single tenant.
 *
 * Kept dependency-free on purpose: Node's fetch + crypto and the jsonwebtoken
 * package already in use cover everything. The ID token is verified in full —
 * signature against the tenant's published keys, issuer, audience, expiry and
 * nonce — before anything in it is trusted.
 *
 * @param {{ TENANT_ID: string, CLIENT_ID: string, CLIENT_SECRET: string, REDIRECT_URI: string }} cfg
 * @param {{ fetch?: typeof fetch, now?: () => number }} [deps] injectable for tests
 */
function createMicrosoftSso(cfg, deps = {}) {
  const doFetch = deps.fetch || fetch;
  const authority = `https://login.microsoftonline.com/${cfg.TENANT_ID}`;
  const issuer = `${authority}/v2.0`;
  const SCOPE = 'openid profile email';

  const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const random = (bytes = 32) => b64url(crypto.randomBytes(bytes));

  /** Signing keys by kid, refreshed hourly or when an unknown kid appears. */
  let keys = { at: 0, byKid: {} };
  async function signingKey(kid) {
    const fresh = Date.now() - keys.at < 60 * 60 * 1000;
    if (!fresh || !keys.byKid[kid]) {
      const res = await doFetch(`${authority}/discovery/v2.0/keys`);
      if (!res.ok) throw new Error(`Could not load Microsoft signing keys (${res.status})`);
      const { keys: jwks = [] } = await res.json();
      keys = {
        at: Date.now(),
        byKid: Object.fromEntries(jwks.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])),
      };
    }
    const key = keys.byKid[kid];
    if (!key) throw new Error('Unknown token signing key');
    return key;
  }

  return {
    /** All four settings present. */
    isConfigured() {
      return Boolean(cfg.TENANT_ID && cfg.CLIENT_ID && cfg.CLIENT_SECRET && cfg.REDIRECT_URI);
    },

    /** Names of the missing .env settings, for the admin screen. */
    missingSettings() {
      return [
        ['MS_SSO_TENANT_ID', cfg.TENANT_ID], ['MS_SSO_CLIENT_ID', cfg.CLIENT_ID],
        ['MS_SSO_CLIENT_SECRET', cfg.CLIENT_SECRET], ['MS_SSO_REDIRECT_URI', cfg.REDIRECT_URI],
      ].filter(([, v]) => !v).map(([k]) => k);
    },

    /**
     * A fresh sign-in request: the values to remember, and the URL to send the
     * browser to.
     * @returns {{ state: string, nonce: string, codeVerifier: string, url: string }}
     */
    beginSignIn() {
      const state = random(24);
      const nonce = random(24);
      const codeVerifier = random(48);
      const challenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
      const params = new URLSearchParams({
        client_id: cfg.CLIENT_ID,
        response_type: 'code',
        redirect_uri: cfg.REDIRECT_URI,
        response_mode: 'query',
        scope: SCOPE,
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return { state, nonce, codeVerifier, url: `${authority}/oauth2/v2.0/authorize?${params}` };
    },

    /**
     * Exchanges the returned code for tokens and verifies the ID token.
     * @param {{ code: string, codeVerifier: string, nonce: string }} p
     * @returns {Promise<object>} the verified ID-token claims
     */
    async completeSignIn({ code, codeVerifier, nonce }) {
      const res = await doFetch(`${authority}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.CLIENT_ID,
          client_secret: cfg.CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: cfg.REDIRECT_URI,
          code_verifier: codeVerifier,
          scope: SCOPE,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.id_token) {
        throw new Error(`Microsoft token exchange failed: ${body.error_description || body.error || res.status}`);
      }
      return this.verifyIdToken(body.id_token, nonce);
    },

    /**
     * Verifies an ID token: signature, issuer, audience, lifetime, nonce.
     * @param {string} idToken @param {string} nonce
     */
    async verifyIdToken(idToken, nonce) {
      const header = jwt.decode(idToken, { complete: true })?.header;
      if (!header?.kid) throw new Error('Malformed ID token');
      const key = await signingKey(header.kid);
      const claims = jwt.verify(idToken, key, {
        algorithms: ['RS256'],
        audience: cfg.CLIENT_ID,
        issuer,
        clockTolerance: 60,
      });
      if (claims.nonce !== nonce) throw new Error('ID token nonce mismatch');
      if (claims.tid && claims.tid !== cfg.TENANT_ID) throw new Error('ID token from another tenant');
      return claims;
    },

    /** The sign-in email: email claim, else the UPN. Lower-cased. */
    emailOf(claims) {
      return String(claims.email || claims.preferred_username || claims.upn || '').trim().toLowerCase();
    },

    /**
     * Group membership from the token's `groups` claim.
     * @returns {'member'|'not_member'|'unknown'} unknown = claim not in the
     *   token (not configured in Entra, or too many groups — "overage").
     */
    groupStatus(claims, groupId) {
      if (Array.isArray(claims.groups)) return claims.groups.includes(groupId) ? 'member' : 'not_member';
      return 'unknown';
    },
  };
}

module.exports = { createMicrosoftSso };
