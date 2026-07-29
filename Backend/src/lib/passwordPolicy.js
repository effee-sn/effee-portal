/**
 * Password policy enforced at every point a password enters the system:
 * user creation, self-service change, and reset-by-token.
 *
 * Kept deliberately small and dependency-free. The rules favour length over
 * character-class gymnastics, which is the modern guidance (NIST SP 800-63B):
 * a long passphrase beats a short string padded with symbols.
 */

/** Minimum accepted password length. */
const MIN_LENGTH = 8;

/**
 * Maximum accepted length. bcrypt silently truncates input beyond 72 bytes, so
 * accepting longer values would give users a false sense of added strength.
 */
const MAX_LENGTH = 72;

/**
 * Passwords rejected outright regardless of length. Intentionally short — this
 * is a guard against the most trivial choices, not a substitute for a breach
 * corpus check, which belongs in a later iteration backed by a real dataset.
 */
const BLOCKLIST = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'admin123', 'letmein1', 'welcome1', 'iloveyou',
  'changeme', 'admin@123', 'password@123',
]);

/**
 * Validates a candidate password against the policy.
 *
 * @param {unknown} password Raw value straight off the request body.
 * @returns {{ valid: boolean, message?: string }} `message` is safe to return
 *   to the client verbatim; it never echoes the submitted value.
 */
function validatePassword(password) {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password must be a string' };
  }

  if (password.length < MIN_LENGTH) {
    return { valid: false, message: `Password must be at least ${MIN_LENGTH} characters` };
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_LENGTH) {
    return { valid: false, message: `Password must not exceed ${MAX_LENGTH} bytes` };
  }

  // Reject whitespace-only padding used to game the length requirement.
  if (!password.trim()) {
    return { valid: false, message: 'Password cannot be blank' };
  }

  if (BLOCKLIST.has(password.toLowerCase())) {
    return { valid: false, message: 'Password is too common. Please choose a stronger one.' };
  }

  // Require at least two distinct character classes so "aaaaaaaa" is rejected
  // without imposing a rigid upper/lower/digit/symbol matrix on passphrases.
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;

  if (classes < 2) {
    return {
      valid: false,
      message: 'Password must combine at least two of: lowercase, uppercase, numbers, symbols',
    };
  }

  return { valid: true };
}

module.exports = { validatePassword, MIN_LENGTH, MAX_LENGTH };
