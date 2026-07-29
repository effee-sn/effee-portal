const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// The crypto module derives its key from configuration, so the environment has
// to be established before it is required.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-characters-long';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const { encrypt, decrypt, isEncrypted } = require('../../src/lib/crypto');

describe('crypto (field encryption)', () => {
  test('round-trips a value', () => {
    const secret = 'my-smtp-password-123';
    assert.equal(decrypt(encrypt(secret)), secret);
  });

  test('round-trips unicode and long values', () => {
    for (const value of ['pässwörd-with-ümlauts-😀', 'x'.repeat(5000), '{"json":"payload"}']) {
      assert.equal(decrypt(encrypt(value)), value);
    }
  });

  test('produces different ciphertext for the same plaintext', () => {
    // A random IV per encryption is what stops an observer inferring that two
    // records hold the same secret.
    const a = encrypt('identical');
    const b = encrypt('identical');

    assert.notEqual(a, b, 'ciphertext must not be deterministic');
    assert.equal(decrypt(a), decrypt(b));
  });

  test('ciphertext does not contain the plaintext', () => {
    const secret = 'SuperSecretValue';
    assert.ok(!encrypt(secret).includes(secret));
  });

  test('returns null for empty input rather than encrypting nothing', () => {
    for (const value of [null, undefined, '']) {
      assert.equal(encrypt(value), null);
    }
  });

  test('detects tampering and fails closed', () => {
    const encrypted = encrypt('important-value');
    const tampered = `${encrypted.slice(0, -6)}AAAAAA`;

    // GCM authenticates the ciphertext, so a modified payload must not decrypt
    // to anything — silently returning different plaintext would be far worse.
    assert.equal(decrypt(tampered), null);
  });

  test('passes through legacy plaintext unchanged', () => {
    // Rows written before encryption was introduced must keep working until
    // the next save rewrites them.
    assert.equal(decrypt('legacy-plaintext-password'), 'legacy-plaintext-password');
  });

  test('returns null for empty input on decrypt', () => {
    assert.equal(decrypt(null), null);
    assert.equal(decrypt(''), null);
  });

  describe('isEncrypted', () => {
    test('recognises the versioned format', () => {
      assert.equal(isEncrypted(encrypt('value')), true);
    });

    test('rejects plaintext and malformed values', () => {
      for (const value of ['plaintext', 'v1:only:three', '', null, undefined, 42]) {
        assert.equal(isEncrypted(value), false, `should not treat ${value} as encrypted`);
      }
    });
  });
});
