const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { validatePassword, MIN_LENGTH } = require('../../src/lib/passwordPolicy');

describe('passwordPolicy', () => {
  describe('rejects', () => {
    test('non-string input', () => {
      for (const value of [undefined, null, 12345678, {}, []]) {
        assert.equal(validatePassword(value).valid, false, `should reject ${typeof value}`);
      }
    });

    test('passwords shorter than the minimum', () => {
      const result = validatePassword('Ab1!');
      assert.equal(result.valid, false);
      assert.match(result.message, new RegExp(String(MIN_LENGTH)));
    });

    test('whitespace-only padding used to game the length check', () => {
      assert.equal(validatePassword('          ').valid, false);
    });

    test('a single character class', () => {
      assert.equal(validatePassword('aaaaaaaa').valid, false, 'lowercase only');
      assert.equal(validatePassword('AAAAAAAA').valid, false, 'uppercase only');
      assert.equal(validatePassword('12345678').valid, false, 'digits only');
    });

    test('common passwords regardless of composition', () => {
      for (const password of ['password123', 'Password123', 'admin@123', 'PASSWORD@123']) {
        assert.equal(validatePassword(password).valid, false, `should reject "${password}"`);
      }
    });

    test('values exceeding bcrypt\'s 72-byte input limit', () => {
      // Silently truncating would give a false sense of added strength.
      assert.equal(validatePassword(`${'a'.repeat(70)}B1`).valid, true);
      assert.equal(validatePassword(`${'a'.repeat(80)}B1`).valid, false);
    });

    test('multibyte input measured in bytes, not characters', () => {
      // 30 emoji are 30 characters but 120 bytes — over the bcrypt limit.
      assert.equal(validatePassword(`${'😀'.repeat(30)}A1`).valid, false);
    });
  });

  describe('accepts', () => {
    test('two or more character classes at sufficient length', () => {
      const valid = [
        'Str0ngPass',       // upper + lower + digit
        'correct-horse1',   // lower + digit + symbol
        'MyPassphrase!',    // upper + lower + symbol
        'aB3$xY9#zQ2',
      ];

      for (const password of valid) {
        const result = validatePassword(password);
        assert.equal(result.valid, true, `should accept "${password}": ${result.message}`);
      }
    });

    test('a password exactly at the minimum length', () => {
      assert.equal(validatePassword('Abcdefg1').valid, true);
    });
  });

  test('returns a client-safe message that never echoes the input', () => {
    const secret = 'hunter2';
    const result = validatePassword(secret);

    assert.equal(result.valid, false);
    assert.ok(!result.message.includes(secret), 'message must not contain the submitted password');
  });
});
