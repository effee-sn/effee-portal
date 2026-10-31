/**
 * Sales: an enquiry's current value — PO once won, else the latest offer sent,
 * else the expected value — and its rupee amount, pinned down (it is money).
 *
 * Run:  node --test tests/unit/currentValue.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { currentValue, inInr, valueFields } = require('../../src/modules/sales/currentValue');

const rates = { INR: 1, USD: 84, EUR: 90 };
const sent = (value, stage = 'OFFER_RELEASED', fx = 1, day = '2026-10-01') => ({ offer_value: value, offer_fx_rate: fx, sent_at: new Date(day), stage, version: 1 });

describe('sales: current value of an enquiry', () => {
  test('nothing sent: the expected value, at today’s rate', () => {
    const cv = currentValue({ stage: 'COSTING', expected_value: '1200000.00', currency_code: 'INR' }, undefined);
    assert.deepEqual([cv.amount, cv.basis], [1200000, 'EXPECTED']);
    assert.equal(inInr(cv, rates), 1200000);
  });

  test('no expected value and nothing sent: no value (blank, never ₹0)', () => {
    const cv = currentValue({ stage: 'NEW', expected_value: null, currency_code: 'INR' }, undefined);
    assert.deepEqual([cv.amount, cv.basis], [null, null]);
    assert.equal(inInr(cv, rates), null);
  });

  test('an offer sent replaces the expected value', () => {
    const cv = currentValue({ stage: 'FOLLOW_UP', expected_value: 1500000, currency_code: 'INR' }, sent('1350000.00'));
    assert.deepEqual([cv.amount, cv.basis], [1350000, 'OFFER']);
  });

  test('a revised offer sent at Negotiation is the negotiated value', () => {
    const cv = currentValue({ stage: 'NEGOTIATION_FOLLOW_UP', expected_value: 1500000, currency_code: 'INR' }, sent(1250000, 'NEGOTIATION'));
    assert.deepEqual([cv.amount, cv.basis], [1250000, 'NEGOTIATION']);
  });

  test('won: the PO value, even when offers were sent', () => {
    const cv = currentValue({ stage: 'WON', expected_value: 1500000, order_value: '1180000.50', order_fx_rate: 1, currency_code: 'INR' }, sent(1250000, 'NEGOTIATION'));
    assert.deepEqual([cv.amount, cv.basis], [1180000.5, 'PO']);
    assert.equal(inInr(cv, rates), 1180000.5);
  });

  test('won without a PO value (old data): the last offer sent, not the estimate', () => {
    const cv = currentValue({ stage: 'WON', expected_value: 900, order_value: null, currency_code: 'INR' }, sent(1000));
    assert.deepEqual([cv.amount, cv.basis], [1000, 'OFFER']);
  });

  test('foreign currency: an offer converts at the rate locked when sent, not today’s', () => {
    const cv = currentValue({ stage: 'FOLLOW_UP', expected_value: 20000, currency_code: 'USD' }, sent(10000, 'OFFER_RELEASED', 83.5));
    assert.equal(cv.currency, 'USD');
    assert.equal(inInr(cv, rates), 835000, '10,000 × 83.5 (locked), not × 84');
  });

  test('foreign currency: the expected value converts at today’s rate; a PO at its won rate', () => {
    assert.equal(inInr(currentValue({ stage: 'REVIEW', expected_value: 100, currency_code: 'EUR' }), rates), 9000);
    assert.equal(inInr(currentValue({ stage: 'WON', order_value: 100, order_fx_rate: 88, currency_code: 'EUR' }), rates), 8800);
  });

  test('paise are kept exactly', () => {
    const cv = currentValue({ stage: 'FOLLOW_UP', currency_code: 'USD' }, sent('1234.57', 'OFFER_RELEASED', 83.33));
    assert.equal(inInr(cv, rates), 102876.72); // 1234.57 × 83.33 = 102,876.7181 → 102,876.72
  });

  test('the fields screens use', () => {
    const v = valueFields({ stage: 'FOLLOW_UP', expected_value: 5, currency_code: 'INR' }, sent(7), rates);
    assert.deepEqual(v, { current_value: 7, current_value_basis: 'OFFER', current_value_label: 'Offer', current_value_inr: 7 });
  });
});
