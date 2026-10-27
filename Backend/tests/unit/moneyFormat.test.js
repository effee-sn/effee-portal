/**
 * Money in emails — rupees in lakh / crore, every other currency in
 * thousands / millions with its own decimal places. No database.
 *
 * Run:  node --test tests/unit/moneyFormat.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { money } = require('../../src/modules/sales/emailDetails');

describe('money()', () => {
  test('INR keeps Indian grouping', () => {
    assert.equal(money(3818181.82, 'INR', '₹'), '₹38,18,181.82');
    assert.equal(money(420000, 'INR', '₹'), '₹4,20,000.00');
  });

  test('other currencies: thousands and millions', () => {
    assert.equal(money(3818181.82, 'EUR', '€'), '€3,818,181.82');
    assert.equal(money(5000000, 'USD', '$'), '$5,000,000.00');
    assert.equal(money(1234.5, 'GBP', '£'), '£1,234.50');
  });

  test('decimal places follow the currency', () => {
    assert.equal(money(5000, 'JPY', '¥'), '¥5,000');
    assert.equal(money(1234567, 'KRW'), 'KRW 1,234,567');
  });

  test('no symbol: the code; a code Intl doesn\'t know: 2 decimals', () => {
    assert.equal(money(1500, 'AED'), 'AED 1,500.00');
    assert.equal(money(1500, 'ZZZ'), 'ZZZ 1,500.00');
  });

  test('nothing to show', () => {
    assert.equal(money(null), null);
    assert.equal(money('abc'), null);
  });
});
