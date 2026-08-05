/**
 * Centralised, validated environment configuration.
 *
 * This module is the single source of truth for every environment variable the
 * application reads. Nothing else in the codebase should touch `process.env`
 * directly — that keeps configuration auditable and makes missing or malformed
 * values fail loudly at boot instead of silently at request time.
 *
 * Validation policy:
 *   - production  → invalid configuration throws and the process refuses to start.
 *   - development → invalid configuration logs a prominent warning but boots,
 *                   so local work is never blocked by a weak throwaway secret.
 */

require('dotenv').config();

const NODE_ENV      = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

/** Minimum acceptable length for the JWT signing secret (256 bits of hex/base64). */
const MIN_JWT_SECRET_LENGTH = 32;

/** Errors collected during validation, reported together rather than one at a time. */
const problems = [];

/**
 * Reads a required variable, recording a problem when it is absent.
 * @param {string} key
 * @returns {string}
 */
function required(key) {
  const value = process.env[key];
  if (!value || !value.trim()) {
    problems.push(`${key} is not set`);
    return '';
  }
  return value.trim();
}

/**
 * Reads an integer variable, falling back to a default when unset or malformed.
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
function integer(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    problems.push(`${key} must be an integer (received "${raw}")`);
    return fallback;
  }
  return parsed;
}

/**
 * Reads a comma-separated list into a trimmed, non-empty array.
 * @param {string} key
 * @param {string[]} fallback
 * @returns {string[]}
 */
function list(key, fallback) {
  const raw = process.env[key];
  if (!raw || !raw.trim()) return fallback;
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

const JWT_SECRET = required('JWT_SECRET');
if (JWT_SECRET && JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
  problems.push(
    `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters ` +
    `(received ${JWT_SECRET.length}). Generate one with: ` +
    `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
  );
}

required('DATABASE_URL');

const config = Object.freeze({
  NODE_ENV,
  IS_PRODUCTION,

  /** HTTP port the Express server binds to. */
  PORT: integer('PORT', 4000),

  /**
   * Number of reverse proxies in front of this app. Express uses this to decide
   * how far to walk X-Forwarded-For when resolving `req.ip`. It matters for
   * security: rate limiting keyed on a spoofable IP provides no protection.
   * Leave at 0 when the app is exposed directly.
   */
  TRUST_PROXY_HOPS: integer('TRUST_PROXY_HOPS', 0),

  JWT: {
    SECRET:     JWT_SECRET,
    EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    /**
     * Pinned explicitly so a forged token cannot request a weaker algorithm.
     * Verifying without this allows the "alg: none" and HS/RS confusion classes
     * of attack against libraries that honour the token's own header.
     */
    ALGORITHM:  'HS256',
  },

  /**
   * Browser origins permitted to call this API. Defaults to the local frontend
   * so development needs no configuration; production must set it explicitly.
   */
  ALLOWED_ORIGINS: list('ALLOWED_ORIGIN', ['http://localhost:3000']),

  /**
   * bcrypt work factor. 12 is the current sensible floor for new applications;
   * raising it later is safe because the cost is embedded in each stored hash.
   */
  BCRYPT_ROUNDS: integer('BCRYPT_ROUNDS', 12),

  /**
   * Web Push (VAPID) credentials for browser notifications. All optional — when
   * a key is absent, push is simply disabled (in-app notifications still work),
   * so development and un-configured environments boot fine. Generate a pair
   * with: `node -e "console.log(require('web-push').generateVAPIDKeys())"`.
   */
  WEB_PUSH: {
    PUBLIC_KEY:  process.env.VAPID_PUBLIC_KEY || '',
    PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
    SUBJECT:     process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },
});

if (problems.length > 0) {
  const summary = problems.map((problem) => `  • ${problem}`).join('\n');

  if (IS_PRODUCTION) {
    throw new Error(`Invalid environment configuration:\n${summary}`);
  }

  console.warn(
    `\n⚠️  Environment configuration problems (tolerated in ${NODE_ENV}, ` +
    `fatal in production):\n${summary}\n`
  );
}

module.exports = config;
