const crypto = require('crypto');
const config = require('../config/env');

/**
 * Authenticated symmetric encryption for secrets stored in the database.
 *
 * Motivation: SMTP credentials were held in plaintext. Anyone with read access
 * to the database — a backup file, a support query, a compromised replica, an
 * exposed phpMyAdmin — obtained a working mail account able to send as the
 * organisation. Application-level encryption means the database alone is not
 * enough; the key lives in the environment, separately from the data.
 *
 * ── Algorithm ────────────────────────────────────────────────────────────────
 * AES-256-GCM. GCM is authenticated: tampering with the ciphertext is detected
 * on decryption rather than silently yielding different plaintext. The IV is
 * random per encryption, so encrypting the same secret twice produces different
 * ciphertext and an observer cannot tell that two records share a value.
 *
 * ── Storage format ───────────────────────────────────────────────────────────
 *   v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>
 *
 * The version prefix is what makes key rotation and algorithm changes possible
 * later without guessing at how existing rows were written.
 */

/** Prefix identifying the current format. */
const FORMAT_VERSION = 'v1';

/** AES-256 requires a 32-byte key; GCM's standard IV is 12 bytes. */
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * Derives the encryption key.
 *
 * `ENCRYPTION_KEY` is preferred and should be 32 random bytes in base64 or hex.
 * When absent, the key is derived from `JWT_SECRET` via HKDF with a distinct
 * `info` label, so the application works out of the box without a second
 * secret to configure while never reusing the signing key directly for
 * encryption.
 *
 * Deriving from JWT_SECRET has a consequence worth stating plainly: rotating
 * JWT_SECRET makes existing ciphertext undecryptable. Set ENCRYPTION_KEY
 * explicitly in any environment where that matters.
 *
 * @returns {Buffer}
 */
function deriveKey() {
  const explicit = process.env.ENCRYPTION_KEY;

  if (explicit && explicit.trim()) {
    const raw = explicit.trim();
    const decoded = /^[0-9a-f]{64}$/i.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');

    if (decoded.length !== KEY_BYTES) {
      throw new Error(
        `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${decoded.length}). ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
      );
    }
    return decoded;
  }

  return Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(config.JWT.SECRET, 'utf8'), Buffer.alloc(0), 'effeeportal-field-encryption', KEY_BYTES)
  );
}

/** Cached so the derivation cost is paid once rather than per operation. */
let cachedKey = null;

/** @returns {Buffer} */
function getKey() {
  if (!cachedKey) cachedKey = deriveKey();
  return cachedKey;
}

/**
 * Encrypts a value for storage.
 *
 * @param {string|null|undefined} plaintext
 * @returns {string|null} Encoded ciphertext, or null when there is nothing to
 *   encrypt — callers store null rather than an encrypted empty string.
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);

  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Decrypts a stored value.
 *
 * Values that are not in the expected format are returned unchanged. That is
 * deliberate: rows written before encryption was introduced hold plaintext, and
 * this lets them keep working until the next save re-writes them encrypted,
 * rather than requiring a data migration before the feature functions.
 *
 * @param {string|null|undefined} encoded
 * @returns {string|null}
 */
function decrypt(encoded) {
  if (!encoded) return null;

  const parts = String(encoded).split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    return String(encoded);
  }

  const [, ivB64, tagB64, dataB64] = parts;

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Authentication failure means the ciphertext was tampered with or the key
    // has changed. Returning null is safer than throwing: a settings page must
    // still render so an administrator can re-enter the credential.
    return null;
  }
}

/**
 * Reports whether a stored value is in encrypted form.
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${FORMAT_VERSION}:`) && value.split(':').length === 4;
}

module.exports = { encrypt, decrypt, isEncrypted };
