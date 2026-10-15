/**
 * Audit log — which ids in a change payload are people, pinned down.
 *
 * Run:  node --test tests/unit/auditNames.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { collectUserIds } = require('../../src/modules/audit/audit.service');

const ids = (changes) => { const out = []; collectUserIds(changes, out); return out.sort((a, b) => a - b); };

describe('audit: user ids in change details', () => {
  test('user-id keys, including inside { from, to } diffs', () => {
    assert.deepEqual(ids({ owner_id: { from: 3, to: 7 }, handler_id: 9, stage: 'REVIEW' }), [3, 7, 9]);
    assert.deepEqual(ids({ internal_user_id: '87', assigned_user_id: null }), [87]);
    assert.deepEqual(ids({ created_by: 4, head_user_id: 5 }), [4, 5]);
  });

  test('other numbers are left alone', () => {
    assert.deepEqual(ids({ enquiry_id: 12, probability: 40, role_id: 2, offer_value: 100000 }), []);
    assert.deepEqual(ids({ items: [{ stage: 'NEW', probability: 10 }] }), []);
  });

  test('nested objects and arrays are searched; junk is safe', () => {
    assert.deepEqual(ids({ task: { lead_user_id: 6 }, list: [{ resolver_user_id: 8 }] }), [6, 8]);
    assert.deepEqual(ids(null), []);
    assert.deepEqual(ids('not json'), []);
  });
});
